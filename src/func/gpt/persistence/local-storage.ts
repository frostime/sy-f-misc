/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:38:02
 * @FilePath     : /src/func/gpt/persistence/local-storage.ts
 * @LastEditTime : 2025-03-28 12:06:36
 * @Description  : 
 */

import { thisPlugin } from "@frostime/siyuan-plugin-kits";

const KEEP_N_CACHE_ITEM = 24;


/**
 * 临时缓存，防止重启之后 localStorage 中的记录被完全清空
 */
export const saveCache = async () => {
    const data = listFromLocalStorage();
    if (!data || data.length === 0) return;
    const plugin = thisPlugin();
    await plugin.saveBlob('gpt-chat-cache.json', data);
}


/**
 * 恢复缓存
 */
export const restoreCache = async () => {
    const plugin = thisPlugin();
    const blob = await plugin.loadBlob('gpt-chat-cache.json');
    const data = await blob?.text();
    if (!blob || !data) return;
    let histories: any[] | { code: number } = JSON.parse(data);
    if (!histories || (histories as { code: number }).code === 404) return;
    // sort by updated, 最新的在前
    histories = histories as IChatSessionHistory[];
    if (histories.length === 0) return;
    histories.sort((a, b) => {
        if (a.updated && b.updated) {
            return b.updated - a.updated;
        }
        return b.timestamp - a.timestamp;
    });

    const isExist = (key: string) => {
        return Object.keys(localStorage).some(k => k === key);
    }

    let kept = 0;
    for (let i = 0; i < histories.length && kept < KEEP_N_CACHE_ITEM; i++) {
        const key = `gpt-chat-${histories[i].id}`;
        if (!isExist(key)) {
            localStorage.setItem(key, JSON.stringify(histories[i]));
            kept++;
        }
    }
}

/**
 * 临时保存在 localStorage 中, key 为 ID
 */
export const saveToLocalStorage = (history: IChatSessionHistory) => {
    const key = `gpt-chat-${history.id}`;
    localStorage.setItem(key, JSON.stringify(history));
}

export const listFromLocalStorage = (): IChatSessionHistory[] => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('gpt-chat-'));
    return keys.map(key => JSON.parse(localStorage.getItem(key)));
}

export const removeFromLocalStorage = (id: string) => {
    const key = `gpt-chat-${id}`;
    localStorage.removeItem(key);
}
