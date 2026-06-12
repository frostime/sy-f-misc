/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:38:02
 * @FilePath     : /src/func/gpt/persistence/local-storage.ts
 * @LastEditTime : 2026-06-12 22:50:00
 * @Description  : Per-session cache file I/O (split from monolithic gpt-chat-cache.json)
 */

import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { api } from "@frostime/siyuan-plugin-kits";
import { needsMigration, migrateHistory } from '@gpt/model/msg_migration';
import { showMessage } from "siyuan";

const KEEP_N_CACHE_ITEM = 36;
const CACHE_DIR = 'gpt-cache';
const LEGACY_CACHE_FILE = 'gpt-chat-cache.json';

type ISessionHistoryUnion = IChatSessionHistory | IChatSessionHistoryV2;

// ─── Internal Helpers ───────────────────────────────────────────────

/** Write single session to cache dir */
const writeCacheFile = async (id: string, history: IChatSessionHistoryV2) => {
    const plugin = thisPlugin();
    await plugin.saveBlob(`${CACHE_DIR}/${id}.json`, history);
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

// ─── Migration ──────────────────────────────────────────────────────

/**
 * Detect legacy gpt-chat-cache.json and split into per-session files.
 * Old file is preserved (not deleted).
 */
const migrateLegacyCacheIfNeeded = async () => {
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
        // Migrate V1 → V2 during split
        let toWrite: IChatSessionHistoryV2;
        if (needsMigration(history)) {
            toWrite = migrateHistory(history) as IChatSessionHistoryV2;
        } else {
            toWrite = history as IChatSessionHistoryV2;
        }
        await writeCacheFile(toWrite.id, toWrite);
    });
    await Promise.all(writes);
    // Legacy file preserved — not deleted
};

// ─── Exported API (signatures unchanged) ────────────────────────────

/**
 * 全量同步 localStorage → cache files + evict orphans.
 * Called on unload as a safety net.
 */
export const updateCacheFile = async () => {
    let histories = listFromLocalStorage();
    if (!histories || histories.length === 0) return;

    // Sort by updated/timestamp desc, keep top N
    histories.sort((a, b) => {
        if (a.updated && b.updated) return b.updated - a.updated;
        return b.timestamp - a.timestamp;
    });
    histories = histories.slice(0, KEEP_N_CACHE_ITEM);

    const keepIds = new Set(histories.map(h => h.id));

    // Write all kept sessions
    await Promise.all(histories.map(h => writeCacheFile(h.id, h)));

    // Evict orphan files
    const existingFiles = await listCacheDir();
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

    // Sort by updated/timestamp desc
    histories.sort((a, b) => {
        if (a.updated && b.updated) return b.updated - a.updated;
        return b.timestamp - a.timestamp;
    });

    const isExist = (key: string) => {
        return Object.keys(localStorage).some(k => k === key);
    };

    let kept = 0;
    for (let i = 0; i < histories.length && kept < KEEP_N_CACHE_ITEM; i++) {
        let history = histories[i] as ISessionHistoryUnion;

        // Migrate V1 → V2 on restore
        if (needsMigration(history)) {
            history = migrateHistory(history) as IChatSessionHistoryV2;
        }

        const key = `gpt-chat-${history.id}`;
        if (!isExist(key)) {
            localStorage.setItem(key, JSON.stringify(history));
            kept++;
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

    // Fire-and-forget: write to cache file
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
