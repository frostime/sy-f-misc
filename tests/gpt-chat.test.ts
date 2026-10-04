import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from 'solid-js';
import { useTreeModel } from '../src/func/gpt/chat/ChatSession/use-tree-model';
import { assertRootRemovalCoversAllRecords, isSameSelectionPlan, INodeSelectionPlan } from '../src/func/gpt/chat/ChatSession/subtree-selection';
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

/** Pure R→A→B chain for root-promotion probes. */
const chainHistory = (): IChatSessionHistoryV2 => {
    const base = fixture();
    return {
        ...base,
        nodes: {
            R: { ...base.nodes.R, children: ['A'] },
            A: { ...base.nodes.A, children: ['B'] },
            B: base.nodes.B,
        },
        rootId: 'R',
        worldLine: ['R', 'A', 'B'],
        bookmarks: { B: 'leaf' },
    };
};

/** Same visible tree plus a consistent but unreachable second root record. */
const orphanHistory = (): IChatSessionHistoryV2 => {
    const history = fixture();
    history.nodes.X = { ...history.nodes.B, id: 'X', parent: null, children: [] };
    return history;
};
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

test('a mixed selection degrades to safe partial deletion; nothing removable still rejects', () => withTree(tree => {
    const before = snapshot(tree);
    // Legacy root+leaf args share the protection rule: the intermediate endpoint A stays,
    // its removable leaf D goes, B and C are untouched.
    assert.equal(tree.deleteSubtree({ rootId: 'R', leafIds: ['A', 'D'] }), 1);
    let history = snapshot(tree);
    assert.deepEqual(Object.keys(history.nodes).sort(), ['A', 'B', 'C', 'R']);
    assert.deepEqual(history.nodes.A.children, ['B', 'C']);
    assertTreeConsistent(history);

    tree.fromHistory(fixture());
    // Zero removable: every selected node still has unselected descendants depending on it.
    assert.throws(() => tree.validateSubtreeDeletion({ rootId: 'R', leafIds: ['A'] }), /没有可安全删除/);
    assert.deepEqual(snapshot(tree), before);
    assert.throws(() => tree.deleteSubtree({ rootId: 'A', leafIds: ['D'] }), /不在/);
    assert.deepEqual(snapshot(tree), before);
    // Copying an intermediate endpoint through legacy args remains allowed.
    const copied = tree.extractSubtree({ rootId: 'R', leafIds: ['A'] });
    assert.equal(Object.keys(copied.nodes).length, 2);
    assert.deepEqual(copied.nodes[copied.idMap.A].children, []);
}));

test('getSelectionPlan describes arbitrary unordered sets deterministically', () => withTree(tree => {
    const plan = tree.getSelectionPlan(['D', 'B', 'R', 'B']);
    assert.deepEqual(plan.nodeIds, ['R', 'B', 'D']);
    assert.deepEqual(plan.rootIds, ['R', 'B']);
    assert.deepEqual(plan.removableIds, ['B', 'D']);
    assert.deepEqual(plan.retainedIds, ['R']);
    assert.deepEqual(plan.connectionIds, ['R', 'A', 'B', 'D']);
    assert.equal(plan.canExtract, false);
    const reordered = tree.getSelectionPlan(['R', 'D', 'B']);
    assert.deepEqual(reordered, plan);
    assert.equal(isSameSelectionPlan(plan, reordered), true);
    assert.deepEqual(tree.getSelectionPlan([]), {
        nodeIds: [], rootIds: [], removableIds: [], retainedIds: [], connectionIds: [], canExtract: false,
    });
}));

test('connectionIds fill only the gaps between selected nodes, never above their common ancestor', () => withTree(tree => {
    const siblings = tree.getSelectionPlan(['C', 'B']);
    assert.deepEqual(siblings.nodeIds, ['B', 'C']);
    assert.deepEqual(siblings.rootIds, ['B', 'C']);
    assert.deepEqual(siblings.connectionIds, ['A', 'B', 'C'], 'LCA A closes the gap; the global root R stays out');
    assert.equal(siblings.canExtract, false);
    assert.deepEqual(tree.getSelectionPlan(['B']).connectionIds, ['B'], 'a singleton needs no extra ancestor');
    assert.deepEqual(tree.getSelectionPlan(['R', 'A', 'B']).connectionIds, ['R', 'A', 'B'], 'a connected selection gains nothing');
    assert.deepEqual(tree.getSelectionPlan(['R', 'B']).connectionIds, ['R', 'A', 'B'], 'the gap up to a selected root is filled');
}));

