import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { ToolExecutor } from '../src/func/gpt/tools/executor';
import { ToolExecuteStatus } from '../src/func/gpt/tools/types';
import { toolsManager } from '../src/func/gpt/model/config';
import { closeNativeMcp, getNativeMcpGroup, initializeNativeMcp, nativeMcpState, NATIVE_MCP_GROUP_NAME } from '../src/func/gpt/tools/native-mcp';

const originalFetch = globalThis.fetch;
const definition = (name = 'system') => ({ name, description: name, inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['version'] } }, required: ['action'] } });

function installHost(tools: unknown[] = [definition()]) {
    const calls: { method: string; params?: any }[] = [];
    let reply: unknown = { content: [{ type: 'text', text: '3.8.8' }] };
    globalThis.fetch = async (_url, options) => {
        if (options?.method === 'DELETE') return new Response(null, { status: 204 });
        const request = JSON.parse(String(options?.body));
        calls.push(request);
        if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
        let result: unknown;
        if (request.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
        if (request.method === 'tools/list') result = { tools };
        if (request.method === 'tools/call') result = reply;
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'fixture-session' } });
    };
    const host = { calls, setReply: (value: unknown) => { reply = value; }, executions: () => calls.filter(call => call.method === 'tools/call') };
    return host;
}

const createExecutor = () => {
    const executor = new ToolExecutor();
    const group = getNativeMcpGroup();
    assert.ok(group);
    executor.registerToolGroup(group);
    return executor;
};
const selected = (executor: ToolExecutor) => executor.getEnabledToolDefinitions().map(tool => tool.function.name);

beforeEach(() => {
    toolsManager({ groupDefaults: {}, toolDefaults: {}, toolPermissionOverrides: {} });
});
afterEach(async () => {
    await closeNativeMcp();
    globalThis.fetch = originalFetch;
});

test('discovery is a shared snapshot but selection and approval remain per executor', async () => {
    const host = installHost([definition(), definition('search')]);
    await initializeNativeMcp(new AbortController().signal);
    const a = createExecutor();
    const b = createExecutor();
    assert.deepEqual(selected(a), []);
    assert.equal(a.isToolEnabled('sy_mcp_system'), false);
    a.toggleGroupEnabled(NATIVE_MCP_GROUP_NAME, true);
    b.toggleGroupEnabled(NATIVE_MCP_GROUP_NAME, true);
    a.setToolEnabled('sy_mcp_system', true);
    assert.deepEqual(selected(a), ['sy_mcp_system']);
    assert.deepEqual(selected(b), []);
    assert.equal(host.calls.filter(call => call.method === 'tools/list').length, 1);

    a.setExecutionApprovalCallback(async () => ({ approved: false }));
    assert.equal((await a.execute('sy_mcp_system', { action: 'version' })).status, ToolExecuteStatus.EXECUTION_REJECTED);
    assert.equal(host.executions().length, 0);
    a.setExecutionApprovalCallback(async () => ({ approved: true }));
    // No result callback: default success must not require a second approval.
    assert.equal((await a.execute('sy_mcp_system', { action: 'version' })).finalText, '3.8.8');
    assert.deepEqual(host.executions()[0].params, { name: 'system', arguments: { action: 'version' } });
    assert.equal((await b.execute('sy_mcp_system', { action: 'version' })).status, ToolExecuteStatus.EXECUTION_REJECTED);
    assert.equal(host.executions().length, 1);

    toolsManager.update('toolPermissionOverrides', 'sy_mcp_system', { executionPolicy: 'auto', resultApprovalPolicy: 'always' });
    b.setResultApprovalCallback(async () => ({ approved: false, rejectReason: 'private' }));
    // Disabled-by-default only filters definitions, never by-name execution.
    assert.equal((await b.execute('sy_mcp_system', { action: 'version' })).status, ToolExecuteStatus.RESULT_REJECTED);
    assert.equal(host.executions().length, 2);
});

