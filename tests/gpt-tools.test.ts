import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { beforeEach } from 'node:test';
import { createRoot } from 'solid-js';
import { ToolExecutor } from '../src/func/gpt/tools/executor';
import { DEFAULT_LIMIT_CHAR, truncateMiddle } from '../src/func/gpt/tools/utils';
import { ToolExecuteStatus, type Tool, type ToolGroup } from '../src/func/gpt/tools/types';
import { executeToolChain } from '../src/func/gpt/tools/toolchain';
import { toolsManager } from '../src/func/gpt/model/config';
import { CURRENT_SCHEMA, 历史版本兼容 } from '../src/func/gpt/model/config_migration';
import { toolChainToCompletion } from '../src/func/gpt/chat/ChatSession/tool-chain-result';
import { createMessageLifecycle, buildUserEditedVersion } from '../src/func/gpt/chat/ChatSession/message-lifecycle';
import { useTreeModel } from '../src/func/gpt/chat/ChatSession/use-tree-model';
import { modelRequests, setModelReplies } from './fixtures/gpt-tool-host';

let nextId = 0;
(globalThis as any).window = { Lute: { NewNodeID: () => `tool-test-${++nextId}` } };

beforeEach(() => {
    toolsManager({ groupDefaults: {}, toolDefaults: {}, toolPermissionOverrides: {} });
    setModelReplies();
});

const makeTool = (name = 'lookup'): Tool => ({
    definition: { type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } },
    permission: { executionPolicy: 'auto', resultApprovalPolicy: 'never' },
    execute: async args => ({ status: ToolExecuteStatus.SUCCESS, data: args.value ?? 'found' }),
});

const makeExecutor = (tool = makeTool(), rules?: ToolGroup['declareSkillRules']) => {
    const executor = new ToolExecutor();
    executor.registerToolGroup({ name: 'fixture', tools: [tool], declareSkillRules: rules });
    return executor;
};

const runTurn = async (executor: ToolExecutor, value: string) => {
    const initial: ICompletionResult = {
        ok: true, content: `working ${value}`, reasoning_content: 'intermediate thought',
        extra: { protocol: 'openai', data: { reasoning_details: [{ type: 'reasoning.encrypted', data: `initial-${value}` }] } },
        tool_calls: [{ id: `call-${value}`, type: 'function', function: { name: 'lookup', arguments: JSON.stringify({ value }) } }],
    };
    setModelReplies({ ok: true, content: `answer ${value}`, reasoning_content: `final thought ${value}`,
        extra: { protocol: 'openai', data: { reasoning_details: [{ type: 'reasoning.encrypted', data: `final-${value}` }] } },
    });
    const result = await executeToolChain(executor, initial, {
        contextMessages: [{ role: 'user', content: 'question' }],
        checkToolResults: true,
        callbacks: { onLLMResponseUpdate: () => {} },
    });
    return { result, completion: toolChainToCompletion(result, initial) };
};

const names = (executor: ToolExecutor) => executor.getEnabledToolDefinitions().map(tool => tool.function.name);

test('group-specific initial selection preserves existing defaults and later explicit choices', () => {
    const executor = makeExecutor();
    executor.registerToolGroup({ name: 'opt-in', defaultToolEnabled: false, tools: [makeTool('native')] });
    executor.toggleGroupEnabled('fixture', true);
    executor.toggleGroupEnabled('opt-in', true);
    assert.deepEqual(names(executor), ['lookup']);
    executor.setToolEnabled('native', true);
    executor.toggleGroupEnabled('opt-in', false);
    executor.toggleGroupEnabled('opt-in', true);
    assert.deepEqual(names(executor), ['lookup', 'native']);
});

test('on-demand rules are discoverable only for active tools, without requiring a group prompt', () => {
    const executor = makeExecutor(makeTool(), { protocol: { desc: 'fixture syntax', prompt: 'DO EXACTLY THIS' } });
    assert.deepEqual(names(executor), []);
    executor.toggleGroupEnabled('fixture', true);
    assert.deepEqual(names(executor), ['lookup', 'read-rule']);
    assert.match(executor.toolRules(), /Rule\/fixture\/protocol/);
    assert.match(executor.toolRules(), /read-rule/);
    executor.setToolEnabled('lookup', false);
    assert.deepEqual(names(executor), []);
    assert.doesNotMatch(executor.toolRules(), /Rule\/fixture\/protocol/);
});

