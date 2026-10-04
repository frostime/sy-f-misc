// ============================================================================
// GPT 协议 usage 归一化测试（离线 node，无 SiYuan 运行时依赖）
// 语义基准见 .dev/changes/26-10-04T06-45_gpt-subtree-response-compat/reference/protocol-evidence.md
// ============================================================================
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    normalizeClaudeUsage,
    normalizeGeminiUsage,
    normalizeOpenAIUsage,
    parseClaudeResponse,
    parseGeminiResponse,
    parseOpenAINonStream,
} from '../src/func/gpt/openai/response-parse.js';

// ---------------------------------------------------------------------------
// OpenAI 兼容 Chat Completions
// ---------------------------------------------------------------------------

test('OpenAI: usage details preserved incl. supplied standard fields', () => {
    const usage = normalizeOpenAIUsage({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 4, audio_tokens: 1, image_tokens: 2 },
        completion_tokens_details: { reasoning_tokens: 3, audio_tokens: 1, accepted_prediction_tokens: 0, rejected_prediction_tokens: 0 },
    });
    assert.equal(usage?.prompt_tokens, 10);
    assert.equal(usage?.completion_tokens, 5);
    assert.equal(usage?.total_tokens, 15);
    assert.equal(usage?.prompt_tokens_details?.cached_tokens, 4);
    assert.equal(usage?.prompt_tokens_details?.audio_tokens, 1);
    assert.equal(usage?.prompt_tokens_details?.image_tokens, 2);
    assert.equal(usage?.completion_tokens_details?.reasoning_tokens, 3);
    assert.equal(usage?.completion_tokens_details?.accepted_prediction_tokens, 0); // 显式 0 保留
    assert.equal(usage?.completion_tokens_details?.rejected_prediction_tokens, 0);
});

test('OpenAI: missing usage is null, partial usage never fabricates zero', () => {
    assert.equal(normalizeOpenAIUsage(null), null);
    assert.equal(normalizeOpenAIUsage(undefined), null);
    assert.equal(normalizeOpenAIUsage({}), null); // 全未知 → null，而非 0 填充
    const partial = normalizeOpenAIUsage({ prompt_tokens: 7 });
    assert.equal(partial?.prompt_tokens, 7);
    assert.equal(partial?.completion_tokens, undefined); // 未上报 ≠ 0
    assert.equal(partial?.total_tokens, undefined);
    assert.equal('completion_tokens' in (partial as object), false);
});

test('OpenAI: nonstream parse keeps usage; cached/reasoning are subsets', () => {
    const result = parseOpenAINonStream({
        choices: [{ message: { content: 'hi' } }],
        usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            prompt_tokens_details: { cached_tokens: 4 },
            completion_tokens_details: { reasoning_tokens: 2 },
        },
    });
    assert.equal(result.ok, true);
    assert.equal(result.content, 'hi');
    assert.equal(result.usage?.prompt_tokens_details?.cached_tokens, 4);
    assert.equal(result.usage?.completion_tokens_details?.reasoning_tokens, 2);
    assert.ok((result.usage?.completion_tokens ?? 0) >= (result.usage?.completion_tokens_details?.reasoning_tokens ?? 0));
});

test('OpenAI: negative token counts treated as unreported', () => {
    const usage = normalizeOpenAIUsage({ prompt_tokens: -5, completion_tokens: 3 });
    assert.equal(usage?.prompt_tokens, undefined);
    assert.equal(usage?.completion_tokens, 3);
    const negDetails = normalizeOpenAIUsage({ prompt_tokens: 10, prompt_tokens_details: { cached_tokens: -1, audio_tokens: 2 } });
    assert.equal(negDetails?.prompt_tokens_details?.cached_tokens, undefined); // 负值明细丢弃
    assert.equal(negDetails?.prompt_tokens_details?.audio_tokens, 2);
});

test('OpenAI: cache_write_tokens mapped to cache_creation_tokens with raw key retained; explicit creation preferred', () => {
    const aliased = normalizeOpenAIUsage({ prompt_tokens: 10, prompt_tokens_details: { cache_write_tokens: 4 } });
    assert.equal(aliased?.prompt_tokens_details?.cache_creation_tokens, 4); // 文档化别名
    assert.equal(aliased?.prompt_tokens_details?.cache_write_tokens, 4); // 原始键保留

    const preferred = normalizeOpenAIUsage({
        prompt_tokens: 10,
        prompt_tokens_details: { cache_write_tokens: 4, cache_creation_tokens: 2 },
    });
    assert.equal(preferred?.prompt_tokens_details?.cache_creation_tokens, 2); // 显式上报值优先
    assert.equal(preferred?.prompt_tokens_details?.cache_write_tokens, 4);

    // 负值的 cache_write_tokens 不产生别名映射
    const negative = normalizeOpenAIUsage({ prompt_tokens: 10, prompt_tokens_details: { cache_write_tokens: -1 } });
    assert.equal('cache_creation_tokens' in (negative?.prompt_tokens_details ?? {}), false);
});

