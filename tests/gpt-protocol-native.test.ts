import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { complete } from '../src/func/gpt/openai/complete';
import { executeToolChain } from '../src/func/gpt/tools/toolchain';
import type { ToolExecutor } from '../src/func/gpt/tools/executor';
import { toolChainToCompletion } from '../src/func/gpt/chat/ChatSession/tool-chain-result';
import { syntheticModel, mockFetch, restoreFetch, fetchCalls, jsonResponse, sseResponse } from './fixtures/gpt-protocol-host';

afterEach(restoreFetch);

const lookupCall: IToolCall = {
    id: 'lookup-1', type: 'function', function: { name: 'lookup', arguments: '{"q":"test"}' },
};
const tools: IToolDefinition[] = [{
    type: 'function', function: {
        name: 'lookup', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    },
}];
const initialReply = (protocol: LLMProviderProtocol) => protocol === 'openai'
    ? { choices: [{ message: { content: '', tool_calls: [lookupCall] } }] }
    : protocol === 'claude'
        ? { content: [{ type: 'tool_use', id: 'lookup-1', name: 'lookup', input: { q: 'test' } }], stop_reason: 'tool_use' }
        : { candidates: [{ content: { parts: [{ functionCall: { name: 'lookup', args: { q: 'test' } } }] }, finishReason: 'STOP' }] };

const memoryExecutor = (execute: () => unknown) => ({ execute }) as unknown as ToolExecutor;

