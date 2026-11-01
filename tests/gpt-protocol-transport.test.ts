// ============================================================================
// GPT 三协议请求边界测试（transport）
// ============================================================================
// 打包真实 complete / adapter / native payload builder / response parser；
// 只替换 SiYuan、模型查找、日志与模态查询等宿主边界（见 fixtures/gpt-protocol-host）。
// 覆盖：三协议普通文本、只传 option.stream、能力/开关禁用流式、HTTP JSON/文本错误、
// 非流式响应体损坏、预处理器最终 stream 值、Gemini 端点双向切换。
// ============================================================================
import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { userCustomizedPreprocessor } from '../src/func/gpt/openai/adapter';
import { complete } from '../src/func/gpt/openai/complete';
import { ensureGeminiEndpointByStream } from '../src/func/gpt/openai/protocol-utils';
import {
    fetchCalls,
    jsonResponse,
    mockFetch,
    restoreFetch,
    sseResponse,
    syntheticModel,
    textResponse,
    type TFetchCall,
} from './fixtures/gpt-protocol-host';

const PROTOCOLS: LLMProviderProtocol[] = ['openai', 'claude', 'gemini'];

const ONE_SHOT_USAGE = {
    openai: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    claude: { input_tokens: 3, output_tokens: 2 },
    gemini: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
} as const;

/** 每种协议一个「普通文本」非流式响应 */
const textReply = (protocol: LLMProviderProtocol, text = 'hello'): Response => {
    if (protocol === 'openai') {
        return jsonResponse({
            id: 'chatcmpl-synthetic',
            object: 'chat.completion',
            choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: ONE_SHOT_USAGE.openai,
        });
    }
    if (protocol === 'claude') {
        return jsonResponse({
            id: 'msg_synthetic',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text }],
            stop_reason: 'end_turn',
            usage: ONE_SHOT_USAGE.claude,
        });
    }
    return jsonResponse({
        candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
        usageMetadata: ONE_SHOT_USAGE.gemini,
    });
};

/** 每种协议一个带正常终止标志的文本 SSE 流 */
const textStreamReply = (protocol: LLMProviderProtocol, text = 'hello'): Response => {
    if (protocol === 'openai') {
        return sseResponse([
            { choices: [{ index: 0, delta: { role: 'assistant', content: text.slice(0, 3) } }] },
            { choices: [{ index: 0, delta: { content: text.slice(3) }, finish_reason: 'stop' }] },
            { choices: [], usage: ONE_SHOT_USAGE.openai },
            '[DONE]',
        ]);
    }
    if (protocol === 'claude') {
        return sseResponse([
            { type: 'message_start', message: { usage: { input_tokens: 3 } } },
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
            { type: 'message_stop' },
        ]);
    }
    return sseResponse([
        { candidates: [{ content: { role: 'model', parts: [{ text: text.slice(0, 3) }] } }] },
        {
            candidates: [{ content: { role: 'model', parts: [{ text: text.slice(3) }] }, finishReason: 'STOP' }],
            usageMetadata: ONE_SHOT_USAGE.gemini,
        },
    ]);
};

const expectedAuthHeader = (protocol: LLMProviderProtocol): [string, string] => {
    if (protocol === 'openai') return ['Authorization', 'Bearer synthetic-api-key'];
    if (protocol === 'claude') return ['x-api-key', 'synthetic-api-key'];
    return ['x-goog-api-key', 'synthetic-api-key'];
};

/** 请求是否要求流式响应：Gemini 编码在端点路径里，另两者在请求体 stream 字段 */
const requestedStream = (protocol: LLMProviderProtocol, call: TFetchCall): boolean =>
    protocol === 'gemini'
        ? call.url.includes(':streamGenerateContent')
        : call.body?.stream === true;

const lastCall = (): TFetchCall => {
    assert.equal(fetchCalls.length, 1, 'expected exactly one request');
    return fetchCalls[0];
};

beforeEach(() => restoreFetch());
afterEach(() => restoreFetch());