test('OpenAI: DeepSeek prompt_cache_hit_tokens / prompt_cache_miss_tokens normalized', () => {
    // DeepSeek 官方同时提供 prompt_tokens_details.cached_tokens（同 hit 值）；已上报值优先
    const withDetails = normalizeOpenAIUsage({
        prompt_tokens: 17,
        prompt_tokens_details: { cached_tokens: 0 },
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 17,
    });
    assert.equal(withDetails?.prompt_tokens_details?.cached_tokens, 0);
    assert.equal(withDetails?.prompt_tokens_details?.uncached_tokens, 17); // 实际未命中保留

    // 提供 juxaDetails 缺失时 hit 可以填充 cached_tokens（nullish 才填充）
    const hitOnly = normalizeOpenAIUsage({ prompt_tokens: 17, prompt_cache_hit_tokens: 5, prompt_cache_miss_tokens: 12 });
    assert.equal(hitOnly?.prompt_tokens_details?.cached_tokens, 5);
    assert.equal(hitOnly?.prompt_tokens_details?.uncached_tokens, 12);
});

// ---------------------------------------------------------------------------
// Claude Messages —— 缓存计数相加语义折算为子集
// ---------------------------------------------------------------------------

test('Claude: additive cache counts folded into prompt_tokens; total = prompt + completion', () => {
    const usage = normalizeClaudeUsage({
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 20,
        output_tokens_details: { thinking_tokens: 10 },
    });
    assert.equal(usage?.prompt_tokens, 150); // 100 + 30 + 20（官方：input 三者相加）
    assert.equal(usage?.completion_tokens, 50);
    assert.equal(usage?.prompt_tokens_details?.cached_tokens, 30); // 子集语义
    assert.equal(usage?.prompt_tokens_details?.cache_creation_tokens, 20);
    assert.equal(usage?.completion_tokens_details?.reasoning_tokens, 10); // thinking → reasoning
    assert.equal(usage?.total_tokens, 200);
});

test('Claude: no cache fields → no cache details; explicit zero kept as zero', () => {
    const usage = normalizeClaudeUsage({ input_tokens: 100, output_tokens: 50 });
    assert.equal(usage?.prompt_tokens, 100);
    assert.equal(usage?.prompt_tokens_details, undefined);
    assert.equal(usage?.total_tokens, 150);

    const explicitZero = normalizeClaudeUsage({ input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 });
    assert.equal(explicitZero?.prompt_tokens_details?.cached_tokens, 0); // 提供方显式上报的 0 保留
    assert.equal(explicitZero?.total_tokens, 150);
});

test('Claude: cache-only / output-only / input-only never fabricate missing counterpart or total', () => {
    // Keep the reported cache count, but neither invent complete input nor infer a total.
    assert.deepEqual(normalizeClaudeUsage({ cache_read_input_tokens: 30 }), { prompt_tokens_details: { cached_tokens: 30 } });
    // output-only / input-only：total 需要 prompt 与 completion 都已知
    const outputOnly = normalizeClaudeUsage({ output_tokens: 50 });
    assert.equal(outputOnly?.completion_tokens, 50);
    assert.equal(outputOnly?.prompt_tokens, undefined);
    assert.equal('total_tokens' in (outputOnly as object), false);
    const inputOnly = normalizeClaudeUsage({ input_tokens: 100 });
    assert.equal(inputOnly?.prompt_tokens, 100); // 缺失的 cache 计数按相加语义零贡献，不属于伪 zero 描述
    assert.equal(inputOnly?.completion_tokens, undefined);
    assert.equal('total_tokens' in (inputOnly as object), false);
    // Reported cache details are still useful when complete input usage is unknown.
    const noInput = normalizeClaudeUsage({ cache_read_input_tokens: 30, cache_creation_input_tokens: 5, output_tokens: 50 });
    assert.equal(noInput?.completion_tokens, 50);
    assert.equal(noInput?.prompt_tokens, undefined);
    assert.deepEqual(noInput?.prompt_tokens_details, { cached_tokens: 30, cache_creation_tokens: 5 });
    assert.equal('total_tokens' in (noInput as object), false);
});

test('Claude: nonstream parse keeps raw usage in providerMeta', () => {
    const result = parseClaudeResponse({
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 30 },
    });
    assert.equal(result.usage?.prompt_tokens, 130);
    assert.deepEqual(result.providerMeta?.claudeUsage, { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 30 });
    assert.equal(result.providerMeta?.stop_reason, 'end_turn');
});

// ---------------------------------------------------------------------------
// Gemini generateContent —— thoughts 折算进 completion_tokens
// ---------------------------------------------------------------------------

