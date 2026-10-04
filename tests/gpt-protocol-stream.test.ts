// ============================================================================
// GPT 协议流式响应解析测试（离线 node；网络边界用假 Response mock）
// 覆盖：SSE 任意网络分片（含跨分片 UTF-8 / CRLF / 末尾无换行）、思维链先于正文流式、
// think 标签前缀分区、结构化/加密 reasoning、工具调用回归、末尾 usage 事件。
// ============================================================================
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildStreamMsgText,
    consumeClaudeStream,
    consumeGeminiStream,
    consumeOpenAIStream,
    createSseParser,
    mergeOpenAIStreamToolCalls,
    parseClaudeResponse,
    parseOpenAINonStream,
} from '../src/func/gpt/openai/response-parse.js';

// think 标签字面量在传输层会被损坏，这里用拼接构造
const OPEN = '<' + 'think' + '>';
const CLOSE = '</' + 'think' + '>';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

/** 假 Response：把给定字节序列当作网络分片逐个 enqueue */
const streamResponse = (chunks: Uint8Array[]): any => ({
    body: new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    }),
});

/** 先拼成完整事件流文本，再按给定「字节长度」序列切成网络分片（可命中 UTF-8 字节内部） */
const chunkedResponse = (eventText: string, byteSizes: number[]): any => {
    const all = bytes(eventText);
    const chunks: Uint8Array[] = [];
    let offset = 0;
    let i = 0;
    while (offset < all.length) {
        const size = byteSizes[i % byteSizes.length] || 1;
        chunks.push(all.subarray(offset, Math.min(all.length, offset + size)));
        offset += size;
        i++;
    }
    return streamResponse(chunks);
};

interface RecordedCall {
    msg: string;
    toolCalls?: IToolCallResponse[];
    snapshot?: { content: string; reasoning_content?: string; usage?: any };
}

const recordStreamMsg = (calls: RecordedCall[]) => (msg: string, toolCalls?: IToolCallResponse[], snapshot?: any) => {
    calls.push({ msg, toolCalls, snapshot });
};

// ---------------------------------------------------------------------------
// SSE 切分器
// ---------------------------------------------------------------------------

test('SSE parser: arbitrary split points, CRLF, final event without newline, multi data lines', () => {
    const events: string[] = [];
    const parser = createSseParser((data) => events.push(data));

    // 事件之间 \r\n\r\n；末尾事件没有空行结尾
    parser.push('data: {"a":');
    parser.push('1}\n\nda');
    parser.push('ta: first\r\ndata');
    parser.push(': second\r\n\r\ndata: tail');
    parser.flush();

    assert.deepEqual(events, ['{"a":1}', 'first\nsecond', 'tail']);
});

test('SSE parser: comments and unknown fields ignored', () => {
    const events: string[] = [];
    const parser = createSseParser((data) => events.push(data));
    parser.push(': heartbeat\nevent: message_start\ndata: {"type":"message_start"}\n\n');
    parser.flush();
    assert.deepEqual(events, ['{"type":"message_start"}']);
});

// ---------------------------------------------------------------------------
// OpenAI 兼容流式
// ---------------------------------------------------------------------------

const openAIEventStream = [
    'data: {"choices":[{"delta":{"role":"assistant"}}]}',
    `data: {"choices":[{"delta":{"reasoning_content":"step 1"}}]}`,
    'data: {"choices":[{"delta":{"content":"ans"}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"f","arguments":"{\\"x\\":"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}',
    'data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":4,"total_tokens":13,"prompt_tokens_details":{"cached_tokens":3},"completion_tokens_details":{"reasoning_tokens":2}}}',
    'data: [DONE]',
].join('\n\n') + '\n\n';

