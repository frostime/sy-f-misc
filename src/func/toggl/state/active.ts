/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 19:26:15
 * @FilePath     : /src/func/toggl/state/active.ts
 * @LastEditTime : 2025-01-05 18:21:23
 * @Description  : 
 */
import { createEffect, onCleanup, on } from 'solid-js';
import { type TimeEntry } from '../api/types';
import { getCurrentTimeEntry, startTimeEntry, stopTimeEntry, updateTimeEntry } from '../api/time_entries';

import { createSignalRef } from '@frostime/solid-signal-ref';
import { me } from './config';
import { showMessage } from 'siyuan';

let elapsedTimer: number | null = null;
let syncTimer: number | null = null;
export const activeEntry = createSignalRef<TimeEntry | null>(null);
export const elapsed = createSignalRef<number>(0);
export const isLoading = createSignalRef(false);

export const elapsedTime = () => {
    if (elapsed() < 0) return '00:00:00';
    const hours = Math.floor(elapsed() / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((elapsed() % 3600) / 60).toString().padStart(2, '0');
    const seconds = (elapsed() % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}



const updateElapsedTime = () => {
    const entry = activeEntry();
    if (!entry) {
        elapsed(0);
        return;
    }
    const start = new Date(entry.start);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
    elapsed(diff);
};

export const syncEntry = async () => {
    const response = await getCurrentTimeEntry();
    if (response.ok) {
        activeEntry(response.data);
    }
    return response;
};

export const startEntry = async (entry: {
    description?: string;
    project_id?: number | null;
    tag_ids?: number[];
    force?: boolean;
}) => {
    if (!me().default_workspace_id) return null;

    if (activeEntry()) {
        if (entry.force) {
            await stopEntry();
        } else {
            showMessage(`${activeEntry().description} is already running`);
            return null;
        }
    }

    const response = await startTimeEntry({
        ...entry,
        workspace_id: me().default_workspace_id
    });
    if (response.ok) {
        activeEntry(response.data);
    }
    return response;
};

export const stopEntry = async () => {
    const entry = activeEntry();
    if (!entry) return null;
    isLoading(true);
    try {
        // First check server state
        const currentState = await syncEntry();
        if (!currentState.ok || !currentState.data) {
            // Entry already stopped on server
            activeEntry(null);
            return currentState;
        }

        // Stop the entry on server
        const response = await stopTimeEntry(entry.id);
        if (response.ok) {
            activeEntry(null);
        }
        return response;
    } finally {
        isLoading(false);
    }
};

export const updateEntry = async (entry: {
    description?: string;
    project_id?: number | null;
    tag_ids?: number[];
}) => {
    if (!activeEntry()) return null;
    const response = await updateTimeEntry(activeEntry().id, entry);
    if (response.ok) {
        activeEntry(response.data);
    }
    return response;
};

const clearElapsedTimer = () => {
    if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
    }
}
const clearSyncTimer = () => {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
}

const startElapsedTimer = () => {
    clearElapsedTimer();
    elapsedTimer = window.setInterval(updateElapsedTime, 1000);
    // syncTimer = window.setInterval(syncEntry, 5 * 60 * 1000);
};

/**
 * 每隔一段时间，从云端获取当前的 time entry 的状态
 */
const startSyncTimer = () => {
    clearSyncTimer();
    syncTimer = window.setInterval(syncEntry, 5 * 60 * 1000);
};

// Initialize timers when active entry changes
createEffect(on(activeEntry.signal, (entry) => {
    console.log('activeEntry::effect', entry);
    if (entry) {
        elapsed(0);
        startElapsedTimer();
    } else {
        clearElapsedTimer();
    }
}));

// Cleanup on unmount
onCleanup(clearElapsedTimer);

export const load = async () => {
    if (!me()) return false;
    syncEntry();
    startSyncTimer();
}

export const unload = () => {
    activeEntry(null);
    clearElapsedTimer();
    clearSyncTimer();
}