for (const protocol of PROTOCOLS) {
    test(`${protocol}: ordinary text maps the request and parses the reply`, async () => {
        mockFetch(textReply(protocol));
        const model = syntheticModel(protocol);
        const result = await complete('ping', { model });

        assert.equal(result.ok, true);
        assert.equal(result.content, 'hello');
        assert.equal(result.usage?.total_tokens, 5);
        assert.equal(result.tool_calls?.length ?? 0, 0);

        const call = lastCall();
        assert.equal(requestedStream(protocol, call), false);
        assert.match(JSON.stringify(call.body), /ping/);
        const [header, value] = expectedAuthHeader(protocol);
        assert.equal(call.headers[header], value);
    });

    test(`${protocol}: option.stream alone drives request, usage option and parser`, async () => {
        mockFetch(textStreamReply(protocol));
        const result = await complete('ping', {
            model: syntheticModel(protocol),
            option: { stream: true },
        });

        assert.equal(result.ok, true);
        assert.equal(result.content, 'hello');

        const call = lastCall();
        assert.equal(requestedStream(protocol, call), true);
        if (protocol === 'openai') {
            assert.deepEqual(call.body.stream, true);
            assert.deepEqual(call.body.stream_options, { include_usage: true });
        }
        if (protocol === 'gemini') {
            // 默认 generateContent 端点必须切到流式端点，解析器按 SSE 读取。
            assert.equal(
                call.url,
                'https://gemini.example/v1beta/models/gemini-synthetic:streamGenerateContent?alt=sse',
            );
        }
    });

    test(`${protocol}: capabilities.streaming=false overrides a caller stream:true`, async () => {
        mockFetch(textReply(protocol));
        const model = syntheticModel(protocol, { config: { capabilities: { streaming: false } } });
        const result = await complete('ping', { model, stream: true });

        assert.equal(result.ok, true);
        assert.equal(result.content, 'hello', 'the non-stream parser must consume the JSON reply');

        const call = lastCall();
        assert.equal(requestedStream(protocol, call), false);
        if (protocol === 'openai') {
            assert.equal(call.body.stream, false);
            assert.equal('stream_options' in call.body, false);
        }
    });

    test(`${protocol}: toggles.stream=false removes a caller stream:true`, async () => {
        mockFetch(textReply(protocol));
        const result = await complete('ping', {
            model: syntheticModel(protocol),
            stream: true,
            toggles: { stream: false },
        });

        assert.equal(result.ok, true);
        assert.equal(result.content, 'hello');

        const call = lastCall();
        assert.equal(requestedStream(protocol, call), false);
        if (protocol === 'openai') {
            assert.equal('stream' in call.body, false);
        }
        if (protocol === 'claude') {
            assert.equal(call.body.stream, false);
        }
    });

    test(`${protocol}: HTTP JSON error is a failure that keeps the provider message`, async () => {
        mockFetch(jsonResponse(
            { error: { message: 'synthetic quota exceeded', type: 'insufficient_quota' } },
            429,
            'Too Many Requests',
        ));
        const result = await complete('ping', { model: syntheticModel(protocol) });

        assert.equal(result.ok, false);
        assert.match(result.content, /synthetic quota exceeded/);
        assert.equal(result.usage, null);
    });

    test(`${protocol}: HTTP text error is a failure that keeps the body`, async () => {
        mockFetch(textResponse('upstream gateway exploded', 502, 'Bad Gateway'));
        const result = await complete('ping', { model: syntheticModel(protocol) });

        assert.equal(result.ok, false);
        assert.match(result.content, /upstream gateway exploded/);
    });

    test(`${protocol}: malformed non-stream body fails instead of rejecting`, async () => {
        mockFetch(textResponse('not-json', 200, 'OK'));
        const result = await complete('ping', { model: syntheticModel(protocol) });

        assert.equal(result.ok, false);
        assert.ok(result.content.trim().length > 0);
    });
}

const withPreprocessor = async <T>(
    preprocess: typeof userCustomizedPreprocessor.preprocess,
    run: () => Promise<T>,
): Promise<T> => {
    const original = userCustomizedPreprocessor.preprocess;
    userCustomizedPreprocessor.preprocess = preprocess;
    try {
        return await run();
    } finally {
        userCustomizedPreprocessor.preprocess = original;
    }
};

/** Simulate the custom preprocessor redirecting the wire model to another alias. */
const aliasModel = (alias: string) => (payload: Parameters<NonNullable<typeof userCustomizedPreprocessor.preprocess>>[0]) => {
    (payload.option as IChatCompleteOption & { model?: string }).model = alias;
};

