import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from 'solid-js';
import { useTreeModel } from '../src/func/gpt/chat/ChatSession/use-tree-model';
import { createMessageLifecycle } from '../src/func/gpt/chat/ChatSession/message-lifecycle';
import { describeUsage } from '../src/func/gpt/chat/components/usage-display';
import { sumReportedUsage } from '../src/func/gpt/tools/usage-sum';
import { commitSubtreeRemoval } from '../src/func/gpt/chat/ChatSession/subtree-removal';

let nextId = 0;
(globalThis as any).window = { Lute: { NewNodeID: () => `generated-${++nextId}` } };

const fixture = (): IChatSessionHistoryV2 => {
    const structure = {
        R: { parent: null, children: ['A', 'D'] },
        A: { parent: 'R', children: ['B', 'C'] },
        B: { parent: 'A', children: [] },
        C: { parent: 'A', children: [] },
        D: { parent: 'R', children: [] },
    };
    const nodes = Object.fromEntries(Object.entries(structure).map(([id, links]) => [id, {
        id, ...links, type: 'message', role: 'assistant', currentVersionId: 'old',
        versions: {
            old: {
                id: 'old', message: { role: 'assistant', content: `answer ${id}`, reasoning_content: `thought ${id}` },
                usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130, prompt_tokens_details: { cached_tokens: 60 } },
                time: { latency: 25 }, author: 'old-model',
            },
            alternative: {
                id: 'alternative', message: { role: 'assistant', content: `alternative ${id}` },
                usage: { prompt_tokens: 80, completion_tokens: 10, total_tokens: 90 }, author: 'other-model',
            },
        },
    }])) as IChatSessionHistoryV2['nodes'];
    return {
        schema: 2, type: 'history', id: 'source', title: 'source', timestamp: 1,
        nodes, rootId: 'R', worldLine: ['R', 'A', 'B'], bookmarks: { A: 'shared', B: 'removed', C: 'retained' },
    };
};

const snapshot = (tree: ReturnType<typeof useTreeModel>) => tree.toHistory({ id: 'source', title: 'source', timestamp: 1, updated: 1 });
const withTree = (run: (tree: ReturnType<typeof useTreeModel>) => void) => createRoot(dispose => {
    try {
        const tree = useTreeModel();
        tree.fromHistory(fixture());
        run(tree);
    } finally {
        dispose();
    }
});

const assertTreeConsistent = (history: IChatSessionHistoryV2) => {
    for (const [id, node] of Object.entries(history.nodes)) {
        if (node.parent) assert.ok(history.nodes[node.parent].children.includes(id));
        else assert.equal(id, history.rootId);
        for (const childId of node.children) assert.equal(history.nodes[childId].parent, id);
    }
    history.worldLine.forEach((id, index) => {
        assert.ok(history.nodes[id]);
        assert.equal(history.nodes[id].parent, index === 0 ? null : history.worldLine[index - 1]);
    });
    for (const id of Object.keys(history.bookmarks || {})) assert.ok(history.nodes[id]);
};

test('cut a branch: copy all versions, prune only exclusive nodes, retain shared paths and bookmarks', () => withTree(tree => {
    const source = snapshot(tree);
    tree.validateSubtreeDeletion({ rootId: 'R', leafIds: ['B'] });
    const extracted = tree.extractSubtree({ rootId: 'R', leafIds: ['B'] });
    const copiedB = extracted.nodes[extracted.idMap.B];
    assert.deepEqual(copiedB.versions, source.nodes.B.versions);
    assert.notEqual(copiedB.id, 'B');
    assert.equal(extracted.nodes[extracted.rootId].parent, null);
    assert.deepEqual(extracted.worldLine, ['R', 'A', 'B'].map(id => extracted.idMap[id]));
    assert.equal(tree.deleteSubtree({ rootId: 'R', leafIds: ['B'] }), 1);
    const remaining = snapshot(tree);
    assert.deepEqual(Object.keys(remaining.nodes).sort(), ['A', 'C', 'D', 'R']);
    assert.deepEqual(remaining.nodes.A.children, ['C']);
    assert.deepEqual(remaining.nodes.C, source.nodes.C);
    assert.deepEqual(remaining.nodes.R, source.nodes.R);
    assert.deepEqual(remaining.bookmarks, { A: 'shared', C: 'retained' });
    assert.deepEqual(remaining.worldLine, ['R', 'A']);
    assert.equal(tree.count(), 2);
    assertTreeConsistent(remaining);
    copiedB.versions.old.message.content = 'edited copy';
    assert.equal(source.nodes.B.versions.old.message.content, 'answer B');
}));

