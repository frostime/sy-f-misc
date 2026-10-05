import assert from 'node:assert/strict';
import test from 'node:test';
import { saveToJson, getFromJson } from '../src/func/gpt/persistence/json-files';
import { archiveWorkingHistory, copyArchiveLink } from '../src/func/gpt/persistence/archive-actions';
import { saveResidueBackup, prepareResidueBackup, commitResidueCleanup } from '../src/func/gpt/chat/ChatSession/residue-cleanup';

class TestElement {
    children: TestElement[] = [];
    style = { cssText: '' };
    private text = '';
    set textContent(value: string) { this.text = value; }
    get textContent(): string { return this.text + this.children.map(child => child.textContent).join('\n'); }
    set innerHTML(_value: string) { throw new Error('Private content must not be executable HTML'); }
    append(...children: TestElement[]) { this.children.push(...children); }
}
const history = (): IChatSessionHistoryV2 => {
    const node = (id: string): IChatSessionMsgItemV2 => ({ id, parent: null, children: [], type: 'message', role: 'user', currentVersionId: 'v', versions: { v: { id: 'v', timestamp: 1, message: { role: 'user', content: 'fixture ' + id } } } });
    return { schema: 2, type: 'history', id: 'source', title: '<script>private title</script>', timestamp: 1, updated: 2, nodes: { R: node('R'), X: node('X') }, rootId: 'R', worldLine: ['R'], bookmarks: {} };
};
const path = (id: string) => `data/storage/petal/mock/chat-history/${id}.json`;
const setup = () => {
    const io = {
        files: new Map<string, any>([['data/storage/petal/mock/chat-history-snapshot.json', { schema: '1.0', sessions: [], lastUpdated: 0 }]]),
        bodyWrites: 0, indexWrites: 0, failWrite: false, failIndex: false, failDirectory: false,
        blockedReads: new Set<string>(), consent: 'confirm', beforeConsent: null as null | (() => void), dialogs: [] as any[], messages: [] as any[], clipboard: [] as string[],
    };
    (globalThis as any).archiveIO = io;
    (globalThis as any).window = { siyuan: { config: { system: {} } } }; // No Node dataDir: real read helper can only use the fake API.
    (globalThis as any).document = { createElement: () => new TestElement() };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text: string) => { io.clipboard.push(text); } } } });
    return io;
};

test('real JSON writer rejects VFS ok:false and does not publish an index or authorize residue cleanup', async () => {
    const io = setup(); io.failWrite = true;
    await assert.rejects(saveToJson(history()), /写入失败/);
    assert.equal(io.indexWrites, 0);
    assert.equal(await getFromJson('source'), null);
    let current = history();
    const source = { snapshot: () => structuredClone(current), apply: (value: IChatSessionHistoryV2) => { current = value; }, assertEditable: () => {} };
    const original = structuredClone(current);
    const persistence = { saveBackup: (value: IChatSessionHistoryV2) => saveToJson(value, true, { createOnly: true }), readBackup: getFromJson, saveWorking: () => true };
    await assert.rejects(saveResidueBackup({ source, persistence, reviewedHistory: original, backup: prepareResidueBackup(original, 'backup') }), /写入失败/);
    await assert.rejects(commitResidueCleanup({ source, persistence, reviewedHistory: original, groupIds: ['X'], verifiedBackup: null }), /备份/);
    assert.deepEqual(current, original);
});

test('acknowledged body but failed index reports partial failure and cannot yield a verified cleanup receipt', async () => {
    const io = setup(); io.failIndex = true; const original = history();
    await assert.rejects(saveResidueBackup({ reviewedHistory: original, backup: prepareResidueBackup(original, 'backup'), source: { snapshot: () => original, apply: () => { throw new Error('must not apply'); }, assertEditable: () => {} }, persistence: { saveBackup: value => saveToJson(value, true, { createOnly: true }), readBackup: getFromJson } }), /文件已写入.*列表更新失败/);
    assert.ok(await getFromJson('backup'), 'partial failure must honestly retain the written body');
    assert.equal(await getFromJson('source'), null);
});

test('archive cancellation/close and unreadable target never write; confirmed overwrite replaces only the selected archive', async () => {
    for (const consent of ['cancel', 'close']) {
        const io = setup(); io.consent = consent;
        assert.equal(await archiveWorkingHistory(history()), false);
        assert.equal(io.bodyWrites, 0); assert.equal(io.indexWrites, 0); assert.deepEqual(io.messages, []);
    }
    const io = setup(); io.files.set(path('source'), { ...history(), title: 'old title' }); io.files.set(path('unrelated'), history());
    const untouched = structuredClone(io.files.get(path('unrelated')));
    assert.equal(await archiveWorkingHistory(history()), true);
    assert.equal(io.dialogs[0].title, '更新永久存档？');
    assert.match(io.dialogs[0].content.textContent, /整体替换.*不是另存/);
    assert.match(io.dialogs[0].content.textContent, /source.json/);
    assert.doesNotMatch(io.dialogs[0].content.textContent, /查看原存档|fixture R/);
    assert.deepEqual(await getFromJson('source'), history());
    assert.deepEqual(io.files.get(path('unrelated')), untouched);
    const failed = setup(); failed.failDirectory = true;
    assert.equal(await archiveWorkingHistory(history()), false); assert.equal(failed.bodyWrites, 0); assert.equal(failed.dialogs.length, 0);
});

test('new archive is explicit; stored changes during consent abort rather than overwrite the newer body', async () => {
    const fresh = setup();
    assert.equal(await archiveWorkingHistory(history()), true);
    assert.equal(fresh.dialogs[0].title, '建立永久存档？'); assert.deepEqual(await getFromJson('source'), history());
    const io = setup(); io.files.set(path('source'), history());
    io.beforeConsent = () => io.files.set(path('source'), { ...history(), title: 'changed elsewhere' });
    assert.equal(await archiveWorkingHistory(history()), false);
    assert.equal(io.bodyWrites, 0); assert.equal(io.files.get(path('source')).title, 'changed elsewhere');
});

test('copying links is read-only, uses permanent title, and never creates an archive for an unsaved working copy', async () => {
    const io = setup();
    assert.equal(await copyArchiveLink(history()), false);
    assert.equal(io.bodyWrites, 0); assert.equal(io.indexWrites, 0); assert.deepEqual(io.clipboard, []);
    io.files.set(path('source'), { ...history(), title: 'permanent title' });
    assert.equal(await copyArchiveLink(history()), true);
    assert.equal(io.bodyWrites, 0); assert.equal(io.indexWrites, 0);
    assert.match(io.clipboard[0], /^\[permanent title\]/); assert.match(io.clipboard[0], /historyId=source/);
});
