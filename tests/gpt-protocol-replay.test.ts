import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { useStoreRef } from '@frostime/solid-signal-ref';
import { complete } from '../src/func/gpt/openai/complete';
import { executeToolChain } from '../src/func/gpt/tools/toolchain';
import type { ToolExecutor } from '../src/func/gpt/tools/executor';
import { toolChainToCompletion } from '../src/func/gpt/chat/ChatSession/tool-chain-result';
import { syntheticModel, mockFetch, restoreFetch, fetchCalls, jsonResponse, sseResponse } from './fixtures/gpt-protocol-host';

afterEach(restoreFetch);
const tools: IToolDefinition[] = [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: { q: { type: 'string' } } } } }];
const calls = ['A', 'B'].map((q, i) => ({ id: `call-${i}`, type: 'function' as const, function: { name: 'lookup', arguments: JSON.stringify({ q }) } }));
const details = [
    { type: 'reasoning.text', text: 'first block', index: 0, signature: 'SIG-A', format: 'anthropic-claude-v1' },
    { type: 'reasoning.text', text: 'second block', index: 0, signature: 'SIG-B' },
    { type: 'reasoning.encrypted', data: 'OPAQUE-A', id: 'enc-a' },
    { type: 'reasoning.encrypted', data: 'OPAQUE-B', id: 'enc-b' },
    { type: 'reasoning.server_tool_call', toolName: 'server_search', arguments: '{}', result: 'opaque result' },
];
const claudeBlocks = [
    { type: 'thinking', thinking: 'first block', signature: 'SIG-A' },
    { type: 'redacted_thinking', data: 'OPAQUE-A' },
    { type: 'text', text: 'checking' },
    { type: 'tool_use', id: 'call-0', name: 'lookup', input: { q: 'A' } },
    { type: 'thinking', thinking: 'second block', signature: 'SIG-B' },
    { type: 'tool_use', id: 'call-1', name: 'lookup', input: { q: 'B' } },
];
const geminiParts = [
    { functionCall: { id: 'call-0', name: 'lookup', args: { q: 'A' } }, thoughtSignature: 'SIG-A' },
    { functionCall: { id: 'call-1', name: 'lookup', args: { q: 'B' } } },
    { text: '', thoughtSignature: 'SIG-EMPTY-TEXT' },
];
const finalBlocks = [{ type: 'thinking', thinking: 'final analysis', signature: 'SIG-FINAL' }, { type: 'text', text: 'done' }];
const finalParts = [{ text: 'done', thoughtSignature: 'SIG-FINAL' }];

const reply = (protocol: LLMProviderProtocol, stream: boolean, final = false): Response => {
    if (protocol === 'openai') {
        if (!stream) return jsonResponse({ choices: [{ message: final
            ? { content: 'done', reasoning_content: 'final analysis', reasoning_details: [{ type: 'reasoning.encrypted', data: 'FINAL-OPAQUE' }] }
            : { content: 'checking', reasoning_content: 'raw analysis', reasoning_details: details, tool_calls: calls } }] });
        if (final) return sseResponse([
            { choices: [{ delta: { reasoning_content: 'final analysis', reasoning_details: [{ type: 'reasoning.encrypted', data: 'FINAL-OPAQUE' }] } }] },
            { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }, '[DONE]',
        ]);
        return sseResponse([
            { choices: [{ delta: { reasoning_content: 'raw ', reasoning_details: [{ type: 'reasoning.text', text: 'first ', index: 0, format: 'anthropic-claude-v1' }] } }] },
            { choices: [{ delta: { reasoning_content: 'analysis', reasoning_details: [{ type: 'reasoning.text', text: 'block', index: 0 }] } }] },
            { choices: [{ delta: { content: 'checking' } }] },
            { choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: '', index: 0, signature: 'SIG-A' }] } }] },
            { choices: [{ delta: { reasoning_details: [details[1], details[2], details[3], details[4]] } }] },
            { choices: [{ delta: { tool_calls: calls.map((call, index) => ({ ...call, index })) }, finish_reason: 'tool_calls' }] }, '[DONE]',
        ]);
    }
    if (protocol === 'claude') {
        const blocks = final ? finalBlocks : claudeBlocks;
        if (!stream) return jsonResponse({ content: blocks, stop_reason: final ? 'end_turn' : 'tool_use' });
        const events: any[] = [{ type: 'message_start', message: {} }];
        blocks.forEach((block: any, index) => {
            if (block.type === 'thinking') {
                events.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
                events.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: block.thinking } });
                events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: block.signature } });
            } else if (block.type === 'tool_use') {
                events.push({ type: 'content_block_start', index, content_block: { ...block, input: {} } });
                const args = JSON.stringify(block.input);
                events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: args.slice(0, 5) } });
                events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: args.slice(5) } });
            } else {
                events.push({ type: 'content_block_start', index, content_block: block });
            }
            events.push({ type: 'content_block_stop', index });
        });
        events.push({ type: 'message_delta', delta: { stop_reason: final ? 'end_turn' : 'tool_use' } }, { type: 'message_stop' });
        return sseResponse(events);
    }
    const parts = final ? finalParts : geminiParts;
    return stream ? sseResponse([
        ...parts.map(part => ({ candidates: [{ content: { role: 'model', parts: [part] } }] })),
        { candidates: [{ finishReason: 'STOP' }] },
    ]) : jsonResponse({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] });
};

