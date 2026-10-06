import assert from 'node:assert/strict';
import test from 'node:test';
import { createResidueCleanup, inspectTreeResidue } from '../src/func/gpt/chat/ChatSession/tree-residue';

const node = (id: string, parent: string | null, children: string[] = []): IChatSessionMsgItemV2 => ({
    id, parent, children, role: 'assistant', type: 'message', currentVersionId: 'new',
    versions: {
        old: { id: 'old', message: { role: 'assistant', content: 'earlier answer' }, timestamp: 10, author: 'old-model' },
        new: {
            id: 'new', message: { role: 'assistant', content: '中文🙂'.repeat(100), reasoning_content: 'not in inventory' },
            timestamp: 20, author: 'new-model', usage: { total_tokens: 12 }, time: { latency: 4 },
        },
    },
});

const fixture = (): IChatSessionHistoryV2 => ({
    schema: 2, type: 'history', id: 'synthetic', title: 'fixture', timestamp: 1,
    rootId: 'R', worldLine: ['R', 'A'],
    nodes: {
        R: node('R', null, ['A', 'B']), A: node('A', 'R'), B: node('B', 'R'),
        X: node('X', null), Y: node('Y', 'X'), // Ghost parent claim: X does not list Y.
        Z: node('Z', 'Y', ['W']), W: node('W', 'Z', ['Z']),
        Q: node('Q', 'missing-parent', ['missing-child', 'missing-child']),
    },
    bookmarks: { A: 'visible', X: 'reviewed', Q: 'unrelated', absent: 'dangling' },
    customOptions: { synthetic: true }, tags: ['fixture'], updated: 99,
});

test('inventory groups both raw claims, retains cycle/anomaly edges and visible off-path context', () => {
    const history = fixture();
    const before = structuredClone(history);
    const report = inspectTreeResidue(history);
    assert.deepEqual([report.totalNodes, report.visibleNodes, report.residualNodes], [8, 3, 5]);
    assert.deepEqual(report.groups.map(group => [group.id, group.nodeIds]), [
        ['Q', ['Q']], ['W', ['W', 'X', 'Y', 'Z']],
    ]);
    assert.equal(report.nodes.B.visible, true, 'off-worldLine branch is still visible');
    assert.equal(report.nodes.Y.visible, false);
    assert.deepEqual(report.edges.filter(edge => edge.from === 'Y'), [{ from: 'Y', to: 'X', kind: 'parent' }]);
    assert.ok(report.edges.some(edge => edge.from === 'Q' && edge.to === 'missing-child' && edge.kind === 'child'));
    assert.equal(report.edges.filter(edge => edge.from === 'Q' && edge.kind === 'child').length, 1, 'union deduplicates edges, not diagnostics');
    const kinds = new Set(report.issues.map(issue => issue.kind));
    for (const kind of ['missing-parent', 'missing-child', 'duplicate-child', 'child-parent-mismatch', 'unlisted-parent-claim', 'other-root', 'children-cycle', 'dangling-bookmark']) {
        assert.ok(kinds.has(kind as any), `missing diagnostic: ${kind}`);
    }
    const cyclic = report.issues.find(issue => issue.kind === 'children-cycle')!;
    assert.deepEqual([cyclic.nodeId, ...cyclic.relatedNodeIds].sort(), ['W', 'Z']);
    assert.ok(report.groups.find(group => group.id === 'W')!.issueIds.includes(cyclic.id));
    assert.deepEqual(history, before, 'inspection never repairs stored claims');
});