test('removing the actual root is rejected while unselected orphan records would survive', () => withTree(tree => {
    // A clean map allows whole-tree deletion and leaves nothing behind.
    assert.equal(tree.deleteSubtree({ nodeIds: ['R', 'A', 'B', 'C', 'D'] }), 5);
    assert.deepEqual(snapshot(tree).nodes, {});

    tree.fromHistory(orphanHistory());
    const before = snapshot(tree);
    assert.throws(() => tree.getSelectionPlan(['R', 'A', 'B', 'C', 'D']), /孤儿/, 'the plan itself must not propose an orphan-leaving root removal');
    assert.throws(() => tree.validateSubtreeDeletion({ rootId: 'R' }), /孤儿/);
    assert.throws(() => tree.deleteSubtree({ rootId: 'R' }), /孤儿/);
    assert.throws(() => tree.deleteSubtree({ nodeIds: ['R', 'A', 'B', 'C', 'D'] }), /孤儿/);
    assert.deepEqual(snapshot(tree), before);
    // Operations that never touch the root stay available and orphans are untouched.
    assert.equal(tree.deleteSubtree({ nodeIds: ['B'] }), 1);
    assert.equal(tree.getNodes().B, undefined);
    assert.ok(tree.getNodes().X, 'unrelated orphan record must not be silently deleted');
}));

test('assertRootRemovalCoversAllRecords guards both directions of coverage mismatch', () => {
    const nodes = { R: { parent: null, children: ['A'] }, A: { parent: 'R', children: [] } };
    assert.doesNotThrow(() => assertRootRemovalCoversAllRecords(nodes, new Set(['R', 'A']), 'R'));
    assert.throws(() => assertRootRemovalCoversAllRecords(nodes, new Set(['R']), 'R'), /孤儿/);
    assert.doesNotThrow(() => assertRootRemovalCoversAllRecords(nodes, new Set(['A']), 'R'), 'non-root removals are unrestricted');
    assert.doesNotThrow(() => assertRootRemovalCoversAllRecords(nodes, new Set(['R']), null));
});

test('disconnected nodeIds delete their full subtrees but never extract or copy', () => withTree(tree => {
    const before = snapshot(tree);
    assert.throws(() => tree.extractSubtree({ nodeIds: ['B', 'D'] }), /连通的单根子树/);
    assert.throws(() => tree.extractSubtree({ nodeIds: [] }), /连通的单根子树/, 'empty nodeIds must not be read as the whole tree');
    assert.deepEqual(snapshot(tree), before);
    assert.equal(tree.deleteSubtree({ nodeIds: ['B', 'D'] }), 2);
    const history = snapshot(tree);
    assert.deepEqual(Object.keys(history.nodes).sort(), ['A', 'C', 'R']);
    assert.deepEqual(history.nodes.R.children, ['A']);
    assert.deepEqual(history.worldLine, ['R', 'A']);
    assert.deepEqual(history.bookmarks, { A: 'shared', C: 'retained' });
    assertTreeConsistent(history);
}));

test('explicit connection paths make an arbitrary set extractable; sub-root selections keep their own root', () => withTree(tree => {
    const source = snapshot(tree);
    const copied = tree.extractSubtree({ nodeIds: ['R', 'A', 'B'] });
    assert.equal(copied.rootId, copied.idMap.R);
    assert.deepEqual(copied.nodes[copied.idMap.A].children, [copied.idMap.B]);
    assert.deepEqual(copied.worldLine, ['R', 'A', 'B'].map(id => copied.idMap[id]));
    // Every version, payload and usage survives the copy; mutating it cannot leak back.
    const copiedB = copied.nodes[copied.idMap.B];
    assert.deepEqual(copiedB.versions, source.nodes.B.versions);
    copiedB.versions.old.message.content = 'edited copy';
    assert.equal(tree.getNodeById('B').versions.old.message.content, 'answer B');
    assert.deepEqual(snapshot(tree), source);

    const branch = tree.extractSubtree({ nodeIds: ['A', 'B'], regenerateIds: false });
    assert.equal(branch.rootId, 'A');
    assert.deepEqual(branch.worldLine, ['A', 'B']);
    assert.deepEqual(branch.nodes.B.parent, 'A');
    assert.deepEqual(branch.nodes.A.parent, null);
}));

test('protection propagates from unselected descendants through selected ancestors up to the root', () => withTree(tree => {
    const before = snapshot(tree);
    assert.throws(() => tree.deleteSubtree({ nodeIds: ['R'] }), /没有可安全删除/, 'the actual root must not be deletable while other branches remain');
    assert.deepEqual(snapshot(tree), before);
    assert.equal(tree.deleteSubtree({ nodeIds: ['R', 'A', 'B', 'C'] }), 3);
    const history = snapshot(tree);
    assert.deepEqual(Object.keys(history.nodes).sort(), ['D', 'R']);
    assert.deepEqual(history.nodes.R.children, ['D']);
    assert.deepEqual(history.worldLine, ['R']);
    assertTreeConsistent(history);
}));