const assertReplay = (protocol: LLMProviderProtocol, body: any, includeFinal: boolean) => {
    assert.equal(JSON.stringify(body).includes('"extra"'), false);
    if (protocol === 'openai') {
        const assistants = body.messages.filter((message: any) => message.role === 'assistant');
        assert.equal(assistants[0].reasoning_content, 'raw analysis');
        assert.deepEqual(assistants[0].reasoning_details, details);
        assert.deepEqual(assistants[0].tool_calls, calls);
        if (includeFinal) assert.deepEqual(assistants[1].reasoning_details, [{ type: 'reasoning.encrypted', data: 'FINAL-OPAQUE' }]);
    } else if (protocol === 'claude') {
        const assistants = body.messages.filter((message: any) => message.role === 'assistant');
        assert.deepEqual(assistants[0].content, claudeBlocks);
        if (includeFinal) assert.deepEqual(assistants[1].content, finalBlocks);
    } else {
        const models = body.contents.filter((message: any) => message.role === 'model');
        assert.deepEqual(models[0].parts, geminiParts);
        const responses = body.contents.flatMap((message: any) => message.parts).filter((part: any) => part.functionResponse);
        assert.deepEqual(responses.map((part: any) => part.functionResponse.id), ['call-0', 'call-1']);
        if (includeFinal) assert.deepEqual(models[1].parts, finalParts);
    }
};

for (const protocol of ['openai', 'claude', 'gemini'] as const) {
    for (const stream of [false, true]) {
        test(`${protocol} ${stream ? 'stream' : 'nonstream'}: opaque data survives tools, JSON history and the next request`, async () => {
            const model = syntheticModel(protocol);
            mockFetch(reply(protocol, stream), reply(protocol, stream, true), reply(protocol, false, true));
            const initial = await complete('lookup A and B', { model, stream, option: { tools } });
            assert.equal(initial.ok, true);
            assert.equal(initial.tool_calls?.length, 2);
            assert.equal(initial.extra?.model, model.model);
            assert.equal(initial.extra?.provider, model.provider.name);
            const received: string[] = [];
            const executor = { execute: async (_name: string, args: any) => {
                received.push(args.q);
                return { status: 'success', finalText: JSON.stringify({ value: args.q }) };
            } } as unknown as ToolExecutor;
            const chain = await executeToolChain(executor, initial, {
                model, contextMessages: [{ role: 'user', content: 'lookup A and B' }], chatOption: { tools, stream }, callbacks: { onLLMResponseUpdate: () => {} },
            });
            assert.equal(chain.status, 'completed');
            assert.deepEqual(received, ['A', 'B']);
            assertReplay(protocol, fetchCalls[1].body, false);
            const completion = toolChainToCompletion(chain, initial);
            assert.equal(completion.content, 'done');
            assert.equal(completion.content.includes('SIG-'), false);
            assert.ok(completion.extra);
            assert.ok((completion.toolChainMessages?.[0] as IAssistantMessage)?.extra);
            const stored = JSON.parse(JSON.stringify({
                message: { role: 'assistant', content: completion.content, extra: completion.extra },
                toolChainMessages: completion.toolChainMessages,
            }));
            const next = await complete([
                { role: 'user', content: 'lookup A and B' }, ...stored.toolChainMessages, stored.message,
                { role: 'user', content: 'next question' },
            ], { model, stream: false, option: { tools } });
            assert.equal(next.ok, true);
            assertReplay(protocol, fetchCalls[2].body, true);
        });
    }
}