test('text and structured content survive formatting; unsupported or error content never becomes success', async () => {
    const host = installHost();
    await initializeNativeMcp(new AbortController().signal);
    const executor = createExecutor();
    toolsManager.update('toolPermissionOverrides', 'sy_mcp_system', { executionPolicy: 'auto', resultApprovalPolicy: 'never' });
    host.setReply({ content: [{ type: 'text', text: 'explanation' }], structuredContent: { version: '3.8.8' } });
    const both = await executor.execute('sy_mcp_system', {});
    assert.equal(both.status, ToolExecuteStatus.SUCCESS);
    assert.match(both.finalText!, /explanation/);
    assert.match(both.finalText!, /"version": "3.8.8"/);
    host.setReply({ structuredContent: { count: 3 } });
    assert.match((await executor.execute('sy_mcp_system', {})).finalText!, /"count": 3/);
    host.setReply({ content: [{ type: 'text', text: 'native page contents' }] });
    assert.equal((await executor.execute('sy_mcp_system', { limit: 2 })).finalText, 'native page contents', 'native row/page limits must not become character limits');
    host.setReply({ content: [] });
    assert.equal((await executor.execute('sy_mcp_system', {})).finalText, '');
    host.setReply({ isError: true, content: [{ type: 'text', text: 'backend rejected operation' }] });
    const failure = await executor.execute('sy_mcp_system', {});
    assert.equal(failure.status, ToolExecuteStatus.ERROR);
    assert.match(failure.finalText!, /backend rejected operation/);
    host.setReply({ content: [{ type: 'text', text: 'file was created' }, { type: 'image', data: 'binary-that-must-not-be-sent', mimeType: 'image/png' }], structuredContent: { id: 'created' } });
    const partial = await executor.execute('sy_mcp_system', {});
    assert.equal(partial.status, ToolExecuteStatus.ERROR);
    assert.match(partial.finalText!, /image/);
    assert.match(partial.finalText!, /file was created/);
    assert.match(partial.finalText!, /created/);
    assert.match(partial.finalText!, /操作可能已执行/);
    assert.doesNotMatch(partial.finalText!, /binary-that-must-not-be-sent/);
    host.setReply({ content: [{ type: 'text', text: 42 }] });
    const malformed = await executor.execute('sy_mcp_system', {});
    assert.equal(malformed.status, ToolExecuteStatus.ERROR);
    assert.match(malformed.finalText!, /text 内容缺少/);
    assert.doesNotMatch(malformed.finalText!, /不支持返回内容类型：text/);
    assert.equal(host.executions().length, 7, 'never replay a call to recover unsupported output');
});

test('unrepresentable schemas are reported rather than silently simplified', async () => {
    installHost([
        definition(),
        { ...definition('root-policy'), inputSchema: { ...definition().inputSchema, additionalProperties: false } },
        { ...definition('reference'), inputSchema: { type: 'object', properties: { value: { $ref: '#/$defs/value' } } } },
    ]);
    await initializeNativeMcp(new AbortController().signal);
    assert.deepEqual(getNativeMcpGroup()!.tools.map(tool => tool.definition.function.name), ['sy_mcp_system']);
    const state = nativeMcpState();
    assert.equal(state.status, 'ready');
    if (state.status === 'ready') {
        assert.equal(state.skippedTools.length, 2);
        assert.match(state.skippedTools.join('\n'), /additionalProperties/);
        assert.match(state.skippedTools.join('\n'), /\$ref/);
    }
});

test('startup failure leaves no native group and does not throw into ordinary chat initialization', async () => {
    globalThis.fetch = async () => new Response(null, { status: 404 });
    await initializeNativeMcp(new AbortController().signal);
    assert.equal(nativeMcpState().status, 'unavailable');
    assert.equal(getNativeMcpGroup(), undefined);
    const local = new ToolExecutor();
    local.registerTool({ definition: { type: 'function', function: { name: 'local', parameters: { type: 'object', properties: {} } } }, permission: { executionPolicy: 'auto' }, execute: async () => ({ status: ToolExecuteStatus.SUCCESS, data: 'still works' }) });
    assert.equal((await local.execute('local', {})).finalText, 'still works');
});

test('startup has one five-second deadline even when the directory request stalls', async context => {
    let announceList: () => void;
    const listStarted = new Promise<void>(resolve => { announceList = resolve; });
    let lists = 0;
    globalThis.fetch = async (_url, options) => {
        if (options?.method === 'DELETE') return new Response(null, { status: 204 });
        const request = JSON.parse(String(options?.body));
        if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
        if (request.method === 'tools/list') {
            lists++;
            announceList();
            return new Promise<Response>((_, reject) => options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true }));
        }
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2025-03-26' } }), { headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'deadline' } });
    };
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const attempt = initializeNativeMcp(new AbortController().signal);
    await listStarted;
    context.mock.timers.tick(5000);
    await attempt;
    const state = nativeMcpState();
    assert.equal(state.status, 'unavailable');
    if (state.status === 'unavailable') assert.match(state.reason, /5 秒/);
    assert.equal(getNativeMcpGroup(), undefined);
    assert.equal(lists, 1);
});

test('old executors stay bound to their closed activation instead of silently adopting a new client', async () => {
    installHost();
    await initializeNativeMcp(new AbortController().signal);
    const old = createExecutor();
    old.setExecutionApprovalCallback(async () => ({ approved: true }));
    await closeNativeMcp();
    const next = installHost();
    await initializeNativeMcp(new AbortController().signal);
    assert.equal((await old.execute('sy_mcp_system', {})).status, ToolExecuteStatus.ERROR);
    assert.equal(next.executions().length, 0);
    const fresh = createExecutor();
    fresh.setExecutionApprovalCallback(async () => ({ approved: true }));
    assert.equal((await fresh.execute('sy_mcp_system', {})).status, ToolExecuteStatus.SUCCESS);
    assert.equal(next.executions().length, 1);
});