test('openai: preprocessor final option.stream controls payload, usage option and parser', () => withPreprocessor((payload) => {
    payload.option.stream = true;
}, async () => {
    mockFetch(textStreamReply('openai', 'streamed'));
    const result = await complete('ping', { model: syntheticModel('openai') });

    assert.equal(result.ok, true);
    assert.equal(result.content, 'streamed');

    const call = lastCall();
    assert.equal(call.body.stream, true);
    assert.deepEqual(call.body.stream_options, { include_usage: true });
}));

test('openai: preprocessor deletion of stream_options is respected on a streaming call', () => withPreprocessor((payload) => {
    delete payload.option.stream_options;
}, async () => {
    mockFetch(textStreamReply('openai', 'streamed'));
    const result = await complete('ping', {
        model: syntheticModel('openai'),
        option: { stream: true },
    });

    assert.equal(result.ok, true);
    assert.equal(result.content, 'streamed', 'the stream parser must still consume the SSE reply');

    const call = lastCall();
    assert.equal(call.body.stream, true);
    assert.equal('stream_options' in call.body, false);
}));

test('openai: preprocessor include_usage:false is respected on a streaming call', () => withPreprocessor((payload) => {
    payload.option.stream_options = { include_usage: false };
}, async () => {
    mockFetch(textStreamReply('openai', 'streamed'));
    const result = await complete('ping', {
        model: syntheticModel('openai'),
        option: { stream: true },
    });

    assert.equal(result.ok, true);
    assert.equal(result.content, 'streamed');

    const call = lastCall();
    assert.deepEqual(call.body.stream_options, { include_usage: false });
}));

test('openai: preprocessor switch to non-stream drops the auto-added stream_options', () => withPreprocessor((payload) => {
    payload.option.stream = false;
}, async () => {
    mockFetch(textReply('openai', 'plain'));
    const result = await complete('ping', {
        model: syntheticModel('openai'),
        option: { stream: true },
    });

    assert.equal(result.ok, true);
    assert.equal(result.content, 'plain');

    const call = lastCall();
    assert.equal(call.body.stream, false);
    assert.equal('stream_options' in call.body, false);
}));

test('openai: preprocessor switch to stream keeps hook-provided stream_options', () => withPreprocessor((payload) => {
    payload.option.stream = true;
    payload.option.stream_options = { include_usage: false };
}, async () => {
    mockFetch(textStreamReply('openai', 'streamed'));
    const result = await complete('ping', { model: syntheticModel('openai') });

    assert.equal(result.ok, true);
    assert.equal(result.content, 'streamed');

    assert.deepEqual(lastCall().body.stream_options, { include_usage: false });
}));

test('gemini endpoint switch: streaming adds alt=sse and keeps other query params', () => {
    assert.equal(
        ensureGeminiEndpointByStream(
            'https://gemini.example/v1beta/models/m:generateContent?key=synthetic&alt=json',
            true,
        ),
        'https://gemini.example/v1beta/models/m:streamGenerateContent?key=synthetic&alt=sse',
    );
    assert.equal(
        ensureGeminiEndpointByStream(
            'https://gemini.example/v1beta/models/m:streamGenerateContent?key=synthetic&alt=sse',
            true,
        ),
        'https://gemini.example/v1beta/models/m:streamGenerateContent?key=synthetic&alt=sse',
    );
});

test('gemini endpoint switch: non-stream removes alt=sse and keeps other query params', () => {
    assert.equal(
        ensureGeminiEndpointByStream(
            'https://gemini.example/v1beta/models/m:streamGenerateContent?key=synthetic&alt=sse&trace=1',
            false,
        ),
        'https://gemini.example/v1beta/models/m:generateContent?key=synthetic&trace=1',
    );
    assert.equal(
        ensureGeminiEndpointByStream('https://gemini.example/v1beta/models/m:generateContent?key=synthetic', false),
        'https://gemini.example/v1beta/models/m:generateContent?key=synthetic',
    );
});

test('gemini endpoint switch: unrecognized proxy path is returned unchanged', () => {
    assert.equal(
        ensureGeminiEndpointByStream('https://proxy.example/v1/chat?alt=sse', true),
        'https://proxy.example/v1/chat?alt=sse',
    );
});