test('OpenAI stream: full happy path with reasoning, tools, final usage chunk', async () => {
    const calls: RecordedCall[] = [];
    const result = await consumeOpenAIStream(streamResponse([bytes(openAIEventStream)]), {
        streamMsg: recordStreamMsg(calls),
    });

    assert.equal(result.content, 'ans');
    assert.equal(result.reasoning_content, 'step 1');
    assert.equal(result.ok, true);
    assert.equal(result.tool_calls?.length, 1);
    assert.equal(result.tool_calls?.[0].id, 'call_a');
    assert.equal(result.tool_calls?.[0].function.name, 'f');
    assert.equal(result.tool_calls?.[0].function.arguments, '{"x":1}');
    assert.equal(result.usage?.prompt_tokens, 9);
    assert.equal(result.usage?.completion_tokens, 4);
    assert.equal(result.usage?.prompt_tokens_details?.cached_tokens, 3);
    assert.equal(result.usage?.completion_tokens_details?.reasoning_tokens, 2);

    // 快照契约：最后一个事件（usage）的快照带最终 usage；legacy msg 带 think 包裹
    const last = calls[calls.length - 1];
    assert.equal(last.snapshot?.usage?.prompt_tokens, 9);
    assert.equal(last.snapshot?.content, 'ans');
    assert.equal(last.snapshot?.reasoning_content, 'step 1');
    assert.ok(last.msg.includes(OPEN) && last.msg.includes(CLOSE) && last.msg.includes('ans'));
    assert.ok(calls[0].snapshot); // 每个有效事件都带快照
});

test('OpenAI stream: reasoning streams before any body content', async () => {
    const calls: RecordedCall[] = [];
    const onlyReasoning = 'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\n';
    const result = await consumeOpenAIStream(streamResponse([bytes(onlyReasoning)]), {
        streamMsg: recordStreamMsg(calls),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].snapshot?.reasoning_content, 'thinking...');
    assert.equal(calls[0].snapshot?.content, '');
    assert.ok(calls[0].msg.startsWith(OPEN)); // legacy 串包裹推理
    assert.equal(result.reasoning_content, 'thinking...');
    assert.equal(result.content, '');
});

test('OpenAI stream: arbitrary byte-level chunk splits (incl. UTF-8 mid-char) give identical result', async () => {
    const base = await consumeOpenAIStream(streamResponse([bytes(openAIEventStream)]));
    // 中文+emoji 内容跨字节切分
    const utf8Stream = 'data: {"choices":[{"delta":{"content":"中文🙂测试"}}]}\n\n'
        + 'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n';
    const utf8 = await consumeOpenAIStream(chunkedResponse(utf8Stream, [1, 5, 2, 3, 1]));
    assert.equal(utf8.content, '中文🙂测试');
    assert.equal(utf8.usage?.total_tokens, 2);

    for (const sizes of [[1], [2, 3], [7, 1, 13], [5, 5, 5]]) {
        const result = await consumeOpenAIStream(chunkedResponse(openAIEventStream, sizes));
        assert.deepEqual({
            content: result.content,
            reasoning_content: result.reasoning_content,
            usage: result.usage,
            tool_calls: result.tool_calls,
        }, {
            content: base.content,
            reasoning_content: base.reasoning_content,
            usage: base.usage,
            tool_calls: base.tool_calls,
        }, `sizes=${sizes}`);
    }
});

test('OpenAI stream: CRLF framing and final event without newline', async () => {
    const stream = openAIEventStream.split('\n\n').filter(Boolean).join('\r\n\r\n'); // 无末尾空行
    const result = await consumeOpenAIStream(chunkedResponse(stream, [3, 17, 1]));
    assert.equal(result.content, 'ans');
    assert.equal(result.reasoning_content, 'step 1');
    assert.equal(result.usage?.prompt_tokens, 9);
});

test('OpenAI stream: error event appends formatted error and marks not-ok', async () => {
    const stream = 'data: {"error":{"message":"boom","code":500}}\n\n';
    const result = await consumeOpenAIStream(streamResponse([bytes(stream)]));
    assert.equal(result.ok, false);
    assert.ok(result.content.includes('**[Error]**'));
    assert.ok(result.content.includes('boom'));
});