test('Gemini: thoughtsTokenCount folded into completion_tokens; cached is subset of prompt', () => {
    const usage = normalizeGeminiUsage({
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        thoughtsTokenCount: 30,
        cachedContentTokenCount: 20,
        totalTokenCount: 180, // 100 + 50 + 30（官方：total 含 thoughts）
    });
    assert.equal(usage?.prompt_tokens, 100);
    assert.equal(usage?.completion_tokens, 80); // candidates 50 + thoughts 30
    assert.equal(usage?.prompt_tokens_details?.cached_tokens, 20);
    assert.equal(usage?.completion_tokens_details?.reasoning_tokens, 30); // completion 的子集
    assert.equal(usage?.total_tokens, 180); // 用提供方 total，不重复加 thoughts
});

test('Gemini: missing total computed from supplied components; missing thoughts absent', () => {
    const usage = normalizeGeminiUsage({ promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 30 });
    assert.equal(usage?.total_tokens, 180);
    const noThoughts = normalizeGeminiUsage({ promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 });
    assert.equal(noThoughts?.completion_tokens, 50);
    assert.equal('reasoning_tokens' in (noThoughts?.completion_tokens_details ?? {}), false);
    const noTotal = normalizeGeminiUsage({ promptTokenCount: 100, candidatesTokenCount: 50 });
    assert.equal(noTotal?.total_tokens, 150);
});

test('Gemini: explicit thoughtsTokenCount:0 preserved as reasoning_tokens:0; thoughts-only never manufactures completion', () => {
    const explicitZero = normalizeGeminiUsage({ promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 0, totalTokenCount: 150 });
    assert.equal(explicitZero?.completion_tokens, 50);
    assert.equal(explicitZero?.completion_tokens_details?.reasoning_tokens, 0);
    assert.equal(explicitZero?.total_tokens, 150);

    const thoughtsOnly = normalizeGeminiUsage({ thoughtsTokenCount: 5 });
    assert.equal(thoughtsOnly?.completion_tokens, undefined);
    assert.equal(thoughtsOnly?.prompt_tokens, undefined);
    assert.equal('total_tokens' in (thoughtsOnly as object), false);
    assert.deepEqual(thoughtsOnly?.completion_tokens_details, { reasoning_tokens: 5 });
});

test('Gemini: toolUsePromptTokenCount folded into prompt_tokens, explicit tool_use_tokens kept, prompt+completion aligns with total', () => {
    const folded = normalizeGeminiUsage({
        promptTokenCount: 100,
        toolUsePromptTokenCount: 50,
        candidatesTokenCount: 60,
        thoughtsTokenCount: 10,
        totalTokenCount: 220, // 100 + 50 + 60 + 10
    });
    assert.equal(folded?.prompt_tokens, 150); // 100 + toolUse 50
    assert.equal(folded?.prompt_tokens_details?.tool_use_tokens, 50);
    assert.equal(folded?.completion_tokens, 70); // 60 + thoughts 10
    assert.equal(folded?.total_tokens, 220); // 真实上报的 total 原样保留
    assert.equal((folded?.prompt_tokens ?? 0) + (folded?.completion_tokens ?? 0), folded?.total_tokens);

    // total 缺失：由已折叠的 prompt+completion 推算
    const inferred = normalizeGeminiUsage({ promptTokenCount: 100, toolUsePromptTokenCount: 50, candidatesTokenCount: 60 });
    assert.equal(inferred?.prompt_tokens, 150);
    assert.equal(inferred?.completion_tokens, 60);
    assert.equal(inferred?.total_tokens, 210);

    // Known details must not vanish just because the complete input count is unavailable.
    assert.deepEqual(normalizeGeminiUsage({ toolUsePromptTokenCount: 50, cachedContentTokenCount: 4 }), {
        prompt_tokens_details: { tool_use_tokens: 50, cached_tokens: 4 },
    });
});

test('Gemini: total inferred only when prompt AND completion known', () => {
    const promptOnly = normalizeGeminiUsage({ promptTokenCount: 100 });
    assert.equal(promptOnly?.prompt_tokens, 100);
    assert.equal('total_tokens' in (promptOnly as object), false);
});

test('Gemini: negative token counts treated as unreported', () => {
    const usage = normalizeGeminiUsage({ promptTokenCount: -1, candidatesTokenCount: 5 });
    assert.equal(usage?.prompt_tokens, undefined);
    assert.equal(usage?.completion_tokens, 5);
    assert.equal('total_tokens' in (usage as object), false);
});

test('nonstream Gemini separates thought parts and keeps raw usageMetadata', () => {
    const result = parseGeminiResponse({
        candidates: [{
            content: { parts: [
                { text: 'let me think', thought: true },
                { text: 'the answer' },
            ] },
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 6, totalTokenCount: 20 },
    });
    assert.equal(result.content, 'the answer');
    assert.equal(result.reasoning_content, 'let me think');
    assert.equal(result.usage?.completion_tokens, 10); // 4 + 6
    assert.equal(result.usage?.completion_tokens_details?.reasoning_tokens, 6);
    assert.equal(result.usage?.total_tokens, 20);
    assert.deepEqual(result.providerMeta?.geminiUsage, { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 6, totalTokenCount: 20 });
});