test('whole-group cleanup preserves the all-version visible tree, unrelated residue and source', () => {
    const history = fixture();
    const before = structuredClone(history);
    const report = inspectTreeResidue(history);
    const cleaned = createResidueCleanup(history, ['W']);
    assert.deepEqual(cleaned.nodeIds, ['W', 'X', 'Y', 'Z']);
    assert.equal(cleaned.removedCount, 4);
    assert.equal(cleaned.bytes, report.groups.find(group => group.id === 'W')!.bytes);
    assert.deepEqual(cleaned.history, {
        ...before,
        nodes: { R: before.nodes.R, A: before.nodes.A, B: before.nodes.B, Q: before.nodes.Q },
        bookmarks: { A: 'visible', Q: 'unrelated', absent: 'dangling' },
    });
    assert.deepEqual(history, before);
    cleaned.history.nodes.R.versions.old.author = 'changed only in snapshot';
    assert.deepEqual(history, before, 'snapshot shares no version metadata with source');
    const bulk = createResidueCleanup(history, ['W', 'Q']);
    assert.deepEqual(Object.keys(bulk.history.nodes).sort(), ['A', 'B', 'R']);
    assert.deepEqual(bulk.history.bookmarks, { A: 'visible', absent: 'dangling' });
    assert.deepEqual(bulk.history.worldLine, before.worldLine);
    for (const invalid of [[], ['W', 'W'], ['Y'], ['R'], ['nonexistent']]) {
        assert.throws(() => createResidueCleanup(history, invalid));
    }
});

test('missing roots, visible raw references and active paths block deletion without reclassification', () => {
    for (const rootId of [null, 'missing-root']) {
        const history = { ...fixture(), rootId };
        const report = inspectTreeResidue(history);
        assert.equal(report.visibleNodes, 0);
        assert.ok(report.cleanupBlockedReason);
        assert.throws(() => createResidueCleanup(history, [report.groups[0].id]));
    }
    const referenced = fixture();
    referenced.nodes.R.parent = 'X';
    const report = inspectTreeResidue(referenced);
    assert.equal(report.nodes.X.visible, false);
    assert.ok(report.groups.find(group => group.id === 'W')!.blockedReasons.length);
    assert.throws(() => createResidueCleanup(referenced, ['W']));
    assert.deepEqual(createResidueCleanup(referenced, ['Q']).history.nodes.R, referenced.nodes.R);

    const active = fixture();
    active.worldLine.push('Y', 'missing-active');
    const activeReport = inspectTreeResidue(active);
    assert.equal(activeReport.residualNodes, 5, 'active path cannot turn residue into visible records');
    assert.ok(activeReport.groups.find(group => group.id === 'W')!.blockedReasons.length);
    assert.ok(activeReport.issues.some(issue => issue.kind === 'dangling-world-line' && issue.nodeId === 'missing-active'));
    assert.throws(() => createResidueCleanup(active, ['W']));
    assert.deepEqual(active.worldLine, ['R', 'A', 'Y', 'missing-active']);
});

test('byte sizes use exact UTF-8 node JSON and inventory carries only bounded current text', () => {
    const history = fixture();
    history.nodes.Q.versions.new.message.content = [{ type: 'text', text: '图🙂' }, { type: 'image_url', image_url: { url: 'synthetic-image' } }];
    const report = inspectTreeResidue(history);
    for (const entry of Object.values(report.nodes)) {
        assert.equal(entry.bytes, Buffer.byteLength(JSON.stringify(history.nodes[entry.id]), 'utf8'));
        assert.equal(entry.versionCount, 2);
        assert.deepEqual([entry.firstTimestamp, entry.lastTimestamp], [10, 20]);
        assert.equal(entry.author, 'new-model');
        assert.equal('versions' in entry, false);
        assert.equal('message' in entry, false);
        assert.ok(entry.preview.length <= 200);
    }
    assert.equal(report.nodes.Q.preview, '图🙂');
    assert.equal(report.totalBytes, Object.values(history.nodes).reduce((sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry), 'utf8'), 0));
    assert.equal(report.totalBytes, report.visibleBytes + report.residualBytes);
    assert.equal(report.residualBytes, report.groups.reduce((sum, group) => sum + group.bytes, 0));
    assert.deepEqual(report.groups.map(group => [group.firstTimestamp, group.lastTimestamp]), [[10, 20], [10, 20]]);
    assert.equal(JSON.stringify(report).includes('not in inventory'), false);
});