test('OpenAI stream: leading think-tag partition works across split chunks; later embedded tags untouched', async () => {
    const events = [
        `data: {"choices":[{"delta":{"content":"${OPEN}raw rea"}}]}`,
        `data: {"choices":[{"delta":{"content":"soning${CLOSE}the answer ${OPEN}demo${CLOSE} end"}}]}`,
    ].join('\n\n') + '\n\n';
    const result = await consumeOpenAIStream(chunkedResponse(events, [1, 4, 2, 9, 3]));
    assert.equal(result.reasoning_content, 'raw reasoning');
    assert.equal(result.content, `the answer ${OPEN}demo${CLOSE} end`); // 正文内嵌标签保留
});

test('OpenAI nonstream: leading think-tag partition; object reasoning_details never stringified', () => {
    const result = parseOpenAINonStream({
        choices: [{
            message: {
                content: `${OPEN}secret chain${CLOSE}final answer`,
                reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque===' }],
            },
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    assert.equal(result.reasoning_content, 'secret chain');
    assert.equal(result.content, 'final answer');
});

test('OpenAI nonstream: structured reasoning_details text/summary extracted, encrypted ignored', () => {
    const message = {
        content: 'answer',
        reasoning_details: [
            { type: 'reasoning.text', text: 'raw thought', signature: 'sig-blob' },
            { type: 'reasoning.summary', summary: 'short summary' },
            { type: 'reasoning.encrypted', data: 'opaque' },
            'plain string detail',
        ],
    };
    const parsed = parseOpenAINonStream({ choices: [{ message }] });
    assert.equal(parsed.reasoning_content, 'raw thoughtshort summaryplain string detail');
    assert.ok(!parsed.reasoning_content?.includes('opaque') && !parsed.reasoning_content?.includes('sig-blob'));

    // 完全不可读的结构：忽略而非 stringify
    const garbage = parseOpenAINonStream({ choices: [{ message: { content: '', reasoning_details: { foo: { bar: 1 } } } }] });
    assert.equal(garbage.reasoning_content ?? '', '');
    assert.equal(garbage.content, '');
});

// ---------------------------------------------------------------------------
// Claude 流式
// ---------------------------------------------------------------------------

const claudeEventStream = [
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_read_input_tokens":30,"cache_creation_input_tokens":20}}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"ponder..."}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":2,"content_block":{"type":"text"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":2,"delta":{"type":"text_delta","text":"hello"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"paris\\"}"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":2,"delta":{"type":"signature_delta","signature":"opaque-sig"}}',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":50}}',
].join('\n\n') + '\n\n';

test('Claude stream: thinking streamed before body, additive cache usage, tool args split across events', async () => {
    const calls: RecordedCall[] = [];
    const result = await consumeClaudeStream(streamResponse([bytes(claudeEventStream)]), {
        streamMsg: recordStreamMsg(calls),
    });

    assert.equal(result.content, 'hello');
    assert.equal(result.reasoning_content, 'ponder...');
    assert.equal(result.tool_calls?.length, 1);
    assert.equal(result.tool_calls?.[0].id, 'toolu_1');
    assert.equal(result.tool_calls?.[0].function.arguments, '{"city":"paris"}');

    // usage：input(100) + cache(30+20) = 150 prompt；thinking 未报 → 无 reasoning_tokens
    assert.equal(result.usage?.prompt_tokens, 150);
    assert.equal(result.usage?.completion_tokens, 50);
    assert.equal(result.usage?.total_tokens, 200);
    assert.equal(result.providerMeta?.claudeUsage?.cache_creation_input_tokens, 20);
    assert.equal(result.providerMeta?.stop_reason, 'tool_use');

    // 思维链先于正文可见：首个快照只有 reasoning
    assert.equal(calls[0].snapshot?.reasoning_content, 'ponder...');
    assert.equal(calls[0].snapshot?.content, '');
    // 最后一个事件（message_delta usage）快照带最终 usage
    assert.equal(calls[calls.length - 1].snapshot?.usage?.completion_tokens, 50);
    // signature_delta 不产生正文内容
    assert.ok(!result.content.includes('opaque-sig'));
});

test('Claude nonstream: thinking separated, redacted_thinking dropped, tool_use mapped', () => {
    const result = parseClaudeResponse({
        content: [
            { type: 'thinking', thinking: 'why', signature: 'sig' },
            { type: 'redacted_thinking', data: 'opaque-encrypted' },
            { type: 'tool_use', id: 't1', name: 'f', input: { a: 1 } },
            { type: 'text', text: 'done' },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
    });
    assert.equal(result.content, 'done');
    assert.equal(result.reasoning_content, 'why');
    assert.ok(!result.content.includes('opaque-encrypted') && !(result.reasoning_content ?? '').includes('opaque-encrypted'));
    assert.equal(result.providerMeta?.redactedThinkingBlocks, 1);
    assert.equal(result.tool_calls?.[0].function.arguments, '{"a":1}');
    assert.equal(result.usage?.total_tokens, 15);
});

// ---------------------------------------------------------------------------
// Gemini 流式
// ---------------------------------------------------------------------------

const geminiChunk = (text: string, opts: any = {}) => JSON.stringify({
    candidates: [{ content: { parts: [{ text, ...opts }] } }],
    ...(opts.usageMetadata ? { usageMetadata: opts.usageMetadata } : {}),
});

test('Gemini stream: thought parts separated, functionCall snapshot args replaced, final usage', async () => {
    const events = [
        geminiChunk('internal ponder', { thought: true }),
        geminiChunk('answer part'),
        JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'f', args: { a: 1 } } }] } }] }),
        JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'f', args: { a: 1, b: 2 } } }] } }] }),
        JSON.stringify({ candidates: [{ content: { parts: [{ text: ' more', thought: true }] } }] }),
        JSON.stringify({
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 6, thoughtsTokenCount: 4, cachedContentTokenCount: 3, totalTokenCount: 20 },
        }),
    ].map((d) => 'data: ' + d).join('\n\n') + '\n\n';

    const calls: RecordedCall[] = [];
    const result = await consumeGeminiStream(streamResponse([bytes(events)]), {
        streamMsg: recordStreamMsg(calls),
    });

    assert.equal(result.content, 'answer part');
    assert.equal(result.reasoning_content, 'internal ponder more');
    assert.equal(result.tool_calls?.length, 1);
    assert.equal(result.tool_calls?.[0].function.arguments, '{"a":1,"b":2}'); // 快照替换而非拼接
    // usage：completion = candidates(6) + thoughts(4)
    assert.equal(result.usage?.completion_tokens, 10);
    assert.equal(result.usage?.completion_tokens_details?.reasoning_tokens, 4);
    assert.equal(result.usage?.prompt_tokens_details?.cached_tokens, 3);
    assert.equal(result.usage?.total_tokens, 20);
    assert.equal(result.providerMeta?.finishReason, 'STOP');
    // 思维链先于正文
    assert.equal(calls[0].snapshot?.reasoning_content, 'internal ponder');
    assert.equal(calls[0].snapshot?.content, '');
});

