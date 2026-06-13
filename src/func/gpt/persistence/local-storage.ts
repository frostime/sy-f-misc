/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:38:02
 * @FilePath     : /src/func/gpt/persistence/local-storage.ts
 * @LastEditTime : 2026-06-13 17:00:00
 * @Description  : Per-session cache file I/O (split from monolithic gpt-chat-cache.json)
 */

import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { needsMigration, migrateHistory } from '@gpt/model/msg_migration';
import { showMessage } from "siyuan";
import { listStorageDirResult, readStorageJson } from "./storage-read";

const KEEP_N_CACHE_ITEM = 36;
const CACHE_DIR = 'gpt-cache';
const LEGACY_CACHE_FILE = 'gpt-chat-cache.json';
const LEGACY_MIGRATION_MARKER = '_legacy_migrated';

type ISessionHistoryUnion = IChatSessionHistory | IChatSessionHistoryV2;
type CacheDirRestoreResult =
    | { status: 'empty'; histories: []; hasMigrationMarker: boolean }
    | { status: 'ok'; histories: ISessionHistoryUnion[] }
    | { status: 'partial'; histories: ISessionHistoryUnion[] }
    | { status: 'failed'; histories: [] };

type CacheDirListResult =
    | { status: 'ok'; filenames: string[]; hasMigrationMarker: boolean }
    | { status: 'missing'; filenames: []; hasMigrationMarker: false }
    | { status: 'failed'; filenames: []; hasMigrationMarker: false };

let allowCacheEviction = true;

// ─── Cache file I/O ─────────────────────────────────────────────────

const writeQueue = new Map<string, Promise<boolean>>();

const enqueueWrite = (id: string, fn: () => Promise<void>) => {
    const prev = writeQueue.get(id) ?? Promise.resolve(true);
    const next = prev
        .catch(() => false)
        .then(fn)
        .then(() => true)
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
    return enqueueWrite(id, async () => {
        await thisPlugin().saveBlob(`${CACHE_DIR}/${id}.json`, history);
    });
};

const deleteCacheFile = (id: string) => {
    return enqueueWrite(id, async () => {
        await thisPlugin().removeBlob(`${CACHE_DIR}/${id}.json`);
    });
};