test('gemini: a configured streaming endpoint is switched back for a non-stream call', async () => {
    mockFetch(textReply('gemini'));
    const model = syntheticModel('gemini', {
        url: 'https://gemini.example/v1beta/models/{model}:streamGenerateContent?alt=sse&key=synthetic',
    });
    const result = await complete('ping', { model });

    assert.equal(result.ok, true);
    assert.equal(result.content, 'hello');
    assert.equal(
        lastCall().url,
        'https://gemini.example/v1beta/models/gemini-synthetic:generateContent?key=synthetic',
    );
});

// ============================================================================
// Internal replay data (`extra`): adapters only
// ============================================================================
// `extra` never appears in a request. Only an assistant message whose extra
// matches the current protocol + model + provider may restore native fields.

type LegacyNativeExtra = Extract<IMessageExtra, { data: unknown }>;

const compatibleExtra = (protocol: LLMProviderProtocol, data: LegacyNativeExtra['data']): IMessageExtra => {
    const model = syntheticModel(protocol);
    return {
        protocol,
        data,
        model: model.model,
        provider: model.provider?.name,
    } as IMessageExtra;
};

const assertNoExtraOnWire = (body: any) => {
    assert.equal(JSON.stringify(body).includes('"extra"'), false, 'extra must not be serialized');
};

test('openai: compatible extra restores native reasoning fields and is never sent as extra', async () => {
    mockFetch(textReply('openai'));
    const model = syntheticModel('openai');
    const extra = compatibleExtra('openai', {
        reasoning_content: 'hidden chain',
        reasoning_details: [{ type: 'reasoning.text', text: 'hidden chain' }],
    });

    const result = await complete([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer', extra },
        { role: 'user', content: 'again' },
    ] as IMessage[], { model });

    assert.equal(result.ok, true);
    const call = lastCall();
    assertNoExtraOnWire(call.body);

    const assistant = call.body.messages[1];
    assert.equal(assistant.reasoning_content, 'hidden chain');
    assert.deepEqual(assistant.reasoning_details, [{ type: 'reasoning.text', text: 'hidden chain' }]);
    assert.equal('reasoning' in assistant, false);
});

test('openai: incompatible extra protocol or source is not replayed', async () => {
    mockFetch(textReply('openai'), textReply('openai'), textReply('openai'));
    const model = syntheticModel('openai');
    const messages = (extra: IMessageExtra): IMessage[] => ([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer', extra },
    ] as IMessage[]);

    const wrongProtocol: IMessageExtra = {
        protocol: 'claude',
        data: { content: [{ type: 'text', text: 'from another protocol' }] },
        model: model.model,
        provider: model.provider?.name,
    };
    const wrongModel: IMessageExtra = {
        protocol: 'openai',
        data: { reasoning_content: 'from another model' },
        model: 'another-model',
        provider: model.provider?.name,
    };
    const wrongProvider: IMessageExtra = {
        protocol: 'openai',
        data: { reasoning_content: 'from another provider' },
        model: model.model,
        provider: 'another-provider',
    };

    for (const extra of [wrongProtocol, wrongModel, wrongProvider]) {
        const result = await complete(messages(extra), { model });
        assert.equal(result.ok, true);
    }

    assert.equal(fetchCalls.length, 3);
    for (const call of fetchCalls) {
        assertNoExtraOnWire(call.body);
        const assistant = call.body.messages[1];
        assert.equal('reasoning_content' in assistant, false);
        assert.equal('reasoning_details' in assistant, false);
    }
});

test('claude: compatible extra replays raw blocks unchanged and falls back otherwise', async () => {
    mockFetch(textReply('claude'), textReply('claude'));
    const model = syntheticModel('claude');
    const rawBlocks: ClaudeContentBlock[] = [
        { type: 'thinking', thinking: 'plan', signature: 'synthetic-signature' },
        { type: 'text', text: 'answer' },
        { type: 'tool_use', id: 'tool_1', name: 'lookup', input: { q: 'x' } },
    ];
    const extra = compatibleExtra('claude', { content: rawBlocks });

    const replayed = await complete([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'display text', extra },
        { role: 'tool', tool_call_id: 'tool_1', name: 'lookup', content: '{"ok":true}' },
    ] as IMessage[], { model });
    assert.equal(replayed.ok, true);

    const call = lastCall();
    assertNoExtraOnWire(call.body);
    assert.deepEqual(call.body.messages[1].content, rawBlocks);

    // A foreign-protocol extra must fall back to the ordinary text conversion.
    const foreign = compatibleExtra('openai', { reasoning_content: 'not claude' });
    const fallback = await complete([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ordinary answer', extra: foreign },
    ] as IMessage[], { model });
    assert.equal(fallback.ok, true);

    const fallbackCall = fetchCalls[1];
    assertNoExtraOnWire(fallbackCall.body);
    assert.deepEqual(fallbackCall.body.messages[1].content, [{ type: 'text', text: 'ordinary answer' }]);
});