// ---------------------------------------------------------------------------
// 工具调用合并回归
// ---------------------------------------------------------------------------

test('mergeOpenAIStreamToolCalls: all-ids fast path returns chunks as-is (Gemini-compatible proxies)', () => {
    const complete = [
        [{ id: 'a', type: 'function', function: { name: 'f1', arguments: '{"x":1}' } }],
        [{ id: 'b', type: 'function', function: { name: 'f2', arguments: '{"y":2}' } }],
    ];
    assert.deepEqual(mergeOpenAIStreamToolCalls(complete as any), (complete as any).flat());
});

test('mergeOpenAIStreamToolCalls: index-based merge concatenates arguments', () => {
    const merged = mergeOpenAIStreamToolCalls([
        [{ index: 0, id: 'c1', type: 'function', function: { name: 'f', arguments: '{"a":' } }],
        [{ index: 1, id: 'c2', type: 'function', function: { name: 'g', arguments: '' } }],
        [{ index: 0, function: { arguments: '1}' } }],
    ] as any);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].function.arguments, '{"a":1}');
    assert.equal(merged[1].function.arguments, '');
    assert.equal(merged[1].function.name, 'g');
});

// ---------------------------------------------------------------------------
// 流式回调契约
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 工具进度回调、读取中断的部分结果保留、EOF 分区释放
// ---------------------------------------------------------------------------