const listCacheDirResult = async (): Promise<CacheDirListResult> => {
    const result = await listStorageDirResult(CACHE_DIR);
    if (result.status !== 'ok') {
        return { status: result.status, filenames: [], hasMigrationMarker: false };
    }

    return {
        status: 'ok',
        filenames: result.items.filter(f => !f.isDir && f.name.endsWith('.json')).map(f => f.name),
        hasMigrationMarker: result.items.some(f => !f.isDir && f.name === LEGACY_MIGRATION_MARKER)
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

// ─── Legacy migration (self-contained) ──────────────────────────────

const migrateFromLegacy = async () => {
    const existing = await listCacheDirResult();
    if (existing.status === 'failed') {
        allowCacheEviction = false;
        return;
    }

    if (existing.status === 'ok') {
        if (existing.hasMigrationMarker) return;
        if (existing.filenames.length > 0) {
            await writeLegacyMigrationMarker();
            return;
        }
    }

    const legacyHistories = await readLegacyCache();
    if (!legacyHistories || legacyHistories.length === 0) return;

    const results = await Promise.all(legacyHistories.map(h => {
        if (!h?.id) return Promise.resolve(true);
        const toWrite = needsMigration(h)
            ? migrateHistory(h) as IChatSessionHistoryV2
            : h as IChatSessionHistoryV2;
        return writeCacheFile(toWrite.id, toWrite);
    }));

    if (results.every(Boolean)) {
        await writeLegacyMigrationMarker();
    }
};

const readLegacyCache = async (): Promise<ISessionHistoryUnion[] | null> => {
    const parsed = await readStorageJson<unknown>(LEGACY_CACHE_FILE);
    return Array.isArray(parsed) ? parsed as ISessionHistoryUnion[] : null;
};

const writeLegacyMigrationMarker = async () => {
    try {
        await thisPlugin().saveBlob(`${CACHE_DIR}/${LEGACY_MIGRATION_MARKER}`, {
            migratedAt: Date.now(),
            legacyFile: LEGACY_CACHE_FILE,
            schema: 1
        });
    } catch (error) {
        console.warn('Failed to write GPT legacy cache migration marker:', error);
    }
};

// ─── Exported API ───────────────────────────────────────────────────

const restoreFromCacheDir = async (): Promise<CacheDirRestoreResult> => {
    try {
        const dir = await listCacheDirResult();
        if (dir.status === 'failed') return { status: 'failed', histories: [] };
        if (dir.status === 'missing') return { status: 'empty', histories: [], hasMigrationMarker: false };
        if (dir.filenames.length === 0) {
            return { status: 'empty', histories: [], hasMigrationMarker: dir.hasMigrationMarker };
        }

        const results = await Promise.all(dir.filenames.map(readCacheFile));
        const histories = results.filter((h): h is ISessionHistoryUnion => h !== null);
        if (histories.length === dir.filenames.length) return { status: 'ok', histories };
        if (histories.length > 0) return { status: 'partial', histories };
        return { status: 'failed', histories: [] };
    } catch {
        return { status: 'failed', histories: [] };
    }
};

export const updateCacheFile = async () => {
    await drainWriteQueue();

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

    await Promise.all(kept.map(h => writeCacheFile(h.id, h)));

    if (!allowCacheEviction) return;

    const orphans = existingFiles.filter(f => !keepIds.has(f.replace(/\.json$/, '')));
    await Promise.all(orphans.map(f => deleteCacheFile(f.replace(/\.json$/, ''))));
};

export const restoreCache = async () => {
    await migrateFromLegacy();

    const cacheResult = await restoreFromCacheDir();
    let histories: ISessionHistoryUnion[] | null = null;

    if (cacheResult.status === 'ok' || cacheResult.status === 'partial') {
        histories = cacheResult.histories;
        allowCacheEviction = cacheResult.status === 'ok';
        if (cacheResult.status === 'partial') {
            console.warn('GPT cache restore partially failed; orphan eviction is disabled for this session.');
        }
    } else if (cacheResult.status === 'empty') {
        if (cacheResult.hasMigrationMarker) return;
        histories = await readLegacyCache();
        allowCacheEviction = true;
    } else {
        allowCacheEviction = false;
        console.warn('GPT cache restore failed; skip legacy fallback and disable orphan eviction to avoid data loss.');
        return;
    }

    if (!histories || histories.length === 0) return;

    histories.sort((a, b) => {
        if (a.updated && b.updated) return b.updated - a.updated;
        return b.timestamp - a.timestamp;
    });
    histories = histories.slice(0, KEEP_N_CACHE_ITEM);

    const isExist = (key: string) => Object.keys(localStorage).some(k => k === key);

    for (let history of histories) {
        if (needsMigration(history)) {
            history = migrateHistory(history) as IChatSessionHistoryV2;
        }
        const key = `gpt-chat-${history.id}`;
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
    localStorage.setItem(`gpt-chat-${history.id}`, JSON.stringify(historyWithType));
    void writeCacheFile(history.id, historyWithType);
};

export const listFromLocalStorage = (): IChatSessionHistoryV2[] => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('gpt-chat-'));
    return keys.map(key => {
        const data = JSON.parse(localStorage.getItem(key)!) as ISessionHistoryUnion;
        if (needsMigration(data)) {
            return migrateHistory(data);
        }
        return { ...data, type: 'history' as const } as IChatSessionHistoryV2;
    });
};

export const removeFromLocalStorage = (id: string) => {
    localStorage.removeItem(`gpt-chat-${id}`);
    void deleteCacheFile(id);
};
