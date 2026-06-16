/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:38:02
 * @FilePath     : /src/func/gpt/persistence/local-storage.ts
 * @LastEditTime : 2026-06-13 17:00:00
 * @Description  : Per-session cache file I/O (split from monolithic gpt-chat-cache.json)
 */

import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { request } from "@frostime/siyuan-plugin-kits/api";
import { needsMigration, migrateHistory } from '@gpt/model/msg_migration';
import { showMessage } from "siyuan";
import { listStorageDirResult, readStorageJson } from "./storage-read";

const KEEP_N_CACHE_ITEM = 36;
const CACHE_DIR = 'gpt-cache';
const LEGACY_CACHE_FILE = 'gpt-chat-cache.json';
const LEGACY_MIGRATION_MARKER = '_legacy_migrated';
const LEGACY_MIGRATION_IN_PROGRESS = '_legacy_migrating';
const PENDING_CACHE_OPS_KEY = 'gpt-cache-pending-v1';

type ISessionHistoryUnion = IChatSessionHistory | IChatSessionHistoryV2;
type CacheDirRestoreResult =
    | { status: 'empty'; histories: []; hasMigrationMarker: boolean; hasMigrationInProgress: boolean }
    | { status: 'ok'; histories: ISessionHistoryUnion[]; hasMigrationMarker: boolean; hasMigrationInProgress: boolean }
    | { status: 'partial'; histories: ISessionHistoryUnion[]; hasMigrationMarker: boolean; hasMigrationInProgress: boolean }
    | { status: 'failed'; histories: [] };

type CacheDirListResult =
    | { status: 'ok'; filenames: string[]; hasMigrationMarker: boolean; hasMigrationInProgress: boolean }
    | { status: 'missing'; filenames: []; hasMigrationMarker: false; hasMigrationInProgress: false }
    | { status: 'failed'; filenames: []; hasMigrationMarker: false; hasMigrationInProgress: false };

type CachePendingOp = {
    op: 'write' | 'delete';
    token: string;
    updatedAt: number;
};

type CachePendingJournal = Record<string, CachePendingOp>;

type LocalStorageHistoryReadResult =
    | { status: 'ok'; history: IChatSessionHistoryV2 }
    | { status: 'missing' }
    | { status: 'failed' };

let allowCacheEviction = true;

// ─── Cache file I/O ─────────────────────────────────────────────────

const isSafeCacheId = (id: string) => /^[A-Za-z0-9_-]+$/.test(id);

const cachePathForId = (id: string): string | null => {
    if (!isSafeCacheId(id)) {
        console.warn(`Skip GPT cache file I/O for unsafe session id: ${id}`);
        return null;
    }
    return `${CACHE_DIR}/${id}.json`;
};

type SiyuanFileApiResponse = { code: number; msg?: string; data?: unknown } | null;

const storageApiPathFor = (storageName: string) => `/data/storage/petal/${thisPlugin().name}/${storageName}`;

const toStorageFileBlob = (storageName: string, data: Blob | File | object | string): Blob | File => {
    if (data instanceof Blob || data instanceof File) {
        return data;
    }
    if (typeof data === 'object' && data !== null) {
        return new Blob([JSON.stringify(data)], { type: 'application/json' });
    }
    if (typeof data === 'string') {
        return new Blob([data], { type: storageName.endsWith('.json') ? 'application/json' : 'text/plain' });
    }
    throw new Error('Unsupported data type');
};

const saveStorageBlob = async (storageName: string, data: Blob | File | object | string) => {
    const path = storageApiPathFor(storageName);
    const blob = toStorageFileBlob(storageName, data);
    const file = new File([blob], path.split('/').pop() || 'blob');
    const form = new FormData();
    form.append('path', path);
    form.append('isDir', 'false');
    form.append('modTime', Math.floor(Date.now()).toString());
    form.append('file', file);

    const response = await request('/api/file/putFile', form, 'response') as SiyuanFileApiResponse;
    if (response?.code === 0) return true;

    console.warn(`Failed to save GPT cache storage file ${storageName}:`, response);
    return false;
};

