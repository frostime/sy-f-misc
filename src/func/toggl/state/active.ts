/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 19:26:15
 * @FilePath     : /src/func/toggl/state/active.ts
 * @LastEditTime : 2025-01-01 21:22:57
 * @Description  : 
 */
import { createEffect, onCleanup, on } from 'solid-js';
import { type TimeEntry } from '../api/types';
import { getCurrentTimeEntry, stopTimeEntry } from '../api/time_entries';

import { createSignalRef } from '@frostime/solid-signal-ref';

let elapsedTimer: number | null = null;
let syncTimer: number | null = null;
const activeEntry = createSignalRef<TimeEntry | null>(null);
const elapsed = createSignalRef<number>(0);
const isLoading = createSignalRef(false);

const elapsedTime = () => {
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

const syncWithServer = async () => {
    const response = await getCurrentTimeEntry();
    if (response.ok) {
        activeEntry(response.data);
    }
    return response;
};

const stopEntry = async () => {
    const entry = activeEntry();
    if (!entry) return null;
    isLoading(true);
    try {
        // First check server state
        const currentState = await syncWithServer();
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

const startTimers = () => {
    stopTimers();
    elapsedTimer = window.setInterval(updateElapsedTime, 1000);
    syncTimer = window.setInterval(syncWithServer, 5 * 60 * 1000);
};

const stopTimers = () => {
    if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
    }
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
};

// Initialize timers when active entry changes
createEffect(on(activeEntry.signal, (entry) => {
    console.log('activeEntry::effect', entry);
    if (entry) {
        elapsed(0);
        startTimers();
    } else {
        stopTimers();
    }
}));

// Cleanup on unmount
onCleanup(stopTimers);

export {
    activeEntry,
    elapsedTime,
    isLoading,
    stopTimers,
    syncWithServer,
    stopEntry,
    updateElapsedTime
}; 