test('deleting the whole tree yields a genuinely empty session and appending starts a new root', () => withTree(tree => {
    assert.equal(tree.deleteSubtree({ nodeIds: ['R', 'A', 'B', 'C', 'D'] }), 5);
    const history = snapshot(tree);
    assert.deepEqual(history.nodes, {});
    assert.deepEqual(history.worldLine, []);
    assert.equal(history.rootId, null);
    assert.deepEqual(history.bookmarks, {});
    assert.equal(tree.hasMessages(), false);
    tree.appendNode({
        id: 'new-root', type: 'message', role: 'user', currentVersionId: 'new-root-version',
        versions: { 'new-root-version': { id: 'new-root-version', message: { role: 'user', content: 'hi' }, author: 'user' } },
    });
    assert.equal(tree.getRootId(), 'new-root');
    assert.equal(tree.count(), 1);
    assertTreeConsistent(snapshot(tree));
}));

test('a stale plan mismatches once the tree changed; reordered but equivalent selections still match', () => withTree(tree => {
    const plan = tree.getSelectionPlan(['B']);
    assert.deepEqual(plan.removableIds, ['B']);
    // Growing a child under B turns it into a protected ancestor: same nodeIds, different subset.
    tree.createBranch('B');
    const grown = tree.getSelectionPlan(['B']);
    assert.deepEqual(grown.retainedIds, ['B']);
    assert.deepEqual(grown.removableIds, []);
    assert.equal(isSameSelectionPlan(plan, grown), false);
    assert.equal(isSameSelectionPlan(plan, tree.getSelectionPlan(['B', 'D'])), false);
    assert.equal(isSameSelectionPlan(tree.getSelectionPlan(['B', 'D']), tree.getSelectionPlan(['D', 'B'])), true);
}));

test('isSameSelectionPlan compares multiset membership and rejects incomplete plans', () => {
    const base = { nodeIds: [], rootIds: [], removableIds: [], retainedIds: [], connectionIds: [], canExtract: false };
    assert.equal(isSameSelectionPlan(
        { ...base, removableIds: ['a', 'a'] },
        { ...base, removableIds: ['a', 'b'] },
    ), false, 'duplicated IDs must not collapse into set membership');
    assert.equal(isSameSelectionPlan(
        { ...base, removableIds: ['a', 'b'] },
        { ...base, removableIds: ['b', 'a'] },
    ), true, 'order independence is still required');
    assert.equal(isSameSelectionPlan(base, { nodeIds: [] } as INodeSelectionPlan), false, 'a plan missing arrays never matches');
    assert.equal(isSameSelectionPlan(base, { ...base, canExtract: undefined } as unknown as INodeSelectionPlan), false);
});

test('legacy deleteNode removes its map and bookmark keys exactly, with or without root promotion', () => withTree(tree => {
    tree.deleteNode('B');
    assert.equal(tree.getNodes().B, undefined, 'no ghost node may survive a store-merge removal');
    assert.equal(tree.getBookmarks().B, undefined, 'no ghost bookmark may survive');
    assert.deepEqual(tree.getNodes().A.children, ['C']);
    assert.equal(tree.getRootId(), 'R');
    assert.deepEqual(tree.getWorldLine(), ['R', 'A']);

    tree.fromHistory(chainHistory());
    tree.deleteNode('R');
    assert.equal(tree.getRootId(), 'A', 'the single child is promoted');
    assert.equal(tree.getNodes().R, undefined);
    assert.equal(tree.getNodeById('A').parent, null);
    assert.deepEqual(tree.getWorldLine(), ['A', 'B']);
    assertTreeConsistent(snapshot(tree));
}));

test('invalid or structurally inconsistent selections fail without any mutation', () => withTree(tree => {
    const before = snapshot(tree);
    assert.throws(() => tree.getSelectionPlan(['missing']), /已不存在/);
    assert.throws(() => tree.deleteSubtree({ nodeIds: ['B', 'missing'] }), /已不存在/);
    assert.deepEqual(snapshot(tree), before);

    const corrupt = fixture();
    corrupt.nodes.A.children = ['B'];
    tree.fromHistory(corrupt);
    const corruptedSnapshot = snapshot(tree);
    assert.throws(() => tree.getSelectionPlan(['C']), /不一致/);
    assert.throws(() => tree.deleteSubtree({ nodeIds: ['R', 'C'] }), /不一致/);
    assert.deepEqual(snapshot(tree), corruptedSnapshot);
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