test('gemini: compatible extra replays raw signed parts and returns server call ids', async () => {
    mockFetch(textReply('gemini'));
    const model = syntheticModel('gemini');
    const rawParts: IGeminiPart[] = [
        { text: 'plan', thought: true, thoughtSignature: 'synthetic-thought-signature' },
        {
            functionCall: { id: 'server_fc_1', name: 'lookup', args: { q: 'x' } },
            thoughtSignature: 'synthetic-call-signature',
        },
    ];
    const extra = compatibleExtra('gemini', { parts: rawParts });

    const result = await complete([
        { role: 'user', content: 'first' },
        {
            role: 'assistant',
            content: '',
            extra,
            tool_calls: [{
                id: 'server_fc_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{"q":"x"}' },
            }],
        },
        { role: 'tool', tool_call_id: 'server_fc_1', name: 'lookup', content: '{"ok":true}' },
    ] as IMessage[], { model });

    assert.equal(result.ok, true);
    const call = lastCall();
    assertNoExtraOnWire(call.body);
    assert.deepEqual(call.body.contents[1].parts, rawParts);

    const functionResponse = call.body.contents[2].parts[0].functionResponse;
    assert.equal(functionResponse.id, 'server_fc_1');
    assert.equal(functionResponse.name, 'lookup');
});

test('gemini: locally generated call ids are not sent back as functionResponse ids', async () => {
    mockFetch(textReply('gemini'));
    const model = syntheticModel('gemini');
    const rawParts: IGeminiPart[] = [
        { text: 'plan', thought: true, thoughtSignature: 'synthetic-thought-signature' },
        {
            functionCall: { name: 'lookup', args: { q: 'x' } },
            thoughtSignature: 'synthetic-call-signature',
        },
    ];
    const extra = compatibleExtra('gemini', { parts: rawParts });

    await complete([
        { role: 'user', content: 'first' },
        {
            role: 'assistant',
            content: '',
            extra,
            tool_calls: [{
                id: 'gemini_call_0',
                type: 'function',
                function: { name: 'lookup', arguments: '{"q":"x"}' },
            }],
        },
        { role: 'tool', tool_call_id: 'gemini_call_0', content: '{"ok":true}' },
    ] as IMessage[], { model });

    const call = lastCall();
    assertNoExtraOnWire(call.body);
    assert.deepEqual(call.body.contents[1].parts, rawParts);

    const functionResponse = call.body.contents[2].parts[0].functionResponse;
    assert.equal('id' in functionResponse, false);
    assert.equal(functionResponse.name, 'lookup', 'name falls back to the raw functionCall name');
});

// ============================================================================
// Effective native request targets
// ============================================================================


const SAFE_OPENAI_REASONING = 'prior reasoning already kept as __MASK_PHONE_7__';
const SAFE_CLAUDE_BLOCKS: ClaudeContentBlock[] = [
    { type: 'thinking', thinking: 'safe signed thought', signature: 'synthetic-signature' },
    { type: 'text', text: 'previous answer' },
];
const SAFE_GEMINI_PARTS: IGeminiPart[] = [
    { text: 'safe signed thought', thought: true, thoughtSignature: 'synthetic-thought-signature' },
    { text: 'previous answer' },
];

const safeExtra = (protocol: LLMProviderProtocol): IMessageExtra => {
    if (protocol === 'openai') {
        return compatibleExtra('openai', { reasoning_content: SAFE_OPENAI_REASONING });
    }
    if (protocol === 'claude') {
        return compatibleExtra('claude', { content: SAFE_CLAUDE_BLOCKS });
    }
    return compatibleExtra('gemini', { parts: SAFE_GEMINI_PARTS });
};

