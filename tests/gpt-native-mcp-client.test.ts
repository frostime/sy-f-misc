// ============================================================================
// 原生 MCP HTTP/JSON 客户端传输测试（离线；fetch 为唯一外部边界）
// 覆盖：握手/通知/分页/调用顺序、session 与协议 header、重复 initialize、
// 启动信号只限制发现、游标环/RPC 错误不重试、session 缺失、取消与有界清理。
// ============================================================================
import assert from 'node:assert/strict';
import test from 'node:test';

import { NativeMcpClient } from '../src/func/gpt/tools/native-mcp/client.js';

const PROTOCOL = '2025-03-26';
const SESSION = 'session-1';

type RecordedCall = { url: string; request: Request; credentials?: RequestCredentials; body: any };

const json = (body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
const rpc = (call: RecordedCall, result: unknown, headers: Record<string, string> = {}): Response =>
    json({ jsonrpc: '2.0', id: call.body.id, result }, headers);
const empty = (status: number): Response => new Response(null, { status });

const installFetch = (respond: (call: RecordedCall) => Response | Promise<Response>) => {
    const calls: RecordedCall[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: any, init: any) => {
        const url = typeof input === 'string' ? input : input.url;
        const request = new Request(new URL(url, 'http://siyuan.local'), init);
        const text = request.method === 'DELETE' ? '' : await request.text();
        const call: RecordedCall = {
            url,
            request,
            credentials: init?.credentials,
            body: text ? JSON.parse(text) : undefined,
        };
        calls.push(call);
        return respond(call);
    }) as typeof fetch;
    return { calls, restore: () => { globalThis.fetch = original; } };
};

/** 已验证通过的 host：单页 system 工具，可替换 tools/call 的应答。 */
const healthyHost = (onCall: (call: RecordedCall) => Response | Promise<Response> = call => rpc(call, { content: [{ type: 'text', text: 'ok' }] })) =>
    installFetch(call => {
        if (call.request.method === 'DELETE') return empty(204);
        switch (call.body.method) {
            case 'initialize': return rpc(call, { protocolVersion: PROTOCOL }, { 'Mcp-Session-Id': SESSION });
            case 'notifications/initialized': return empty(202);
            case 'tools/list': return rpc(call, { tools: [{ name: 'system', inputSchema: { type: 'object' } }] });
            case 'tools/call': return onCall(call);
            default: return empty(500);
        }
    });

test('native MCP: one discovery, exact request headers/order, paged list, call and idempotent close', async () => {
    const host = installFetch(call => {
        if (call.request.method === 'DELETE') return empty(204);
        if (call.body.method === 'initialize') {
            return rpc(call, {
                protocolVersion: PROTOCOL,
                capabilities: {},
                serverInfo: { name: 'siyuan', version: '3.8.8' },
            }, { 'Mcp-Session-Id': SESSION });
        }
        if (call.body.method === 'notifications/initialized') return empty(202);
        if (call.body.method === 'tools/list') {
            if (call.body.params.cursor === 'page-2') {
                return rpc(call, { tools: [{ name: 'block', inputSchema: { type: 'object' } }] });
            }
            return rpc(call, {
                tools: [
                    { name: 'system', description: 'System', inputSchema: { type: 'object', properties: {} } },
                    { name: 'search', inputSchema: { type: 'object', properties: {} } },
                ],
                nextCursor: 'page-2',
            });
        }
        if (call.body.method === 'tools/call') {
            return rpc(call, { content: [{ type: 'text', text: '3.8.8' }] });
        }
        return empty(500);
    });

    try {
        const lifetime = new AbortController();
        const startup = new AbortController();
        const client = new NativeMcpClient(lifetime.signal);

        const [tools, duplicate] = await Promise.all([
            client.initialize(startup.signal),
            client.initialize(startup.signal),
        ]);
        assert.equal(duplicate, tools);
        assert.deepEqual(tools.map(tool => tool.name), ['system', 'search', 'block']);
        assert.equal(tools[0].description, 'System');
        assert.deepEqual(tools[1].inputSchema, { type: 'object', properties: {} });

        // 发现结束后取消启动信号，不应影响本次连接后续的工具调用。
        startup.abort();
        assert.deepEqual(await client.callTool('system', { action: 'version' }), {
            content: [{ type: 'text', text: '3.8.8' }],
        });

        const [init, initialized, firstPage, secondPage, call] = host.calls;
        assert.equal(host.calls.length, 5);
        assert.ok(host.calls.every(record => record.url === '/mcp'));
        assert.ok(host.calls.every(record => record.credentials === 'same-origin'));

        assert.equal(init.request.method, 'POST');
        assert.match(init.request.headers.get('content-type') ?? '', /application\/json/);
        const accept = init.request.headers.get('accept') ?? '';
        assert.ok(accept.includes('application/json'));
        assert.ok(accept.includes('text/event-stream'));
        assert.equal(init.request.headers.get('mcp-session-id'), null);
        assert.equal(init.request.headers.get('mcp-protocol-version'), null);
        assert.equal(init.body.params.protocolVersion, PROTOCOL);
        assert.equal(init.body.params.clientInfo.name, 'sy-f-misc-gpt');

        assert.equal(initialized.body.id, undefined);
        assert.equal(initialized.request.method, 'POST');
        assert.equal(initialized.request.headers.get('mcp-session-id'), SESSION);
        assert.equal(initialized.request.headers.get('mcp-protocol-version'), PROTOCOL);
        assert.deepEqual(firstPage.body.params, {});
        assert.deepEqual(secondPage.body.params, { cursor: 'page-2' });
        assert.deepEqual(call.body.params, { name: 'system', arguments: { action: 'version' } });

        await client.close();
        const remove = host.calls.at(-1)!;
        assert.equal(remove.request.method, 'DELETE');
        assert.equal(remove.request.headers.get('mcp-session-id'), SESSION);
        assert.equal(remove.request.headers.get('mcp-protocol-version'), PROTOCOL);
        const settled = host.calls.length;
        await client.close();
        assert.equal(host.calls.length, settled);
        await assert.rejects(client.callTool('system', {}), /closed/i);
        assert.equal(host.calls.length, settled);
    } finally {
        host.restore();
    }
});