test('pinned rules are supplied inline and do not add a reader to the model tool list', () => {
    const executor = makeExecutor(makeTool(), { short: { desc: 'short', prompt: 'PINNED REQUIREMENT', alwaysLoad: true } });
    executor.toggleGroupEnabled('fixture', true);
    assert.deepEqual(names(executor), ['lookup']);
    assert.match(executor.toolRules(), /PINNED REQUIREMENT/);
});

test('read-rule returns the complete registered document, rejects unknown names and exposes no old variable tools', async () => {
    const text = 'exact protocol\n'.repeat(1000);
    const executor = makeExecutor(makeTool(), { protocol: { desc: 'syntax', prompt: text } });
    const result = await executor.execute('read-rule', { name: 'Rule/fixture/protocol', limit: 5 });
    assert.equal(result.status, ToolExecuteStatus.SUCCESS);
    assert.equal(result.finalText, text);
    assert.equal((await executor.execute('read-rule', { name: 'Rule/fixture/missing' })).status, ToolExecuteStatus.NOT_FOUND);
    assert.equal((await executor.execute('read-rule', {})).status, ToolExecuteStatus.ERROR);
    for (const oldTool of ['ReadVar', 'ListVars', 'WriteVar', 'RemoveVars']) {
        assert.equal((await executor.execute(oldTool, {})).status, ToolExecuteStatus.NOT_FOUND);
    }
});

test('disabled tools remain callable by name and old variable syntax is passed as literal input', async () => {
    const tool = makeTool();
    let received: unknown;
    tool.execute = async args => {
        received = args;
        return { status: ToolExecuteStatus.SUCCESS, data: 'plain result' };
    };
    const executor = makeExecutor(tool);
    const args = { value: '$VAR_REF{{missing}}', nested: [{ value: '$VAR_REF{{other:1:3}}' }] };
    const result = await executor.execute('lookup', args);
    assert.deepEqual(names(executor), []);
    assert.deepEqual(received, args);
    assert.equal(result.finalText, 'plain result');
    assert.equal('cacheVarResult' in result, false);
    assert.equal('cacheVarArgs' in result, false);
});

test('an undeclared limit is an ordinary argument, and the default cap is 32K', async () => {
    const executor = makeExecutor();
    const value = 'abcdefghij';
    // `limit` 未在 schema 声明：只是普通入参，不能触发截断
    const undeclared = await executor.execute('lookup', { value, limit: 4 });
    assert.equal(undeclared.isTruncated, false);
    assert.equal(undeclared.finalText, value);

    const big = 'x'.repeat(DEFAULT_LIMIT_CHAR + 10);
    const truncated = await executor.execute('lookup', { value: big });
    assert.equal(truncated.formattedText, big);
    assert.equal(truncated.isTruncated, true);
    assert.match(truncated.finalText, /^x{10}/);
    assert.match(truncated.finalText, new RegExp(`省略后 10 个字符`));
    assert.doesNotMatch(truncated.finalText, /system log|VAR_REF|ReadVar/);
});

test('a declared limit is honored and zero still means unlimited', async () => {
    const tool = makeTool();
    (tool.definition.function.parameters as any).properties = {
        value: { type: 'string' },
        limit: { type: 'number' }
    };
    const executor = makeExecutor(tool);
    const value = 'abcdefghij';
    assert.equal(
        (await executor.execute('lookup', { value, limit: 4 })).finalText,
        'abcd\n\n...输出过长，省略后 6 个字符...'
    );
    assert.equal((await executor.execute('lookup', { value, limit: 0 })).finalText, value);
    assert.equal((await executor.execute('lookup', { value, limit: -1 })).finalText, value);
});

test('middle truncation keeps the tail so script stderr survives', () => {
    const output = `[stdout]\n${'a'.repeat(400)}\n\n[stderr]\n${'b'.repeat(400)}`;
    const result = truncateMiddle(output, 200);
    assert.equal(result.isTruncated, true);
    assert.match(result.content, /^\[stdout\]/);
    assert.match(result.content, /中间省略 \d+ 个字符/);
    assert.equal(result.content.endsWith('b'.repeat(100)), true);
    assert.equal(result.omittedLength, output.length - 200);
    assert.equal(truncateMiddle('short', 200).isTruncated, false);
});