for (const protocol of PROTOCOLS) {
    test(`${protocol}: compatible replay extra survives unchanged`, async () => {
        mockFetch(textReply(protocol));
        const extra = safeExtra(protocol);
        const input = [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'previous answer', extra },
            { role: 'user', content: 'next question' },
        ] as IMessage[];
        const snapshot = structuredClone(input);

        const result = await complete(input, { model: syntheticModel(protocol) });

        assert.equal(result.ok, true);
        assert.equal(result.content, 'hello');
        assert.deepEqual(input, snapshot, 'stored history is never modified');

        const body = lastCall().body;
        assert.equal(JSON.stringify(body).includes('"extra"'), false);

        if (protocol === 'openai') {
            assert.equal(body.messages[1].reasoning_content, SAFE_OPENAI_REASONING);
        }
        if (protocol === 'claude') {
            assert.deepEqual(body.messages[1].content, SAFE_CLAUDE_BLOCKS);
        }
        if (protocol === 'gemini') {
            assert.deepEqual(body.contents[1].parts, SAFE_GEMINI_PARTS);
        }
    });
}

// ============================================================================
// OpenAI preprocessor model alias: effective request target wins
// ============================================================================
// A custom preprocessor may rewrite the wire model (`option.model` overrides
// `body.model`). Replay compatibility and extra source binding remain explicit.

const ALIAS_A = 'alias-a';
const ALIAS_B = 'alias-b';
const ALIAS_C = 'alias-c';

const aliasModelRuntime = () => syntheticModel('openai', { model: ALIAS_A });

const reasoningReply = (reasoning: string) => jsonResponse({
    id: 'chatcmpl-alias',
    object: 'chat.completion',
    choices: [{
        index: 0,
        message: { role: 'assistant', content: 'answer', reasoning_content: reasoning },
        finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
});

test('openai alias: hook switch to B drops A-bound replay data and binds the reply to B', async () => {
    mockFetch(reasoningReply('fresh chain from b'));
    const runtime = aliasModelRuntime();
    const aExtra: IMessageExtra = {
        protocol: 'openai',
        data: { reasoning_content: 'chain bound to alias-a' },
        model: ALIAS_A,
        provider: runtime.provider?.name,
    };

    const result = await withPreprocessor(aliasModel(ALIAS_B), () => complete([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'previous answer', extra: aExtra },
    ] as IMessage[], { model: runtime }));

    assert.equal(result.ok, true);
    assert.equal(result.content, 'answer');

    const call = lastCall();
    assert.equal(call.body.model, ALIAS_B);
    assert.equal(JSON.stringify(call.body).includes('chain bound to alias-a'), false);
    assert.equal('reasoning_content' in call.body.messages[1], false);
    assert.equal(JSON.stringify(call.body).includes('"extra"'), false);

    assert.equal(result.extra?.model, ALIAS_B);
    assert.equal(result.extra?.provider, runtime.provider?.name);
    assert.deepEqual((result.extra as LegacyNativeExtra).data, { reasoning_content: 'fresh chain from b' });
});

test('openai alias: B-bound replay data survives a request to the same alias', async () => {
    const runtime = aliasModelRuntime();
    mockFetch(reasoningReply('chain bound to alias-b'));
    const first = await withPreprocessor(aliasModel(ALIAS_B), () => complete('first', { model: runtime }));
    assert.equal(first.ok, true);
    assert.equal(first.extra?.model, ALIAS_B);

    mockFetch(reasoningReply('second chain'));
    const second = await withPreprocessor(aliasModel(ALIAS_B), () => complete([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: first.content, extra: first.extra },
        { role: 'user', content: 'next' },
    ] as IMessage[], { model: runtime }));

    assert.equal(second.ok, true);
    assert.equal(second.content, 'answer');
    const call = lastCall();
    assert.equal(call.body.model, ALIAS_B);
    assert.equal(call.body.messages[1].reasoning_content, 'chain bound to alias-b');
    assert.equal(JSON.stringify(call.body).includes('"extra"'), false);
});