// 注意：ReadableStream.error() 会丢弃已入队分片；用 pull 逐个交付，耗尽后才报错，
// 保证「部分事件先完整到达，然后读取中断」的语义
const failingResponse = (chunks: Uint8Array[], error: Error): any => ({
    body: new ReadableStream({
        pull(controller) {
            const next = chunks.shift();
            if (next) controller.enqueue(next);
            else controller.error(error);
        },
    }),
});

test('OpenAI stream: tool-only argument events are emitted after text suppressed-dedupe fix', async () => {
    const calls: RecordedCall[] = [];
    const events = [
        'data: {"choices":[{"delta":{"content":"ans"}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"f","arguments":"{\\"x\\":"}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}',
    ].join('\n\n') + '\n\n';
    await consumeOpenAIStream(streamResponse([bytes(events)]), { streamMsg: recordStreamMsg(calls) });

    assert.equal(calls.length, 3); // text 事件 + 两次 tool 事件均推送（旧指纹会抑制后两次）
    assert.equal(calls[0].snapshot?.content, 'ans');
    assert.equal(calls[0].toolCalls, undefined);
    assert.equal(calls[1].toolCalls?.[0].function.arguments, '{"x":');
    assert.equal(calls[2].toolCalls?.[0].function.arguments, '{"x":1}');
});

test('Claude stream: tool_use start and input_json_delta push accumulated tool progress', async () => {
    const calls: RecordedCall[] = [];
    const events = [
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"t1","name":"get_city"}}',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"paris\\"}"}}',
    ].join('\n\n') + '\n\n';
    await consumeClaudeStream(streamResponse([bytes(events)]), { streamMsg: recordStreamMsg(calls) });

    assert.equal(calls.length, 3);
    assert.equal(calls[0].toolCalls?.[0].function.name, 'get_city');
    assert.equal(calls[0].toolCalls?.[0].function.arguments, ''); // 注册即推送
    assert.equal(calls[1].toolCalls?.[0].function.arguments, '{"city":');
    assert.equal(calls[2].toolCalls?.[0].function.arguments, '{"city":"paris"}');
});

test('OpenAI stream: mid-stream read failure keeps partial content/usage with ok:false', async () => {
    const events = [
        'data: {"choices":[{"delta":{"content":"ans"}}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":4,"total_tokens":13}}',
    ].join('\n\n') + '\n\n';
    const result = await consumeOpenAIStream(failingResponse([bytes(events)], new Error('network reset')));

    assert.equal(result.ok, false);
    assert.ok(result.content.startsWith('ans')); // 用户正文保留，错误只是后缀
    assert.ok(result.content.includes('network reset'));
    assert.equal(result.usage?.total_tokens, 13);
});

test('OpenAI stream: failure during an unclosed think block remains visible outside reasoning', async () => {
    const events = 'data: {"choices":[{"delta":{"content":"<think>partial thought"}}]}\n\n';
    const calls: RecordedCall[] = [];
    const result = await consumeOpenAIStream(failingResponse([bytes(events)], new Error('network reset')), { streamMsg: recordStreamMsg(calls) });
    assert.equal(result.ok, false);
    assert.equal(result.reasoning_content, 'partial thought');
    assert.match(result.content, /network reset/);
    assert.equal(calls.at(-1)?.snapshot?.reasoning_content, 'partial thought');
    assert.match(calls.at(-1)?.snapshot?.content ?? '', /network reset/);
});

