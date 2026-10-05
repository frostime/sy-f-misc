import assert from 'node:assert/strict';
import test from 'node:test';
import { commitResidueCleanup, prepareResidueBackup, saveResidueBackup, VerifiedResidueBackup } from '../src/func/gpt/chat/ChatSession/residue-cleanup';

const fixture = (): IChatSessionHistoryV2 => {
    const node = (id: string, parent: string | null): IChatSessionMsgItemV2 => ({
        id, parent, children: [], type: 'message', role: 'assistant', currentVersionId: 'v',
        versions: { v: { id: 'v', message: { role: 'assistant', content: `content ${id}` }, timestamp: 100 } },
    });
    return {
        schema: 2, type: 'history', id: 'source', title: 'fixture', timestamp: 1, updated: 2,
        rootId: 'R', worldLine: ['R'], nodes: { R: node('R', null), X: node('X', 'missing') }, bookmarks: { X: 'bookmark' },
    };
};
const setup = () => {
    let current = fixture();
    const original = structuredClone(current);
    const backups: IChatSessionHistoryV2[] = [];
    const saved: IChatSessionHistoryV2[] = [];
    const options = {
        reviewedHistory: original, backup: prepareResidueBackup(original, 'backup'),
        source: {
            snapshot: () => structuredClone(current),
            apply: (history: IChatSessionHistoryV2) => { current = structuredClone(history); },
            assertEditable: () => {},
        },
        persistence: {
            saveBackup: async (history: IChatSessionHistoryV2) => { backups.push(structuredClone(history)); return true; },
            readBackup: async (id: string): Promise<IChatSessionHistoryV2 | null> => structuredClone(backups.find(backup => backup.id === id) ?? null),
            saveWorking: (history: IChatSessionHistoryV2) => { saved.push(structuredClone(history)); return true; },
        },
    };
    return { options, original, backups, saved, current: () => current,
        backup: () => saveResidueBackup(options),
        cleanup: (receipt: VerifiedResidueBackup | null) => commitResidueCleanup({ ...options, groupIds: ['X'], verifiedBackup: receipt }),
    };
};

test('backup is an explicit read-verified step that never cleans; separate cleanup preserves normal nodes and versions', async () => {
    const env = setup();
    const receipt = await env.backup();
    assert.deepEqual(env.current(), env.original);
    assert.deepEqual(env.saved, []);
    assert.equal(env.backups.length, 1);
    assert.notEqual(env.backups[0].id, env.original.id);
    assert.deepEqual(env.backups[0].nodes, env.original.nodes);
    assert.deepEqual(env.backups[0].bookmarks, env.original.bookmarks);
    const result = await env.cleanup(receipt);
    assert.equal(result.removedCount, 1);
    assert.equal(result.backupId, 'backup');
    assert.equal(env.backups.length, 1, 'cleanup must not secretly create another backup');
    assert.deepEqual(Object.keys(env.current().nodes), ['R']);
    assert.deepEqual(env.current().nodes.R, env.original.nodes.R);
    assert.deepEqual(env.current().worldLine, ['R']);
    assert.deepEqual(env.current().bookmarks, {});
    assert.deepEqual(env.saved, [env.current()]);
});

test('no receipt, failed writes, missing/corrupt read-back and stale review never authorize deletion', async () => {
    for (const failure of ['no-receipt', 'write', 'missing', 'corrupt', 'stale']) {
        const env = setup();
        if (failure === 'write') env.options.persistence.saveBackup = async () => false;
        if (failure === 'missing') env.options.persistence.readBackup = async () => null;
        if (failure === 'corrupt') env.options.persistence.readBackup = async () => ({ ...env.options.backup, nodes: {} });
        if (failure === 'stale') env.options.source.apply({ ...env.original, title: 'changed' });
        const before = structuredClone(env.current());
        await assert.rejects(failure === 'no-receipt' ? env.cleanup(null) : env.backup(), /备份|变化/);
        assert.deepEqual(env.current(), before);
        assert.deepEqual(env.saved, []);
    }
});

test('source change, session switch or generation during backup keeps the backup but cannot authorize cleanup', async () => {
    for (const change of ['content', 'session', 'generating']) {
        const env = setup();
        let editable = true;
        env.options.source.assertEditable = () => { if (!editable) throw new Error('生成中'); };
        env.options.persistence.saveBackup = async history => {
            env.backups.push(structuredClone(history));
            if (change === 'content') {
                const modified = structuredClone(env.original);
                modified.nodes.R.versions.v.message.content = 'new content'; env.options.source.apply(modified);
            } else if (change === 'session') env.options.source.apply({ ...env.original, id: 'another-session' });
            else editable = false;
            return true;
        };
        await assert.rejects(env.backup(), /变化|不可操作/);
        assert.ok(env.current().nodes.X);
        if (change === 'content') assert.equal(env.current().nodes.R.versions.v.message.content, 'new content');
        if (change === 'session') assert.equal(env.current().id, 'another-session');
        assert.equal(env.backups.length, 1);
        assert.deepEqual(env.saved, []);
    }
});

test('backup removal or source mutation after verification, including during async re-read, blocks cleanup', async () => {
    for (const change of ['backup-deleted', 'source', 'during-read']) {
        const env = setup(); const receipt = await env.backup();
        if (change === 'backup-deleted') env.backups.length = 0;
        if (change === 'source') env.options.source.apply({ ...env.original, title: 'changed' });
        if (change === 'during-read') env.options.persistence.readBackup = async () => {
            env.options.source.apply({ ...env.original, title: 'changed during read' }); return structuredClone(receipt.history);
        };
        await assert.rejects(env.cleanup(receipt), /备份|变化/);
        assert.ok(env.current().nodes.X);
        assert.deepEqual(env.saved, []);
    }
});

test('working-copy save failure restores the source and retains its independent verified backup', async () => {
    for (const rollbackAlsoFails of [false, true]) {
        const env = setup(); const receipt = await env.backup(); let saves = 0;
        env.options.persistence.saveWorking = history => {
            env.saved.push(structuredClone(history)); return ++saves > 1 && !rollbackAlsoFails;
        };
        await assert.rejects(env.cleanup(receipt), /恢复/);
        assert.deepEqual(env.current(), env.original);
        assert.equal(env.backups.length, 1);
        assert.deepEqual(env.backups[0].nodes, env.original.nodes);
        assert.equal(env.saved.length, 2);
        assert.deepEqual(env.saved[1], env.original);
    }
});
