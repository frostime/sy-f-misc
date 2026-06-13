/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:38:02
 * @FilePath     : /src/func/gpt/persistence/local-storage.ts
 * @LastEditTime : 2026-06-13 17:00:00
 * @Description  : Per-session cache file I/O (split from monolithic gpt-chat-cache.json)
 */

import { api, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { needsMigration, migrateHistory } from '@gpt/model/msg_migration';
import { showMessage } from "siyuan";

const KEEP_N_CACHE_ITEM = 36;
const CACHE_DIR = 'gpt-cache';
const LEGACY_CACHE_FILE = 'gpt-chat-cache.json';

type ISessionHistoryUnion = IChatSessionHistory | IChatSessionHistoryV2;
type CacheDirRestoreResult =
    | { status: 'empty'; histories: [] }
    | { status: 'ok'; histories: ISessionHistoryUnion[] }
    | { status: 'partial'; histories: ISessionHistoryUnion[] }
    | { status: 'failed'; histories: [] };

let allowCacheEviction = true;

// ─── Cache file I/O ─────────────────────────────────────────────────

const writeQueue = new Map<string, Promise<void>>();

const enqueueWrite = (id: string, fn: () => Promise<void>) => {
    const prev = writeQueue.get(id) ?? Promise.resolve();
    const next = prev
        .catch(() => undefined)
        .then(fn)
        .catch((error) => {
            console.warn(`Failed to update GPT cache file ${id}:`, error);
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

const listCacheDir = async (): Promise<string[]> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${CACHE_DIR}/`;
    const files = await api.readDir(dir);
    if (!files) return [];
    return files.filter(f => !f.isDir && f.name.endsWith('.json')).map(f => f.name);
};

const readCacheFile = async (filename: string): Promise<ISessionHistoryUnion | null> => {
    const fromFs = readCacheFileWithFs(filename);
    if (fromFs) return fromFs;

    try {
        const blob = await thisPlugin().loadBlob(`${CACHE_DIR}/${filename}`);
        if (!blob) return null;
        const text = await blob.text();
        const data = JSON.parse(text);
        if (!data || (data as { code: number }).code === 404) return null;
        return data as ISessionHistoryUnion;
    } catch {
        return null;
    }
};

const drainWriteQueue = async () => {
    await Promise.allSettled([...writeQueue.values()]);
};

const getStorageFilePath = (...parts: string[]): string | null => {
    try {
        const nodePath = window?.require?.('path') ?? require('path');
        const dataDir: string | undefined = (window as any)?.siyuan?.config?.system?.dataDir;
        if (!nodePath || !dataDir) return null;
        return nodePath.join(dataDir, 'storage', 'petal', thisPlugin().name, ...parts);
    } catch {
        return null;
    }
};

const readJsonFileWithFs = <T>(...parts: string[]): T | null => {
    try {
        const nodeFs = window?.require?.('fs') ?? require('fs');
        const filePath = getStorageFilePath(...parts);
        if (!nodeFs || !filePath || !nodeFs.existsSync(filePath)) return null;

        const text = nodeFs.readFileSync(filePath, 'utf-8');
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
};

const readCacheFileWithFs = (filename: string): ISessionHistoryUnion | null => {
    return readJsonFileWithFs<ISessionHistoryUnion>(CACHE_DIR, filename);
};

// ─── Legacy migration (self-contained) ──────────────────────────────

const migrateFromLegacy = async () => {
    const existing = await listCacheDir();
    const legacyHistories = readLegacyWithFs() ?? await readLegacyWithBlob();
    if (!legacyHistories || legacyHistories.length === 0) return;

    const existingIds = new Set(existing.map(f => f.replace(/\.json$/, '')));
    const pending = legacyHistories.filter(h => h?.id && !existingIds.has(h.id));
    if (pending.length === 0) return;

    await Promise.all(pending.map(h => {
        const toWrite = needsMigration(h)
            ? migrateHistory(h) as IChatSessionHistoryV2
            : h as IChatSessionHistoryV2;
        return writeCacheFile(toWrite.id, toWrite);
    }));
};

const readLegacyWithFs = (): ISessionHistoryUnion[] | null => {
    const parsed = readJsonFileWithFs<unknown>(LEGACY_CACHE_FILE);
    return Array.isArray(parsed) ? parsed as ISessionHistoryUnion[] : null;
};

const readLegacyWithBlob = async (): Promise<ISessionHistoryUnion[] | null> => {
    try {
        const blob = await thisPlugin().loadBlob(LEGACY_CACHE_FILE);
        if (!blob) return null;
        const text = await blob.text();
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

// ─── Exported API ───────────────────────────────────────────────────

const restoreFromCacheDir = async (): Promise<CacheDirRestoreResult> => {
    try {
        const filenames = await listCacheDir();
        if (filenames.length === 0) return { status: 'empty', histories: [] };

        const results = await Promise.all(filenames.map(readCacheFile));
        const histories = results.filter((h): h is ISessionHistoryUnion => h !== null);
        if (histories.length === filenames.length) return { status: 'ok', histories };
        if (histories.length > 0) return { status: 'partial', histories };
        return { status: 'failed', histories: [] };
    } catch {
        return { status: 'failed', histories: [] };
    }
};

export const updateCacheFile = async () => {
    await drainWriteQueue();

    const histories = listFromLocalStorage();
    const existingFiles = await listCacheDir();

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
        histories = readLegacyWithFs() ?? await readLegacyWithBlob();
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