test('Claude stream: mid-stream read failure keeps partial state with ok:false', async () => {
    const events = [
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_read_input_tokens":30}}}',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial answer"}}',
    ].join('\n\n') + '\n\n';
    const result = await consumeClaudeStream(failingResponse([bytes(events)], new Error('socket closed')));

    assert.equal(result.ok, false);
    assert.ok(result.content.startsWith('partial answer'));
    assert.equal(result.usage?.prompt_tokens, 130); // 已到手的缓存计数保留
    assert.equal(result.usage?.completion_tokens, undefined); // 未到手 → 不推算 total
    assert.ok(result.content.includes('socket closed'));
});

test('OpenAI stream: pre-aborted request does not consume queued content', async () => {
    const controller = new AbortController();
    controller.abort();
    const events = 'data: {"choices":[{"delta":{"content":"ans"}}]}\n\n';
    const result = await consumeOpenAIStream(streamResponse([bytes(events)]), { abortController: controller });

    assert.equal(result.ok, false);
    assert.ok(result.content.includes('**[Error]** Request aborted')); // 保留旧版带着重 markers 的格式
});

test('OpenAI stream: cancellation after a reasoning update retains it and shows a visible abort indicator', async () => {
    const controller = new AbortController();
    const result = await consumeOpenAIStream(streamResponse([
        bytes('data: {"choices":[{"delta":{"content":"<think>partial thought"}}]}\n\n'),
        bytes('data: {"choices":[{"delta":{"content":"more thought"}}]}\n\n'),
    ]), {
        abortController: controller,
        streamMsg(_content, _tools, snapshot) {
            if (snapshot?.reasoning_content === 'partial thought') controller.abort();
        },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasoning_content, 'partial thought');
    assert.match(result.content, /Request aborted/);
    assert.equal(result.usage, null);
});

test('Think partition: unreleased literal text must not vanish at EOF / nonstream', () => {
    // 开头只到半个 open 标签：流式暂缓，final/非流式释放为正文
    const nonstreamPartial = parseOpenAINonStream({ choices: [{ message: { content: '<th' } }] });
    assert.equal(nonstreamPartial.content, '<th');
    assert.equal(nonstreamPartial.reasoning_content, undefined);

    // 已进入 think 但闭标签只到一半：final 把暂缓的尾部字面释放进 reasoning
    const trailing = parseOpenAINonStream({ choices: [{ message: { content: `${OPEN}abc</th` } }] });
    assert.equal(trailing.reasoning_content, 'abc</th');
    assert.equal(trailing.content, '');

    // 流式：中间事件仍暂缓，final emit 释放尾部字面
});

test('Think partition: streaming final emit releases held literal tail', async () => {
    // 开头只到半个 open 标签 '<th'：流式暂缓，final emit 释放字面正文
    const events = [
        'data: {"choices":[{"delta":{"content":"<th"}}]}',
    ].join('\n\n') + '\n\n';
    const calls: RecordedCall[] = [];
    const result = await consumeOpenAIStream(streamResponse([bytes(events)]), { streamMsg: recordStreamMsg(calls) });
    assert.equal(calls[0].snapshot?.content, ''); // 流式暂缓未定片段
    assert.equal(calls[1].snapshot?.content, '<th'); // final 释放，字面不消失
    assert.equal(result.content, '<th');
});

test('streamMsg contract: legacy first-arg format and optional-args backward compatibility', () => {
    // 不带 toolCalls/snapshot 的旧式调用不受影响
    let received = '';
    const cb = (msg: string, _toolCalls?: IToolCallResponse[], _snapshot?: any) => { received = msg; };
    cb('plain');
    assert.equal(received, 'plain');
    // legacy 组装与旧版 openai 行为一致
    assert.equal(buildStreamMsgText('answer', 'why'), `${OPEN}\nwhy\n${CLOSE}\nanswer`);
    assert.equal(buildStreamMsgText('answer'), 'answer');
});