test('Gemini no-id same-name calls in separate chunks remain independent and do not acquire fake wire ids', async () => {
    const parts = [
        { functionCall: { name: 'lookup', args: { q: 'A' } }, thoughtSignature: 'SIG-A' },
        { functionCall: { name: 'lookup', args: { q: 'B' } } },
    ];
    mockFetch(sseResponse([
        ...parts.map(part => ({ candidates: [{ content: { parts: [part] } }] })),
        { candidates: [{ finishReason: 'STOP' }] },
    ]), reply('gemini', false, true));
    const model = syntheticModel('gemini');
    const initial = await complete('lookup', { model, stream: true });
    assert.equal(initial.tool_calls?.length, 2);
    assert.notEqual(initial.tool_calls[0].id, initial.tool_calls[1].id);
    const received: string[] = [];
    await executeToolChain({ execute: async (_name: string, args: any) => {
        received.push(args.q); return { status: 'success', finalText: 'found' };
    } } as unknown as ToolExecutor, initial, { model, contextMessages: [{ role: 'user', content: 'lookup' }], callbacks: { onLLMResponseUpdate: () => {} } });
    assert.deepEqual(received, ['A', 'B']);
    const wire = fetchCalls[1].body;
    assert.deepEqual(wire.contents.find((message: any) => message.role === 'model').parts, parts);
    const responses = wire.contents.flatMap((message: any) => message.parts).filter((part: any) => part.functionResponse);
    assert.equal(responses.length, 2);
    assert.ok(responses.every((part: any) => !('id' in part.functionResponse)));
});



test('unsupported Gemini partial argument frames cannot execute a tool with fabricated empty arguments', async () => {
    mockFetch(sseResponse([{ candidates: [{ content: { parts: [{ functionCall: {
        name: 'lookup', partialArgs: [{ jsonPath: '$.q', stringValue: 'partial' }], willContinue: true,
    } }] }, finishReason: 'STOP' }] }]));
    const model = syntheticModel('gemini');
    const initial = await complete('lookup', { model, stream: true });
    assert.equal(initial.ok, false);
    assert.match(initial.content, /Partial function arguments/);
    assert.equal(initial.extra, undefined);
    let executed = 0;
    const chain = await executeToolChain({ execute: async () => { executed++; } } as unknown as ToolExecutor,
        initial, { model, contextMessages: [{ role: 'user', content: 'lookup' }] });
    assert.equal(chain.status, 'error');
    assert.equal(executed, 0);
});

test('reactive history and nested options are snapshotted before native replay cloning', async () => {
    for (const protocol of ['claude', 'gemini'] as const) {
        const extra: IMessageExtra = protocol === 'claude'
            ? { protocol, data: { content: finalBlocks as ClaudeContentBlock[] } }
            : { protocol, data: { parts: finalParts } };
        const store = useStoreRef({
            messages: [{ role: 'assistant', content: 'done', extra }, { role: 'user', content: 'next' }] as IMessage[],
            option: { stream: false, tools },
        });
        assert.throws(() => structuredClone((store().messages[0] as IAssistantMessage).extra), { name: 'DataCloneError' });
        const snapshot = structuredClone(store.unwrap());
        mockFetch(reply(protocol, false, true));
        const result = await complete(store().messages, { model: syntheticModel(protocol), option: store().option });
        assert.equal(result.ok, true, protocol);
        const wire = fetchCalls[0].body;
        assert.deepEqual(protocol === 'claude' ? wire.messages[0].content : wire.contents[0].parts,
            protocol === 'claude' ? finalBlocks : finalParts);
        assert.deepEqual(store.unwrap(), snapshot);
    }
});