test('an intermediate endpoint fails before mutation; copying the same endpoint remains allowed', () => withTree(tree => {
    const before = snapshot(tree);
    assert.throws(() => tree.validateSubtreeDeletion({ rootId: 'R', leafIds: ['A'] }), /中间终点/);
    assert.throws(() => tree.deleteSubtree({ rootId: 'R', leafIds: ['A', 'D'] }), /中间终点/, 'one invalid endpoint must reject the entire selection');
    assert.deepEqual(snapshot(tree), before);
    assert.throws(() => tree.deleteSubtree({ rootId: 'A', leafIds: ['D'] }), /不在/);
    assert.deepEqual(snapshot(tree), before);
    const copied = tree.extractSubtree({ rootId: 'R', leafIds: ['A'] });
    assert.equal(Object.keys(copied.nodes).length, 2);
    assert.deepEqual(copied.nodes[copied.idMap.A].children, []);
}));

test('deleting a complete non-active subtree leaves the current world line unchanged', () => withTree(tree => {
    assert.equal(tree.deleteSubtree({ rootId: 'D' }), 1);
    const history = snapshot(tree);
    assert.deepEqual(history.worldLine, ['R', 'A', 'B']);
    assert.deepEqual(history.nodes.R.children, ['A']);
    assertTreeConsistent(history);
}));

test('multiple endpoints prune their exclusive common prefix; deleting the whole tree produces a genuinely empty session', () => withTree(tree => {
    assert.equal(tree.deleteSubtree({ rootId: 'R', leafIds: ['B', 'C', 'B', 'A'] }), 3);
    let history = snapshot(tree);
    assert.deepEqual(Object.keys(history.nodes).sort(), ['D', 'R']);
    assert.deepEqual(history.worldLine, ['R']);
    assert.deepEqual(history.bookmarks, {});
    assertTreeConsistent(history);
    assert.equal(tree.deleteSubtree({ rootId: 'R' }), 2);
    history = snapshot(tree);
    assert.deepEqual(history.nodes, {});
    assert.deepEqual(history.worldLine, []);
    assert.equal(history.rootId, null);
    assert.equal(tree.hasMessages(), false);
    assertTreeConsistent(history);
}));

test('loading an extracted history replaces the source map instead of merging orphan nodes or bookmarks', () => withTree(tree => {
    const extracted = tree.extractSubtree({ rootId: 'A', leafIds: ['C'] });
    tree.fromHistory({ ...fixture(), ...extracted, bookmarks: { [extracted.idMap.C]: 'copied' } });
    assert.deepEqual(Object.keys(tree.getNodes()).sort(), Object.keys(extracted.nodes).sort());
    assert.deepEqual(tree.getBookmarks(), { [extracted.idMap.C]: 'copied' });
    assertTreeConsistent(snapshot(tree));
    tree.clear();
    assert.deepEqual(tree.getNodes(), {});
    assert.deepEqual(tree.getBookmarks(), {});
}));

test('whole-tree cut saves the complete destination before persisting an empty source', () => withTree(tree => {
    const original = snapshot(tree);
    const destination = { ...original, ...tree.extractSubtree({ rootId: 'R' }), id: 'destination' };
    const saved = new Map<string, IChatSessionHistoryV2>();
    const order: string[] = [];
    const count = commitSubtreeRemoval({
        source: { snapshot: () => snapshot(tree), remove: () => tree.deleteSubtree({ rootId: 'R' }), restore: tree.fromHistory },
        destination,
        persistence: {
            save(history) {
                if (history.id === 'destination') assert.deepEqual(snapshot(tree), original, 'source must still be intact when saving destination');
                saved.set(history.id, structuredClone(history));
                order.push(history.id);
                return true;
            },
            remove(id) { saved.delete(id); },
        },
        onCommit() {
            assert.equal(saved.get('source').rootId, null);
            assert.equal(Object.keys(saved.get('destination').nodes).length, 5);
        },
    });
    assert.equal(count, 5);
    assert.deepEqual(order, ['destination', 'source']);
    assert.deepEqual(saved.get('source').nodes, {});
    assert.deepEqual(saved.get('source').bookmarks, {});
}));