const removeStorageBlob = async (storageName: string) => {
    const path = storageApiPathFor(storageName);
    const response = await request('/api/file/removeFile', { path }, 'response') as SiyuanFileApiResponse;
    if (response?.code === 0 || response?.code === 404) return true;

    console.warn(`Failed to remove GPT cache storage file ${storageName}:`, response);
    return false;
};

/**
 * SPEC: split-cache consistency
 *
 * - `localStorage[gpt-chat-{id}]` remains the source of truth for temporary GPT sessions.
 * - `gpt-cache/{id}.json` is an eventually-consistent replica used by SiYuan sync/restore.
 * - `gpt-cache-pending-v1` is a tiny redo log for cache side effects only; it is not a
 *   full cache index and never stores chat content.
 * - A pending op is recorded before mutating the source-of-truth key, so reload/close can
 *   finish interrupted cache writes/deletes without rewriting every cache file.
 * - Successful async side effects clear only the matching token; an older queued write must
 *   not clear a newer write/delete for the same session id.
 */
const usePendingCacheJournal = () => {
    const read = (): CachePendingJournal => {
        try {
            const raw = localStorage.getItem(PENDING_CACHE_OPS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw) as CachePendingJournal;
            if (!parsed || typeof parsed !== 'object') return {};

            return Object.fromEntries(Object.entries(parsed).filter(([id, op]) => {
                return isSafeCacheId(id)
                    && (op?.op === 'write' || op?.op === 'delete')
                    && typeof op.token === 'string'
                    && typeof op.updatedAt === 'number';
            }));
        } catch {
            console.warn('Failed to read GPT cache pending journal; ignore malformed journal.');
            return {};
        }
    };

    const write = (journal: CachePendingJournal) => {
        if (Object.keys(journal).length === 0) {
            localStorage.removeItem(PENDING_CACHE_OPS_KEY);
        } else {
            localStorage.setItem(PENDING_CACHE_OPS_KEY, JSON.stringify(journal));
        }
    };

    const createOp = (op: CachePendingOp['op']): CachePendingOp => ({
        op,
        token: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        updatedAt: Date.now()
    });

    const mark = (id: string, op: CachePendingOp['op']): CachePendingOp | null => {
        if (!isSafeCacheId(id)) return null;
        const pendingOp = createOp(op);
        const journal = read();
        journal[id] = pendingOp;
        write(journal);
        return pendingOp;
    };

    const clearIfCurrent = (id: string, op: CachePendingOp | null) => {
        if (!op) return;
        const journal = read();
        const current = journal[id];
        if (current?.op === op.op && current.token === op.token) {
            delete journal[id];
            write(journal);
        }
    };

    const entries = () => Object.entries(read());

    const pendingDeleteIds = () => new Set(entries()
        .filter(([, op]) => op.op === 'delete')
        .map(([id]) => id));

    return { mark, clearIfCurrent, entries, pendingDeleteIds };
};

const pendingCacheJournal = usePendingCacheJournal();

const writeQueue = new Map<string, Promise<boolean>>();

const enqueueWrite = (id: string, fn: () => Promise<boolean>) => {
    const prev = writeQueue.get(id) ?? Promise.resolve(true);
    const next = prev
        .catch(() => false)
        .then(fn)
        .catch((error) => {
            console.warn(`Failed to update GPT cache file ${id}:`, error);
            return false;
        });

    writeQueue.set(id, next);
    next.finally(() => {
        if (writeQueue.get(id) === next) {
            writeQueue.delete(id);
        }
    });
    return next;
};

const writeCacheFile = (id: string, history: IChatSessionHistoryV2) => {
    const path = cachePathForId(id);
    if (!path) return Promise.resolve(true);
    return enqueueWrite(id, () => saveStorageBlob(path, history));
};

const deleteCacheFile = (id: string) => {
    const path = cachePathForId(id);
    if (!path) return Promise.resolve(true);
    return enqueueWrite(id, () => removeStorageBlob(path));
};