test('native MCP: cursor cycles and JSON-RPC list errors are explicit and not retried', async () => {
    const scenarios = [
        {
            label: 'cursor cycle',
            list: (call: RecordedCall) => rpc(call, { tools: [], nextCursor: 'loop' }),
            pattern: /cursor/i,
            listCalls: 2,
        },
        {
            label: 'RPC error',
            list: (call: RecordedCall) => json({
                jsonrpc: '2.0',
                id: call.body.id,
                error: { code: -32603, message: 'catalog unavailable' },
            }),
            pattern: /catalog unavailable/,
            listCalls: 1,
        },
    ];

    for (const scenario of scenarios) {
        const host = installFetch(call => {
            if (call.request.method === 'DELETE') return empty(204);
            if (call.body.method === 'initialize') return rpc(call, { protocolVersion: PROTOCOL }, { 'Mcp-Session-Id': SESSION });
            if (call.body.method === 'notifications/initialized') return empty(202);
            if (call.body.method === 'tools/list') return scenario.list(call);
            return empty(500);
        });
        try {
            const client = new NativeMcpClient(new AbortController().signal);
            await assert.rejects(client.initialize(new AbortController().signal), scenario.pattern, scenario.label);
            assert.equal(
                host.calls.filter(record => record.body?.method === 'tools/list').length,
                scenario.listCalls,
                scenario.label,
            );
            await assert.rejects(client.callTool('system', {}), /not initialized/i);
            await client.close();
            const remove = host.calls.at(-1)!;
            assert.equal(remove.request.method, 'DELETE', scenario.label);
            assert.equal(remove.request.headers.get('mcp-session-id'), SESSION, scenario.label);
        } finally {
            host.restore();
        }
    }
});

test('native MCP: JSON-RPC call errors and mismatched response ids are failures, not results', async () => {
    let calls = 0;
    const host = healthyHost(call => {
        calls++;
        if (calls === 1) {
            return json({ jsonrpc: '2.0', id: call.body.id, error: { code: -32000, message: 'tool exploded' } });
        }
        return json({ jsonrpc: '2.0', id: call.body.id + 1, result: { content: [] } });
    });
    try {
        const client = new NativeMcpClient(new AbortController().signal);
        await client.initialize(new AbortController().signal);
        await assert.rejects(client.callTool('system', {}), /tool exploded/);
        await assert.rejects(client.callTool('system', {}), /different request id/i);
        assert.equal(host.calls.filter(record => record.body?.method === 'tools/call').length, 2);
        await client.close();
    } finally {
        host.restore();
    }
});

test('native MCP: a sessionless initialize response is refused before notification or listing', async () => {
    const host = installFetch(call => {
        if (call.body.method === 'initialize') return rpc(call, { protocolVersion: PROTOCOL });
        return empty(202);
    });
    try {
        const client = new NativeMcpClient(new AbortController().signal);
        await assert.rejects(client.initialize(new AbortController().signal), /Mcp-Session-Id/);
        assert.deepEqual(host.calls.map(record => record.body.method), ['initialize']);
        await client.close();
        assert.equal(host.calls.length, 1);
    } finally {
        host.restore();
    }
});

test('native MCP: an unsupported version is refused but its initialize session is still deleted on close', async () => {
    const host = installFetch(call => {
        if (call.request.method === 'DELETE') return empty(204);
        if (call.body.method === 'initialize') {
            return rpc(call, { protocolVersion: '2099-01-01' }, { 'Mcp-Session-Id': SESSION });
        }
        return empty(202);
    });
    try {
        const client = new NativeMcpClient(new AbortController().signal);
        await assert.rejects(client.initialize(new AbortController().signal), /unsupported protocol/);
        assert.deepEqual(host.calls.map(record => record.body.method), ['initialize']);

        await client.close();
        const remove = host.calls.at(-1)!;
        assert.equal(remove.request.method, 'DELETE');
        assert.equal(remove.request.headers.get('mcp-session-id'), SESSION);
    } finally {
        host.restore();
    }
});

test('native MCP: lifetime abort cancels an in-flight call, and close still deletes the known session', async () => {
    let pendingSignal: AbortSignal | undefined;
    const host = healthyHost(call => new Promise<Response>((_, reject) => {
        pendingSignal = call.request.signal;
        call.request.signal.addEventListener('abort', () => reject(call.request.signal.reason), { once: true });
    }));
    try {
        const lifetime = new AbortController();
        const client = new NativeMcpClient(lifetime.signal);
        await client.initialize(new AbortController().signal);

        const pending = client.callTool('system', {});
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.ok(pendingSignal);
        lifetime.abort();
        await assert.rejects(pending, /cancelled|closed|abort/i);
        await assert.rejects(client.callTool('system', {}), /closed/i);

        await client.close();
        const remove = host.calls.at(-1)!;
        assert.equal(remove.request.method, 'DELETE');
        assert.equal(remove.request.headers.get('mcp-session-id'), SESSION);
        assert.equal(remove.request.headers.get('mcp-protocol-version'), PROTOCOL);
    } finally {
        host.restore();
    }
});
