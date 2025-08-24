/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-08-24 16:20:00
 * @FilePath     : /src/func/gpt/chat/ChatSession/DeleteHistory/useDeleteHistory.ts
 * @LastEditTime : 2025-08-24 16:20:00
 * @Description  : 删除历史记录管理 Hook
 */

import { createSignal, createMemo } from 'solid-js';
import type { IDeleteRecord, IDeleteHistoryManager } from './types';

const STORAGE_KEY = 'gpt-delete-history';
const MAX_RECORDS = 50; // 最多保存50条记录

/**
 * 从 localStorage 加载记录
 */
const loadRecords = (): IDeleteRecord[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

/**
 * 保存记录到 localStorage
 */
const saveRecords = (records: IDeleteRecord[]): void => {
    try {
        // 按时间排序，保留最新的记录
        const sortedRecords = records
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_RECORDS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sortedRecords));
    } catch (error) {
        console.warn('Failed to save delete history:', error);
    }
};


/**
 * 删除历史记录管理 Hook
 */
export const useDeleteHistory = (): IDeleteHistoryManager => {
    const [records, setRecords] = createSignal<IDeleteRecord[]>(loadRecords());

    const addRecord = (record: Omit<IDeleteRecord, 'id' | 'deletedAt'>) => {
        const newRecord: IDeleteRecord = {
            ...record,
            id: window.Lute.NewNodeID(),
            deletedAt: Date.now()
        };

        setRecords(prev => {
            const updated = [newRecord, ...prev];
            saveRecords(updated);
            return updated;
        });
    };

    const clearRecords = () => {
        setRecords([]);
        localStorage.removeItem(STORAGE_KEY);
    };

    const removeRecord = (recordId: string) => {
        setRecords(prev => {
            const updated = prev.filter(r => r.id !== recordId);
            saveRecords(updated);
            return updated;
        });
    };

    const count = createMemo(() => records().length);

    return {
        records,
        addRecord,
        clearRecords,
        removeRecord,
        count
    };
};