const listCacheDirResult = async (): Promise<CacheDirListResult> => {
    const result = await listStorageDirResult(CACHE_DIR);
    if (result.status !== 'ok') {
        return { status: result.status, filenames: [], hasMigrationMarker: false, hasMigrationInProgress: false };
    }

    return {
        status: 'ok',
        filenames: result.items.filter(f => !f.isDir && f.name.endsWith('.json')).map(f => f.name),
        hasMigrationMarker: result.items.some(f => !f.isDir && f.name === LEGACY_MIGRATION_MARKER),
        hasMigrationInProgress: result.items.some(f => !f.isDir && f.name === LEGACY_MIGRATION_IN_PROGRESS)
    };
};

const readCacheFile = async (filename: string): Promise<ISessionHistoryUnion | null> => {
    const data = await readStorageJson<ISessionHistoryUnion>(`${CACHE_DIR}/${filename}`);
    if (!data || (data as unknown as { code: number }).code === 404) return null;
    return data;
};

const drainWriteQueue = async () => {
    await Promise.allSettled([...writeQueue.values()]);
};

const localStorageKeyForId = (id: string) => `gpt-chat-${id}`;

const readHistoryFromLocalStorage = (id: string): LocalStorageHistoryReadResult => {
    const data = localStorage.getItem(localStorageKeyForId(id));
    if (!data) return { status: 'missing' };

    try {
        const parsed = JSON.parse(data) as ISessionHistoryUnion;
        if (needsMigration(parsed)) {
            return { status: 'ok', history: migrateHistory(parsed) };
        }
        return { status: 'ok', history: { ...parsed, type: 'history' as const } as IChatSessionHistoryV2 };
    } catch (error) {
        console.warn(`Failed to parse GPT localStorage history ${id}; keep pending cache op for retry.`, error);
        return { status: 'failed' };
    }
};

const replayPendingCacheOps = async () => {
    const results = await Promise.all(pendingCacheJournal.entries().map(async ([id, op]) => {
        if (op.op === 'delete') {
            localStorage.removeItem(localStorageKeyForId(id));
            const ok = await deleteCacheFile(id);
            if (ok) pendingCacheJournal.clearIfCurrent(id, op);
            return ok;
        }

        const result = readHistoryFromLocalStorage(id);
        if (result.status === 'missing') {
            pendingCacheJournal.clearIfCurrent(id, op);
            return true;
        }
        if (result.status === 'failed') {
            return false;
        }

        const ok = await writeCacheFile(id, result.history);
        if (ok) pendingCacheJournal.clearIfCurrent(id, op);
        return ok;
    }));

    if (results.some(ok => !ok)) {
        allowCacheEviction = false;
    }
};

// ─── Legacy migration (self-contained) ──────────────────────────────

const migrateFromLegacy = async () => {
    const existing = await listCacheDirResult();
    if (existing.status === 'failed') {
        allowCacheEviction = false;
        return;
    }

    if (existing.status === 'ok') {
        if (existing.hasMigrationMarker) return;
        if (existing.filenames.length > 0 && !existing.hasMigrationInProgress) {
            await writeLegacyMigrationMarker();
            return;
        }
    }

    const legacyHistories = await readLegacyCache();
    if (!legacyHistories || legacyHistories.length === 0) {
        if (existing.status === 'ok' && existing.hasMigrationInProgress) {
            allowCacheEviction = false;
        }
        return;
    }

    const started = existing.status === 'ok' && existing.hasMigrationInProgress
        ? true
        : await writeLegacyMigrationInProgressMarker();
    if (!started) {
        allowCacheEviction = false;
        return;
    }

    const results = await Promise.all(legacyHistories.map(h => {
        if (!h?.id) return Promise.resolve(true);
        const toWrite = needsMigration(h)
            ? migrateHistory(h) as IChatSessionHistoryV2
            : h as IChatSessionHistoryV2;
        return writeCacheFile(toWrite.id, toWrite);
    }));

    if (results.every(Boolean)) {
        const completed = await writeLegacyMigrationMarker();
        if (completed) {
            await removeLegacyMigrationInProgressMarker();
        } else {
            allowCacheEviction = false;
        }
    } else {
        allowCacheEviction = false;
    }
};