test('native adapters send complete JSON Schema, including referenced definitions and root constraints', async () => {
    const schema = {
        type: 'object', properties: { q: { $ref: '#/$defs/Query' } }, required: ['q'],
        $defs: { Query: { type: 'string', minLength: 1 } },
        additionalProperties: false, allOf: [{ required: ['q'] }],
    };
    const original = structuredClone(schema);
    for (const protocol of ['claude', 'gemini'] as const) {
        mockFetch(jsonResponse(protocol === 'claude'
            ? { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' }
            : { candidates: [{ content: { parts: [{ text: 'done' }] } }] }));
        const result = await complete('hello', {
            model: syntheticModel(protocol), stream: false,
            option: { tools: [{ type: 'function', function: { name: 'lookup', parameters: schema } }] as any },
        });
        assert.equal(result.ok, true);
        const definition = fetchCalls[0].body.tools[0];
        assert.deepEqual(protocol === 'claude' ? definition.input_schema : definition.functionDeclarations[0].parametersJsonSchema, schema);
        if (protocol === 'gemini') assert.equal('parameters' in definition.functionDeclarations[0], false);
        assert.deepEqual(schema, original);
    }
});

test('Claude rejects contradictory manual thinking limits before fetch, but respects an explicit interleaved exception', async () => {
    const model = syntheticModel('claude', { config: { options: { compat: { thinking: { enabled: true, claudeMode: 'manual-budget' } } } } });
    mockFetch();
    const invalid = await complete('hello', { model, option: { reasoning_effort: 'medium' } });
    assert.equal(invalid.ok, false);
    assert.match(invalid.content, /budget_tokens \(8192\).*max_tokens \(4096\)/);
    assert.equal(fetchCalls.length, 0);
    mockFetch(jsonResponse({ content: [{ type: 'text', text: 'done' }] }));
    const valid = await complete('hello', { model, option: { reasoning_effort: 'medium', max_tokens: 16384 } });
    assert.equal(valid.ok, true);
    assert.equal(fetchCalls[0].body.max_tokens, 16384);
    assert.deepEqual(fetchCalls[0].body.thinking, { type: 'enabled', budget_tokens: 8192 });
    model.provider.customHeaders = { 'Anthropic-Beta': 'other-beta, interleaved-thinking-2025-05-14' };
    mockFetch(jsonResponse({ content: [{ type: 'text', text: 'done' }] }));
    const interleaved = await complete('hello', { model, option: { reasoning_effort: 'medium' } });
    assert.equal(interleaved.ok, true);
    assert.equal(fetchCalls[0].body.max_tokens, 4096);
    assert.equal(fetchCalls[0].body.thinking.budget_tokens, 8192);
});

test('each protocol preserves executed tool facts when the real continuation request fails', async () => {
    for (const protocol of ['openai', 'claude', 'gemini'] as const) {
        const model = syntheticModel(protocol);
        mockFetch(jsonResponse(initialReply(protocol)), jsonResponse({ error: { message: 'synthetic continuation failure' } }, 500));
        const initial = await complete('lookup test', { model, stream: false, option: { tools } });
        assert.equal(initial.ok, true, protocol);
        let executed = 0;
        const chain = await executeToolChain(memoryExecutor(async () => {
            executed++;
            return { status: 'success', data: 'known tool fact', finalText: 'known tool fact' };
        }), initial, {
            model, contextMessages: [{ role: 'user', content: 'lookup test' }], chatOption: { stream: false, tools }, callbacks: { onLLMResponseUpdate: () => {} },
        });
        assert.equal(executed, 1, protocol);
        assert.equal(fetchCalls.length, 2, protocol);
        assert.equal(chain.status, 'error', protocol);
        assert.match(chain.error ?? '', /synthetic continuation failure/);
        const completion = toolChainToCompletion(chain, initial);
        assert.equal(completion.ok, false);
        assert.match(completion.content, /synthetic continuation failure/);
        assert.equal(completion.toolChainMessages?.find(message => message.role === 'tool')?.content, 'known tool fact');
        assert.equal(completion.toolChainResult?.toolCallHistory.length, 1);
    }
});

test('text-only models accept a tool-call assistant message with null content', async () => {
    for (const protocol of ['openai', 'claude', 'gemini'] as const) {
        const reply = protocol === 'openai' ? { choices: [{ message: { content: 'done' } }] }
            : protocol === 'claude' ? { content: [{ type: 'text', text: 'done' }] }
                : { candidates: [{ content: { parts: [{ text: 'done' }] } }] };
        mockFetch(jsonResponse(reply));
        const result = await complete([
            { role: 'user', content: 'lookup' },
            { role: 'assistant', content: null, tool_calls: [lookupCall] },
            { role: 'tool', content: 'known fact', tool_call_id: lookupCall.id, name: 'lookup' },
        ], { model: syntheticModel(protocol, { config: { modalities: { input: ['text'] } } }), stream: false });
        assert.equal(result.ok, true, protocol);
        assert.equal(result.content, 'done');
        assert.equal(fetchCalls.length, 1);
        assert.match(JSON.stringify(fetchCalls[0].body), /known fact/);
    }
});

test('a truncated stream with a partial tool call cannot start a tool', async () => {
    mockFetch(sseResponse([{ choices: [{ delta: { tool_calls: [{ index: 0, ...lookupCall }] } }] }]));
    const model = syntheticModel('openai');
    const initial = await complete('lookup', { model, stream: true });
    assert.equal(initial.ok, false);
    assert.equal(initial.tool_calls?.length, 1);
    let executed = 0;
    const chain = await executeToolChain(memoryExecutor(async () => { executed++; }), initial, {
        model, contextMessages: [{ role: 'user', content: 'lookup' }], callbacks: { onLLMResponseUpdate: () => {} },
    });
    assert.equal(chain.status, 'error');
    assert.equal(executed, 0);
    assert.equal(fetchCalls.length, 1);
});

test('a failed follow-up containing tool calls is not executed and summary failure is not completed', async () => {
    const model = syntheticModel('claude');
    const initial: ICompletionResult = { ok: true, content: '', tool_calls: [lookupCall] };
    let executed = 0;
    const executor = memoryExecutor(async () => { executed++; return { status: 'success', finalText: 'known fact' }; });
    mockFetch(sseResponse([
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'must-not-run', name: 'lookup', input: { q: 'test' } } },
        { type: 'error', error: { message: 'synthetic stream failure' } },
    ]));
    const failed = await executeToolChain(executor, initial, {
        model, contextMessages: [{ role: 'user', content: 'lookup' }], chatOption: { stream: true }, callbacks: { onLLMResponseUpdate: () => {} },
    });
    assert.equal(executed, 1);
    assert.equal(failed.status, 'error');
    assert.match(failed.responseContent, /synthetic stream failure/);
    assert.equal(fetchCalls.length, 1);
    mockFetch(jsonResponse({ error: { message: 'synthetic summary failure' } }, 500));
    const summary = await executeToolChain(executor, initial, {
        model, contextMessages: [{ role: 'user', content: 'lookup' }], chatOption: { stream: false }, maxRounds: 0, callbacks: { onLLMResponseUpdate: () => {} },
    });
    assert.equal(summary.status, 'error');
    assert.match(summary.error ?? '', /synthetic summary failure/);
    assert.equal(summary.toolCallHistory.length, 0);
    assert.equal(executed, 1);
    assert.match(String(summary.messages.toolChain.find(message => message.role === 'tool')?.content), /incomplete/);
});
