/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:38:02
 * @FilePath     : /src/func/gpt/persistence/local-storage.ts
 * @LastEditTime : 2026-06-12 23:10:00
 * @Description  : Per-session cache file I/O (split from monolithic gpt-chat-cache.json)
 */

import { api, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { needsMigration, migrateHistory } from '@gpt/model/msg_migration';
import { showMessage } from "siyuan";

const KEEP_N_CACHE_ITEM = 36;
const CACHE_DIR = 'gpt-cache';
const LEGACY_CACHE_FILE = 'gpt-chat-cache.json';

type ISessionHistoryUnion = IChatSessionHistory | IChatSessionHistoryV2;

// ─── Internal Helpers ───────────────────────────────────────────────

/** Per-session write queue to prevent out-of-order overwrites */
const writeQueue = new Map<string, Promise<void>>();

/** Serialize writes for the same session id */
const enqueueWrite = (id: string, fn: () => Promise<void>) => {
    const prev = writeQueue.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn); // continue chain even on error
    writeQueue.set(id, next);
    return next;
};

/** Write single session to cache dir (serialized per id) */
const writeCacheFile = (id: string, history: IChatSessionHistoryV2) => {
    return enqueueWrite(id, async () => {
        const plugin = thisPlugin();
        await plugin.saveBlob(`${CACHE_DIR}/${id}.json`, history);
    });
};

/** Delete single session cache file */
const deleteCacheFile = async (id: string) => {
    const plugin = thisPlugin();
    await plugin.removeBlob(`${CACHE_DIR}/${id}.json`);
};

/** List all filenames in cache dir */
const listCacheDir = async (): Promise<string[]> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${CACHE_DIR}/`;
    const files = await api.readDir(dir);
    if (!files) return [];
    return files.filter(f => !f.isDir && f.name.endsWith('.json')).map(f => f.name);
};

/** Read and parse a single cache file */
const readCacheFile = async (filename: string): Promise<ISessionHistoryUnion | null> => {
    const plugin = thisPlugin();
    const blob = await plugin.loadBlob(`${CACHE_DIR}/${filename}`);
    if (!blob) return null;
    try {
        const text = await blob.text();
        const data = JSON.parse(text);
        if (!data || (data as { code: number }).code === 404) return null;
        return data as ISessionHistoryUnion;
    } catch {
        return null;
    }
};

/** Drain all pending writes (call before final flush on unload) */
const drainWriteQueue = async () => {
    await Promise.all([...writeQueue.values()]);
};

// ─── Migration ──────────────────────────────────────────────────────

/**
 * Detect legacy gpt-chat-cache.json and split into per-session files.
 * Only runs if gpt-cache/ dir is empty or missing (one-time migration).
 * Old file is preserved (not deleted).
 */
const migrateLegacyCacheIfNeeded = async () => {
    // Guard: skip if split cache already has files
    const existing = await listCacheDir();
    if (existing.length > 0) return;

    const plugin = thisPlugin();
    const blob = await plugin.loadBlob(LEGACY_CACHE_FILE);
    if (!blob) return;
    let text: string;
    try {
        text = await blob.text();
    } catch {
        return;
    }
    if (!text) return;

    let histories: any[];
    try {
        const parsed = JSON.parse(text);
        if (!parsed || (parsed as { code: number }).code === 404) return;
        if (!Array.isArray(parsed)) return;
        histories = parsed;
    } catch {
        return;
    }

    if (histories.length === 0) return;

    // Write each session to individual file
    const writes = histories.map(async (history: ISessionHistoryUnion) => {
        if (!history || !history.id) return;
        let toWrite: IChatSessionHistoryV2;
        if (needsMigration(history)) {
            toWrite = migrateHistory(history) as IChatSessionHistoryV2;
        } else {
            toWrite = history as IChatSessionHistoryV2;
        }
        const plugin = thisPlugin();
        await plugin.saveBlob(`${CACHE_DIR}/${toWrite.id}.json`, toWrite);
    });
    await Promise.all(writes);
};

// ─── Exported API (signatures unchanged) ────────────────────────────

/**
 * 全量同步 localStorage → cache files + evict orphans.
 * Called on unload as a safety net.
 */
export const updateCacheFile = async () => {
    // Drain any pending incremental writes first
    await drainWriteQueue();

    let histories = listFromLocalStorage();

    // Even if localStorage is empty, still evict orphan files
    const existingFiles = await listCacheDir();

    if (!histories || histories.length === 0) {
        // Delete all orphans
        await Promise.all(existingFiles.map(f => deleteCacheFile(f.replace(/\.json$/, ''))));
        return;
    }

    // Sort by updated/timestamp desc, keep top N
    histories.sort((a, b) => {
        if (a.updated && b.updated) return b.updated - a.updated;
        return b.timestamp - a.timestamp;
    });
    histories = histories.slice(0, KEEP_N_CACHE_ITEM);

    const keepIds = new Set(histories.map(h => h.id));

    // Write all kept sessions
    await Promise.all(histories.map(h => {
        const plugin = thisPlugin();
        return plugin.saveBlob(`${CACHE_DIR}/${h.id}.json`, h);
    }));

    // Evict orphan files
    const orphans = existingFiles.filter(f => {
        const id = f.replace(/\.json$/, '');
        return !keepIds.has(id);
    });
    await Promise.all(orphans.map(f => deleteCacheFile(f.replace(/\.json$/, ''))));
};

/**
 * Restore cache files → localStorage on startup.
 */
export const restoreCache = async () => {
    // One-time migration from legacy monolithic file
    await migrateLegacyCacheIfNeeded();

    const filenames = await listCacheDir();
    if (filenames.length === 0) return;

    // Parallel read all cache files
    const results = await Promise.all(filenames.map(readCacheFile));
    let histories = results.filter((h): h is ISessionHistoryUnion => h !== null);

    if (histories.length === 0) return;

    // Sort by updated/timestamp desc, only consider top N
    histories.sort((a, b) => {
        if (a.updated && b.updated) return b.updated - a.updated;
        return b.timestamp - a.timestamp;
    });
    histories = histories.slice(0, KEEP_N_CACHE_ITEM);

    const isExist = (key: string) => {
        return Object.keys(localStorage).some(k => k === key);
    };

    for (const entry of histories) {
        let history = entry;

        // Migrate V1 → V2 on restore
        if (needsMigration(history)) {
            history = migrateHistory(history) as IChatSessionHistoryV2;
        }

        const key = `gpt-chat-${history.id}`;
        if (!isExist(key)) {
            localStorage.setItem(key, JSON.stringify(history));
        }
    }
};

/**
 * Save to localStorage + write corresponding cache file (incremental).
 */
export const saveToLocalStorage = (history: IChatSessionHistoryV2) => {
    if (!history || history.schema !== 2) {
        showMessage('历史记录格式错误，无法保存到 localStorage');
        return;
    }
    const historyWithType = { ...history, type: 'history' as const, schema: 2 };
    const key = `gpt-chat-${history.id}`;
    localStorage.setItem(key, JSON.stringify(historyWithType));

    // Serialized async write to cache file (fire-and-forget from caller's perspective)
    writeCacheFile(history.id, historyWithType);
};

/**
 * List all sessions from localStorage (V2 format).
 */
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

/**
 * Remove from localStorage + delete corresponding cache file.
 */
export const removeFromLocalStorage = (id: string) => {
    const key = `gpt-chat-${id}`;
    localStorage.removeItem(key);

    // Fire-and-forget: delete cache file
    deleteCacheFile(id);
};