test('cut local-save failures leave the original tree intact and clean the destination when rollback is saved', () => {
    for (const failingSave of ['destination', 'source']) withTree(tree => {
        const original = snapshot(tree);
        const destination = { ...original, ...tree.extractSubtree({ rootId: 'R', leafIds: ['B'] }), id: 'destination' };
        const saved = new Map([['source', original]]);
        let failed = false;
        assert.throws(() => commitSubtreeRemoval({
            source: { snapshot: () => snapshot(tree), remove: () => tree.deleteSubtree({ rootId: 'R', leafIds: ['B'] }), restore: tree.fromHistory },
            destination,
            persistence: {
                save(history) {
                    if (!failed && history.id === failingSave) { failed = true; return false; }
                    saved.set(history.id, structuredClone(history));
                    return true;
                },
                remove(id) { saved.delete(id); },
            },
            onCommit() { assert.fail('a failed cut must not open the destination'); },
        }), /无法写入/);
        assert.deepEqual(snapshot(tree), original);
        assert.deepEqual(saved.get('source'), original);
        assert.equal(saved.has('destination'), false);
    });
});

test('failed deletion restores the source; failed rollback storage retains a complete cut backup', () => withTree(tree => {
    const original = snapshot(tree);
    assert.throws(() => commitSubtreeRemoval({
        source: { snapshot: () => snapshot(tree), remove: () => tree.deleteSubtree({ rootId: 'B' }), restore: tree.fromHistory },
        persistence: { save: () => false, remove: () => assert.fail('no destination exists') },
    }), /无法写入/);
    assert.deepEqual(snapshot(tree), original);
    const destination = { ...original, ...tree.extractSubtree({ rootId: 'R', leafIds: ['B'] }), id: 'destination' };
    const saved = new Map<string, IChatSessionHistoryV2>();
    assert.throws(() => commitSubtreeRemoval({
        source: { snapshot: () => snapshot(tree), remove: () => tree.deleteSubtree({ rootId: 'B' }), restore: tree.fromHistory },
        destination,
        persistence: {
            save(history) {
                if (history.id === 'source') return false;
                saved.set(history.id, structuredClone(history));
                return true;
            },
            remove: () => assert.fail('keep the destination backup when rollback cannot be saved'),
        },
    }), /无法写入/);
    assert.deepEqual(snapshot(tree), original);
    assert.deepEqual(saved.get('destination').nodes, destination.nodes);
}));

test('a failed UI transition after saving a cut restores the source and removes the unused destination', () => withTree(tree => {
    const original = snapshot(tree);
    const destination = { ...original, ...tree.extractSubtree({ rootId: 'R', leafIds: ['B'] }), id: 'destination' };
    const saved = new Map<string, IChatSessionHistoryV2>();
    assert.throws(() => commitSubtreeRemoval({
        source: { snapshot: () => snapshot(tree), remove: () => tree.deleteSubtree({ rootId: 'B' }), restore: tree.fromHistory },
        destination,
        persistence: {
            save(history) { saved.set(history.id, structuredClone(history)); return true; },
            remove(id) { saved.delete(id); },
        },
        onCommit() { tree.fromHistory(destination); throw new Error('UI failed'); },
    }), /UI failed/);
    assert.deepEqual(snapshot(tree), original);
    assert.deepEqual(saved.get('source'), original);
    assert.equal(saved.has('destination'), false);
}));

