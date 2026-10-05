import assert from 'node:assert/strict';
import test from 'node:test';
import { commitResidueCleanup } from '../src/func/gpt/chat/ChatSession/residue-cleanup';

const fixture = (): IChatSessionHistoryV2 => {
    const node = (id: string, parent: string | null): IChatSessionMsgItemV2 => ({
        id, parent, children: [], type: 'message', role: 'assistant', currentVersionId: 'v',
        versions: { v: { id: 'v', message: { role: 'assistant', content: `content ${id}` }, timestamp: 100 } },
    });
    return {
        schema: 2, type: 'history', id: 'source', title: 'fixture', timestamp: 1, updated: 2,
        rootId: 'R', worldLine: ['R'], nodes: { R: node('R', null), X: node('X', 'missing') },
        bookmarks: { X: 'residual bookmark' },
    };
};

const setup = () => {
    let current = fixture();
    const original = structuredClone(current);
    const backups: IChatSessionHistoryV2[] = [];
    const saved: IChatSessionHistoryV2[] = [];
    const options = {
        reviewedHistory: original,
        groupIds: ['X'],
        source: {
            snapshot: () => structuredClone(current),
            apply: (history: IChatSessionHistoryV2) => { current = structuredClone(history); },
            assertEditable: () => {},
        },
        persistence: {
            saveBackup: async (history: IChatSessionHistoryV2) => { backups.push(structuredClone(history)); return true; },
            saveWorking: (history: IChatSessionHistoryV2) => { saved.push(structuredClone(history)); return true; },
        },
        newId: () => 'backup',
    };
    return { options, original, backups, saved, current: () => current };
};

test('cleanup saves a complete independent backup before deleting reviewed records and bookmarks', async () => {
    const env = setup();
    env.options.persistence.saveBackup = async history => {
        assert.deepEqual(env.current(), env.original, 'source cannot be changed before backup completes');
        env.backups.push(structuredClone(history));
        return true;
    };
    const result = await commitResidueCleanup(env.options);
    assert.equal(result.removedCount, 1);
    assert.equal(result.backupId, 'backup');
    assert.ok(result.bytes > 0);
    assert.equal(env.backups.length, 1);
    assert.notEqual(env.backups[0].id, env.original.id);
    assert.deepEqual(env.backups[0].nodes, env.original.nodes);
    assert.deepEqual(env.backups[0].bookmarks, env.original.bookmarks);
    assert.deepEqual(Object.keys(env.current().nodes), ['R']);
    assert.deepEqual(env.current().nodes.R, env.original.nodes.R);
    assert.deepEqual(env.current().worldLine, ['R']);
    assert.deepEqual(env.current().bookmarks, {});
    assert.deepEqual(env.saved, [env.current()]);
});

test('backup failure and stale reviews reject without deleting or saving the source', async () => {
    for (const failure of ['backup', 'stale']) {
        const env = setup();
        if (failure === 'backup') env.options.persistence.saveBackup = async () => false;
        else env.options.source.apply({ ...env.original, title: 'changed since inspection' });
        const before = structuredClone(env.current());
        await assert.rejects(commitResidueCleanup(env.options), /备份|变化/);
        assert.deepEqual(env.current(), before);
        assert.deepEqual(env.saved, []);
        assert.deepEqual(env.backups, []);
    }
});

test('source change or generation during asynchronous backup rejects without overwriting the new source', async () => {
    for (const change of ['content', 'session', 'generating']) {
        const env = setup();
        let editable = true;
        env.options.source.assertEditable = () => { if (!editable) throw new Error('生成中'); };
        env.options.persistence.saveBackup = async history => {
            env.backups.push(structuredClone(history));
            if (change === 'content') {
                const modified = structuredClone(env.original);
                modified.nodes.R.versions.v.message.content = 'new content';
                env.options.source.apply(modified);
            } else if (change === 'session') {
                env.options.source.apply({ ...env.original, id: 'another-session' });
            } else editable = false;
            return true;
        };
        await assert.rejects(commitResidueCleanup(env.options), /变化|生成中/);
        assert.ok(env.current().nodes.X, 'reviewed residue was not deleted');
        if (change === 'content') assert.equal(env.current().nodes.R.versions.v.message.content, 'new content');
        if (change === 'session') assert.equal(env.current().id, 'another-session');
        assert.equal(env.backups.length, 1);
        assert.deepEqual(env.saved, []);
    }
});

test('working-copy save failure restores the source and retains the permanent backup', async () => {
    for (const rollbackAlsoFails of [false, true]) {
        const env = setup();
        let saves = 0;
        env.options.persistence.saveWorking = history => {
            env.saved.push(structuredClone(history));
            return ++saves > 1 && !rollbackAlsoFails;
        };
        await assert.rejects(commitResidueCleanup(env.options), /恢复/);
        assert.deepEqual(env.current(), env.original);
        assert.equal(env.backups.length, 1);
        assert.deepEqual(env.backups[0].nodes, env.original.nodes);
        assert.equal(env.saved.length, 2);
        assert.deepEqual(env.saved[1], env.original);
    }
});