const readLegacyCache = async (): Promise<ISessionHistoryUnion[] | null> => {
    const parsed = await readStorageJson<unknown>(LEGACY_CACHE_FILE);
    return Array.isArray(parsed) ? parsed as ISessionHistoryUnion[] : null;
};

const writeLegacyMigrationMarker = async () => {
    try {
        return await saveStorageBlob(`${CACHE_DIR}/${LEGACY_MIGRATION_MARKER}`, {
            migratedAt: Date.now(),
            legacyFile: LEGACY_CACHE_FILE,
            schema: 1
        });
    } catch (error) {
        console.warn('Failed to write GPT legacy cache migration marker:', error);
        return false;
    }
};

const writeLegacyMigrationInProgressMarker = async () => {
    try {
        return await saveStorageBlob(`${CACHE_DIR}/${LEGACY_MIGRATION_IN_PROGRESS}`, {
            startedAt: Date.now(),
            legacyFile: LEGACY_CACHE_FILE,
            schema: 1
        });
    } catch (error) {
        console.warn('Failed to write GPT legacy cache migration in-progress marker:', error);
        return false;
    }
};

const removeLegacyMigrationInProgressMarker = async () => {
    try {
        await removeStorageBlob(`${CACHE_DIR}/${LEGACY_MIGRATION_IN_PROGRESS}`);
    } catch (error) {
        console.warn('Failed to remove GPT legacy cache migration in-progress marker:', error);
    }
};

// ─── Exported API ───────────────────────────────────────────────────

const restoreFromCacheDir = async (): Promise<CacheDirRestoreResult> => {
    try {
        const dir = await listCacheDirResult();
        if (dir.status === 'failed') return { status: 'failed', histories: [] };
        if (dir.status === 'missing') {
            return { status: 'empty', histories: [], hasMigrationMarker: false, hasMigrationInProgress: false };
        }
        if (dir.filenames.length === 0) {
            return {
                status: 'empty',
                histories: [],
                hasMigrationMarker: dir.hasMigrationMarker,
                hasMigrationInProgress: dir.hasMigrationInProgress
            };
        }

        const results = await Promise.all(dir.filenames.map(readCacheFile));
        const histories = results.filter((h): h is ISessionHistoryUnion => h !== null);
        if (histories.length === dir.filenames.length) {
            return {
                status: 'ok',
                histories,
                hasMigrationMarker: dir.hasMigrationMarker,
                hasMigrationInProgress: dir.hasMigrationInProgress
            };
        }
        if (histories.length > 0) {
            return {
                status: 'partial',
                histories,
                hasMigrationMarker: dir.hasMigrationMarker,
                hasMigrationInProgress: dir.hasMigrationInProgress
            };
        }
        return { status: 'failed', histories: [] };
    } catch {
        return { status: 'failed', histories: [] };
    }
};

export const updateCacheFile = async () => {
    await drainWriteQueue();
    await replayPendingCacheOps();

    const histories = listFromLocalStorage();
    const existing = await listCacheDirResult();
    if (existing.status === 'failed') {
        allowCacheEviction = false;
    }
    const existingFiles = existing.status === 'ok' ? existing.filenames : [];

    if (!histories || histories.length === 0) {
        if (allowCacheEviction) {
            await Promise.all(existingFiles.map(f => deleteCacheFile(f.replace(/\.json$/, ''))));
        }
        return;
    }

    histories.sort((a, b) => {
        if (a.updated && b.updated) return b.updated - a.updated;
        return b.timestamp - a.timestamp;
    });
    const kept = histories.slice(0, KEEP_N_CACHE_ITEM);
    const keepIds = new Set(kept.map(h => h.id));

    if (!allowCacheEviction) return;

    const existingIds = new Set(existingFiles.map(f => f.replace(/\.json$/, '')));
    const missingResults = await Promise.all(kept
        .filter(h => !existingIds.has(h.id))
        .map(h => writeCacheFile(h.id, h)));
    if (missingResults.some(ok => !ok)) {
        allowCacheEviction = false;
        return;
    }

    const orphans = existingFiles.filter(f => !keepIds.has(f.replace(/\.json$/, '')));
    await Promise.all(orphans.map(f => deleteCacheFile(f.replace(/\.json$/, ''))));
};