test('rerun has fresh metadata; streamed and final usage stay on its prepared version even if selection changes', () => withTree(tree => {
    const old = snapshot(tree).nodes.B.versions.old;
    const lifecycle = createMessageLifecycle(tree, () => ({ model: 'rerun-model' } as IRuntimeLLM), () => `request-${++nextId}`);
    const id = lifecycle.prepareSlot({ updateAt: 2 });
    assert.equal(id, 'B');
    const newVersion = tree.getNodeById(id).currentVersionId;
    assert.notEqual(newVersion, 'old');
    const pending = tree.getNodeById(id).versions[newVersion];
    assert.equal(pending.usage, undefined);
    assert.equal(pending.time, undefined);
    assert.equal(pending.message.reasoning_content, undefined);
    tree.switchVersion(id, 'old');
    lifecycle.updateContent(id, 'legacy string', { content: '', reasoning_content: 'new thought', usage: { prompt_tokens: 8 } });
    assert.deepEqual(tree.getNodeById(id).versions.old, old);
    assert.equal(tree.getNodeById(id).versions[newVersion].message.content, '');
    assert.equal(tree.getNodeById(id).versions[newVersion].message.reasoning_content, 'new thought');
    lifecycle.finalize(id, {
        content: 'new answer', reasoning_content: 'new thought',
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12, completion_tokens_details: { reasoning_tokens: 3 } },
        time: { latency: 7 },
    }, { msgToSend: [], modelName: 'subsequently-selected-model' });
    assert.deepEqual(tree.getNodeById(id).versions.old, old);
    assert.equal(tree.getNodeById(id).currentVersionId, 'old');
    assert.equal(tree.getNodeById(id).versions[newVersion].usage.total_tokens, 12);
    assert.equal(tree.getNodeById(id).versions[newVersion].author, 'rerun-model');
    assert.equal(tree.getNodeById('A').versions.old.token, undefined, 'input usage must not be written onto the preceding message');
    tree.switchVersion(id, newVersion);
    assert.equal(tree.getNodeById(id).versions[tree.getNodeById(id).currentVersionId].usage.total_tokens, 12);
}));

test('failed rerun must not inherit prior-version usage or reasoning', () => withTree(tree => {
    const old = snapshot(tree).nodes.B.versions.old;
    const lifecycle = createMessageLifecycle(tree, () => ({ model: 'new-model' } as IRuntimeLLM), () => `request-${++nextId}`);
    lifecycle.prepareSlot({ updateAt: 2 });
    lifecycle.markError('B', new Error('network failed'));
    const node = tree.getNodeById('B');
    assert.equal(node.loading, false);
    assert.equal(node.versions[node.currentVersionId].usage, undefined);
    assert.equal(node.versions[node.currentVersionId].message.reasoning_content, undefined);
    assert.match(String(node.versions[node.currentVersionId].message.content), /network failed/);
    assert.deepEqual(node.versions.old, old);
}));

test('usage display preserves reported zeros, distinguishes unknown counts, and does not add subsets to totals', () => {
    const display = describeUsage({
        prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 50, cache_creation_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 10 },
    });
    assert.equal(display.summary, 'Token: 120 (100↑ 20↓)');
    assert.ok(display.rows.some(row => row.label === '缓存写入（输入）' && row.value === '0'));
    const partial = describeUsage({ prompt_tokens_details: { cached_tokens: 7 } });
    assert.equal(partial.summary, 'Token: — (—↑ —↓)');
    assert.deepEqual(partial.rows, [{ label: '缓存读取（输入）', value: '7' }]);
    assert.deepEqual(describeUsage().rows, []);
    const aliases = describeUsage({ prompt_tokens_details: { cache_write_tokens: 10, cache_creation_tokens: 10, image_tokens: 8 } });
    assert.deepEqual(aliases.rows, [{ label: '缓存写入（输入）', value: '10' }, { label: '图像输入', value: '8' }]);
});

test('one-version tool-round usage sums reported details without mutating requests or fabricating missing counts', () => {
    const first: ICompletionUsage = {
        prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 3 }, completion_tokens_details: { reasoning_tokens: 2 },
    };
    const second: ICompletionUsage = {
        prompt_tokens: 20, completion_tokens: 8, total_tokens: 28,
        prompt_tokens_details: { cached_tokens: 7 }, completion_tokens_details: { reasoning_tokens: 4 },
    };
    assert.deepEqual(sumReportedUsage(first, second), {
        prompt_tokens: 30, completion_tokens: 13, total_tokens: 43,
        prompt_tokens_details: { cached_tokens: 10 }, completion_tokens_details: { reasoning_tokens: 6 },
    });
    assert.equal(first.prompt_tokens, 10);
    assert.equal(first.prompt_tokens_details.cached_tokens, 3);
    const partial = sumReportedUsage(first, { total_tokens: 8 });
    assert.deepEqual(partial, { total_tokens: 23 });
    assert.equal(sumReportedUsage(first, null), null);
});