test('openai alias: hook switch to C drops B-bound data', async () => {
    mockFetch(reasoningReply('fresh C'));
    const runtime = aliasModelRuntime();
    const bExtra: IMessageExtra = {
        protocol: 'openai',
        data: { reasoning_content: 'chain with alias-b' },
        model: ALIAS_B,
        provider: runtime.provider?.name,
    };

    const result = await withPreprocessor(aliasModel(ALIAS_C), () => complete([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'previous answer', extra: bExtra },
        { role: 'user', content: 'next' },
    ] as IMessage[], { model: runtime }));

    assert.equal(result.ok, true);
    assert.equal(result.content, 'answer');
    const call = lastCall();
    assert.equal(call.body.model, ALIAS_C);
    assert.equal(JSON.stringify(call.body).includes('chain with'), false);
    assert.equal(JSON.stringify(call.body).includes('"extra"'), false);
});

// ============================================================================
// Claude option.model alias: effective request target wins
// ============================================================================
// Claude has no preprocessor, but buildClaudePayload forwards option.model into
// the body. Replay compatibility and extra binding must follow that body model.

const CLAUDE_ALIAS_A = 'claude-alias-a';
const CLAUDE_ALIAS_B = 'claude-alias-b';

const claudeAliasRuntime = () => syntheticModel('claude', { model: CLAUDE_ALIAS_A });

const claudeThinkingReply = (thought: string, signature: string) => jsonResponse({
    id: 'msg_alias',
    type: 'message',
    role: 'assistant',
    content: [
        { type: 'thinking', thinking: thought, signature },
        { type: 'text', text: 'answer' },
    ],
    stop_reason: 'end_turn',
    usage: { input_tokens: 3, output_tokens: 2 },
});

test('claude alias: option.model switch to B drops A-bound replay data and binds the reply to B', async () => {
    mockFetch(claudeThinkingReply('fresh chain from b', 'sig-b'));
    const runtime = claudeAliasRuntime();
    const aExtra: IMessageExtra = {
        protocol: 'claude',
        data: {
            content: [
                { type: 'thinking', thinking: 'chain bound to alias-a', signature: 'sig-a' },
                { type: 'text', text: 'previous answer' },
            ],
        },
        model: CLAUDE_ALIAS_A,
        provider: runtime.provider?.name,
    };

    const result = await complete([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'previous answer', extra: aExtra },
    ] as IMessage[], { model: runtime, option: { model: CLAUDE_ALIAS_B } as any });

    assert.equal(result.ok, true);
    assert.equal(result.content, 'answer');

    const call = lastCall();
    assert.equal(call.body.model, CLAUDE_ALIAS_B);
    assert.deepEqual(call.body.messages[1].content, [{ type: 'text', text: 'previous answer' }]);
    assert.equal(JSON.stringify(call.body).includes('chain bound to alias-a'), false);
    assert.equal(JSON.stringify(call.body).includes('sig-a'), false);
    assert.equal(JSON.stringify(call.body).includes('"extra"'), false);

    assert.equal(result.extra?.model, CLAUDE_ALIAS_B);
    assert.equal(result.extra?.provider, runtime.provider?.name);
    // New records use the narrow replay shape and never carry a second copy of the body text.
    const replay = result.extra as { v?: number; slots: Array<{ kind: string }> };
    assert.equal(replay.v, 2);
    assert.deepEqual(replay.slots.map(slot => slot.kind), ['thinking', 'text']);
    assert.equal(JSON.stringify(replay).includes('answer'), false);
});

test('claude alias: B-bound replay data survives option.model to the same alias', async () => {
    const runtime = claudeAliasRuntime();
    mockFetch(claudeThinkingReply('chain bound to alias-b', 'sig-b'));
    const first = await complete('first', { model: runtime, option: { model: CLAUDE_ALIAS_B } as any });
    assert.equal(first.ok, true);
    assert.equal(first.extra?.model, CLAUDE_ALIAS_B);

    mockFetch(claudeThinkingReply('second chain', 'sig-second'));
    const second = await complete([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: first.content, extra: first.extra },
        { role: 'user', content: 'next' },
    ] as IMessage[], { model: runtime, option: { model: CLAUDE_ALIAS_B } as any });

    assert.equal(second.ok, true);
    assert.equal(second.content, 'answer');
    const call = lastCall();
    assert.equal(call.body.model, CLAUDE_ALIAS_B);
    const replayed = JSON.stringify(call.body.messages[1].content);
    assert.equal(replayed.includes('chain bound to alias-b'), true);
    assert.equal(replayed.includes('sig-b'), true);
    assert.equal(JSON.stringify(call.body).includes('"extra"'), false);
});