test('every script tool declares limit and uses middle truncation', () => {
    const source = readFileSync('src/func/gpt/tools/script-tools.ts', 'utf8');
    assert.equal((source.match(/truncateForLLM: scriptTruncateForLLM/g) ?? []).length, 3);
    assert.equal((source.match(/limit: \{/g) ?? []).length, 3);
    assert.match(source, /truncateMiddle/);
});

test('rejected results stay out of model messages and cannot be recovered through the rule reader', async () => {
    const tool = makeTool();
    tool.permission.resultApprovalPolicy = 'always';
    tool.execute = async () => ({ status: ToolExecuteStatus.SUCCESS, data: 'PRIVATE RESULT SENTINEL' });
    const executor = makeExecutor(tool);
    executor.setResultApprovalCallback(async () => ({ approved: false, rejectReason: 'keep private' }));
    const { result } = await runTurn(executor, 'request');
    assert.equal(result.toolCallHistory[0].result.status, ToolExecuteStatus.RESULT_REJECTED);
    const toolMessage = modelRequests[0].find(message => message.role === 'tool');
    assert.match(String(toolMessage?.content), /keep private/);
    assert.doesNotMatch(JSON.stringify(modelRequests), /PRIVATE RESULT SENTINEL/);
    assert.equal((await executor.execute('read-rule', { name: 'PRIVATE RESULT SENTINEL' })).status, ToolExecuteStatus.NOT_FOUND);
});

test('tool chains retain native messages and final content without building a compressed transcript', async () => {
    const executor = makeExecutor();
    const { result, completion } = await runTurn(executor, 'native');
    assert.equal(result.responseContent, 'answer native');
    assert.deepEqual(result.messages.toolChain.map(message => message.role), ['assistant', 'tool', 'assistant']);
    assert.equal(modelRequests[0][2].content, 'native');
    assert.equal(result.toolCallHistory[0].result.data, 'native');
    assert.equal(completion.content, 'answer native');
    assert.equal(completion.reasoning_content, 'final thought native');
    assert.deepEqual(completion.toolChainMessages?.map(message => message.role), ['assistant', 'tool']);
    assert.equal('reasoning_content' in completion.toolChainMessages![0], false);
    assert.equal('toolChainContent' in result, false);
    assert.equal('hintSize' in completion, false);
});

test('a native turn ending at a tool message retains that message rather than inventing final content', async () => {
    const { result } = await runTurn(makeExecutor(), 'incomplete');
    result.messages.toolChain.pop();
    const completion = toolChainToCompletion(result, { content: 'initial' });
    assert.equal(completion.content, '');
    assert.deepEqual(completion.toolChainMessages?.map(message => message.role), ['assistant', 'tool']);
    assert.equal(completion.toolChainMessages?.[1].content, 'incomplete');
});

const userHistory = (): IChatSessionHistoryV2 => ({
    schema: 2, type: 'history', id: 'history', title: 'fixture', timestamp: 1,
    rootId: 'U', worldLine: ['U'],
    nodes: { U: { id: 'U', parent: null, children: [], type: 'message', role: 'user', currentVersionId: 'u1', versions: {
        u1: { id: 'u1', message: { role: 'user', content: 'question' } },
    } } },
});

const meta = { msgToSend: [{ role: 'user', content: 'question' }] as IMessage[], modelName: 'fixture-model' };

test('native tool turns remain bound to their prepared version across version and branch switches', async () => {
    const executor = makeExecutor();
    const first = (await runTurn(executor, 'v1')).completion;
    const second = (await runTurn(executor, 'v2')).completion;
    const branch = (await runTurn(executor, 'branch')).completion;
    createRoot(dispose => {
        try {
            const tree = useTreeModel();
            tree.fromHistory(userHistory());
            const lifecycle = createMessageLifecycle(tree, () => ({ model: 'fixture-model' } as IRuntimeLLM), () => `slot-${++nextId}`);
            const nodeId = lifecycle.prepareSlot('append');
            lifecycle.finalize(nodeId, first, meta);
            const v1 = tree.getNodeById(nodeId)!.currentVersionId;
            lifecycle.prepareSlot({ updateAt: 1 });
            const v2 = tree.getNodeById(nodeId)!.currentVersionId;
            tree.switchVersion(nodeId, v1);
            lifecycle.updateContent(nodeId, 'streaming v2');
            lifecycle.finalize(nodeId, second, meta);
            let node = tree.getNodeById(nodeId)!;
            assert.equal(node.currentVersionId, v1);
            assert.equal(node.versions[v1].toolChainMessages?.[1].content, 'v1');
            assert.equal(node.versions[v2].toolChainMessages?.[1].content, 'v2');
            assert.equal(node.versions[v2].message.content, 'answer v2');
            assert.deepEqual((node.versions[v1].toolChainMessages?.[0] as IAssistantMessage)?.extra, (first.toolChainMessages?.[0] as IAssistantMessage)?.extra);
            assert.deepEqual(node.versions[v2].message.extra, second.extra);
            const restored = useTreeModel();
            restored.fromHistory(JSON.parse(JSON.stringify(tree.toHistory({ id: 'replay', title: 'replay', timestamp: 1, updated: 1 }))));
            assert.deepEqual(restored.getNodeById(nodeId)?.versions[v2].message.extra, second.extra);
            assert.deepEqual((restored.getNodeById(nodeId)?.versions[v1].toolChainMessages?.[0] as IAssistantMessage)?.extra, (first.toolChainMessages?.[0] as IAssistantMessage)?.extra);
            tree.forkAt('U');
            const branchId = lifecycle.prepareSlot('append');
            lifecycle.finalize(branchId, branch, meta);
            tree.switchWorldLine(nodeId);
            assert.deepEqual(tree.getWorldLine(), ['U', nodeId]);
            node = tree.getNodeById(branchId)!;
            assert.equal(node.versions[node.currentVersionId].toolChainMessages?.[1].content, 'branch');
        } finally { dispose(); }
    });
});

test('continuing a legacy record creates a native version without rewriting the old payload', async () => {
    const completion = (await runTurn(makeExecutor(), 'continued')).completion;
    createRoot(dispose => {
        try {
            const history = userHistory();
            const old: IMessagePayload = {
                id: 'legacy', message: { role: 'assistant', content: '[System Tool Call Log] old tool\nold answer' },
                userPromptSlice: [31, 41], author: 'old-model',
            };
            history.nodes.U.children = ['A'];
            history.nodes.A = { id: 'A', parent: 'U', children: [], type: 'message', role: 'assistant', currentVersionId: 'legacy', versions: { legacy: old } };
            history.worldLine.push('A');
            const tree = useTreeModel();
            tree.fromHistory(history);
            const lifecycle = createMessageLifecycle(tree, () => ({ model: 'fixture-model' } as IRuntimeLLM), () => `slot-${++nextId}`);
            lifecycle.prepareSlot({ updateAt: 1 });
            lifecycle.finalize('A', completion, meta);
            const node = tree.getNodeById('A')!;
            assert.deepEqual(JSON.parse(JSON.stringify(node.versions.legacy)), old);
            assert.equal(node.versions[node.currentVersionId].userPromptSlice, undefined);
            assert.equal(node.versions[node.currentVersionId].toolChainMessages?.[1].content, 'continued');
        } finally { dispose(); }
    });
});

test('privacy-removal migration preserves settings and notifies only previously enabled users once', () => {
    const currentEnabled = {
        schema: '3.4',
        config: { enablePrivacyMask: true, privacyFields: [{ patterns: ['secret'], enabled: true }] },
        globalMiscConfigs: { privacyKeywords: '', privacyMask: '[redacted]' },
    };
    const migratedCurrent = 历史版本兼容(currentEnabled, 'gpt.config.json');
    assert.equal(migratedCurrent.privacyMaskRemovalNotice, true);
    assert.deepEqual((migratedCurrent.data as typeof currentEnabled).config, currentEnabled.config);
    assert.deepEqual((migratedCurrent.data as typeof currentEnabled).globalMiscConfigs, currentEnabled.globalMiscConfigs);
    assert.deepEqual((migratedCurrent.data as any).removedFeatures, { privacyMask: true });
    assert.equal((migratedCurrent.data as any).schema, CURRENT_SCHEMA);
    assert.equal(历史版本兼容(migratedCurrent.data, 'gpt.config.json').privacyMaskRemovalNotice, false);

    const legacyEnabled = {
        schema: '3.4', config: { enablePrivacyMask: false },
        globalMiscConfigs: { privacyKeywords: 'private term', privacyMask: '***' },
    };
    const migratedLegacy = 历史版本兼容(legacyEnabled, 'gpt.config.json');
    assert.equal(migratedLegacy.privacyMaskRemovalNotice, true);
    assert.equal((migratedLegacy.data as typeof legacyEnabled).globalMiscConfigs.privacyKeywords, 'private term');

    const disabled = {
        schema: '3.4', config: { enablePrivacyMask: false, privacyFields: [{ patterns: ['saved'], enabled: true }] },
        globalMiscConfigs: { privacyKeywords: '  ', privacyMask: '***' },
    };
    const migratedDisabled = 历史版本兼容(disabled, 'gpt.config.json');
    assert.equal(migratedDisabled.privacyMaskRemovalNotice, false);
    assert.deepEqual((migratedDisabled.data as typeof disabled).config, disabled.config);
    assert.deepEqual((migratedDisabled.data as typeof disabled).globalMiscConfigs, disabled.globalMiscConfigs);

    const oldSchema = {
        schema: '2.0', config: {},
        globalMiscConfigs: { enablePrivacyMask: true, privacyFields: [{ patterns: ['legacy'], enabled: true }], privacyKeywords: 'legacy keyword', privacyMask: '###' },
    };
    const migratedOld = 历史版本兼容(oldSchema, 'gpt.config.json');
    assert.equal(migratedOld.privacyMaskRemovalNotice, true);
    assert.deepEqual((migratedOld.data as typeof oldSchema).globalMiscConfigs, oldSchema.globalMiscConfigs);
    assert.deepEqual((migratedOld.data as typeof oldSchema).config, oldSchema.config);
});

test('configuration migration removes legacy generation mode but preserves unrelated settings', () => {
    const stored = { schema: '3.3', config: { toolCallMode: 'legacy', attachedHistory: 9 }, toolsManager: { groupDefaults: { fixture: true } } };
    const migrated = 历史版本兼容(stored, 'gpt.config.json');
    assert.equal(migrated.migrated, true);
    assert.equal((migrated.data as typeof stored).schema, CURRENT_SCHEMA);
    assert.deepEqual((migrated.data as typeof stored).config, { attachedHistory: 9 });
    assert.deepEqual((migrated.data as typeof stored).toolsManager, { groupDefaults: { fixture: true } });
    assert.equal(历史版本兼容(migrated.data, 'gpt.config.json').migrated, false);
});

test('adding a user-authored version drops replay and leaves the old version untouched', () => {
    const narrow: IMessageExtra = {
        protocol: 'claude', v: 2, model: 'fixture-model',
        slots: [{ kind: 'thinking', chars: 14, signature: 'SIG-NARROW' }, { kind: 'text' }],
    };
    const legacy: IMessageExtra = {
        protocol: 'gemini', model: 'fixture-model',
        data: { parts: [{ text: 'old answer' }, { text: '', thoughtSignature: 'SIG-LEGACY' }] },
    };

    for (const [label, extra] of [['narrow', narrow], ['legacy', legacy]] as const) {
        const history = userHistory();
        const original: IMessagePayload = {
            id: 'orig',
            message: { role: 'assistant', content: 'old answer', reasoning_content: 'final analysis', extra },
            author: 'fixture-model',
            timestamp: 1,
        };
        history.nodes.U.children = ['A'];
        history.nodes.A = {
            id: 'A', parent: 'U', children: [], type: 'message', role: 'assistant',
            currentVersionId: 'orig', versions: { orig: original },
        };
        history.worldLine.push('A');
        const before = JSON.parse(JSON.stringify(original));

        createRoot(dispose => {
            try {
                const tree = useTreeModel();
                tree.fromHistory(history);
                const node = tree.getNodeById('A')!;
                const payload = buildUserEditedVersion(node.versions.orig, 'edited answer', 'v2');
                tree.addVersion('A', payload);
                tree.switchVersion('A', 'v2');

                const updated = tree.getNodeById('A')!;
                assert.equal(updated.currentVersionId, 'v2', label);

                // The new version must not inherit a replay copy that could override the edit.
                assert.equal(updated.versions.v2.message.content, 'edited answer', label);
                assert.equal('extra' in updated.versions.v2.message, false, label);
                assert.equal(JSON.stringify(updated.versions.v2).includes('SIG-'), false, label);
                // Fields without an edit entry point are preserved, not rewritten.
                assert.equal((updated.versions.v2.message as IAssistantMessage).reasoning_content, 'final analysis', label);
                assert.equal(updated.versions.v2.author, 'User', label);

                // The old version keeps its payload byte-for-byte, including replay.
                assert.deepEqual(JSON.parse(JSON.stringify(updated.versions.orig)), before, label);

                // A reload sees the same thing: the edited version is the one a request would build from.
                const restored = useTreeModel();
                restored.fromHistory(JSON.parse(JSON.stringify(tree.toHistory({ id: 'v', title: 'v', timestamp: 1, updated: 1 }))));
                const reloaded = restored.getNodeById('A')!;
                assert.equal(reloaded.versions.orig.message.content, 'old answer', label);
                assert.equal('extra' in reloaded.versions.v2.message, false, label);
                assert.equal(reloaded.versions.v2.message.content, 'edited answer', label);
            } finally { dispose(); }
        });
    }
});