export const restoreCache = async () => {
    await migrateFromLegacy();

    const pendingDeleteIds = pendingCacheJournal.pendingDeleteIds();
    pendingDeleteIds.forEach(id => localStorage.removeItem(localStorageKeyForId(id)));

    const cacheResult = await restoreFromCacheDir();
    let histories: ISessionHistoryUnion[] | null = null;

    if (cacheResult.status === 'ok' || cacheResult.status === 'partial') {
        histories = cacheResult.histories;
        const migrationIncomplete = cacheResult.hasMigrationInProgress && !cacheResult.hasMigrationMarker;
        allowCacheEviction = allowCacheEviction && cacheResult.status === 'ok' && !migrationIncomplete;
        if (cacheResult.status === 'partial') {
            console.warn('GPT cache restore partially failed; orphan eviction is disabled for this session.');
        }
    } else if (cacheResult.status === 'empty') {
        if (cacheResult.hasMigrationMarker) return;
        histories = await readLegacyCache();
        allowCacheEviction = allowCacheEviction && !cacheResult.hasMigrationInProgress;
    } else {
        allowCacheEviction = false;
        console.warn('GPT cache restore failed; skip legacy fallback and disable orphan eviction to avoid data loss.');
        return;
    }

    if (!histories || histories.length === 0) return;

    const restoredHistories = histories
        .map(history => needsMigration(history)
            ? migrateHistory(history) as IChatSessionHistoryV2
            : history as IChatSessionHistoryV2)
        .filter(history => !pendingDeleteIds.has(history.id));

    restoredHistories.sort((a, b) => {
        if (a.updated && b.updated) return b.updated - a.updated;
        return b.timestamp - a.timestamp;
    });

    const isExist = (key: string) => Object.keys(localStorage).some(k => k === key);

    for (const history of restoredHistories.slice(0, KEEP_N_CACHE_ITEM)) {
        const key = localStorageKeyForId(history.id);
        if (!isExist(key)) {
            localStorage.setItem(key, JSON.stringify(history));
        }
    }
};

export const saveToLocalStorage = (history: IChatSessionHistoryV2) => {
    if (!history || history.schema !== 2) {
        showMessage('历史记录格式错误，无法保存到 localStorage');
        return;
    }
    const historyWithType = { ...history, type: 'history' as const, schema: 2 } as IChatSessionHistoryV2;
    const pendingOp = pendingCacheJournal.mark(history.id, 'write');
    localStorage.setItem(localStorageKeyForId(history.id), JSON.stringify(historyWithType));
    void writeCacheFile(history.id, historyWithType).then(ok => {
        if (ok) pendingCacheJournal.clearIfCurrent(history.id, pendingOp);
    });
};

export const listFromLocalStorage = (): IChatSessionHistoryV2[] => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('gpt-chat-'));
    const histories: IChatSessionHistoryV2[] = [];

    keys.forEach(key => {
        try {
            const data = JSON.parse(localStorage.getItem(key)!) as ISessionHistoryUnion;
            histories.push(needsMigration(data)
                ? migrateHistory(data)
                : { ...data, type: 'history' as const } as IChatSessionHistoryV2);
        } catch (error) {
            allowCacheEviction = false;
            console.warn(`Failed to parse GPT localStorage history ${key}; skip it and disable cache eviction.`, error);
        }
    });

    return histories;
};

export const removeFromLocalStorage = (id: string) => {
    const pendingOp = pendingCacheJournal.mark(id, 'delete');
    localStorage.removeItem(localStorageKeyForId(id));
    void deleteCacheFile(id).then(ok => {
        if (ok) pendingCacheJournal.clearIfCurrent(id, pendingOp);
    });
};
