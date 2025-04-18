/*
 * Copyright (c) 2023 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2023-04-17 15:28:36
 * @FilePath     : /src/func/private-func/auto-sync.ts
 * @LastEditTime : 2025-04-17 22:35:58
 */

import { throttle } from "@frostime/siyuan-plugin-kits";

import { config } from './config';
import { showMessage } from "siyuan";

let isEnabled = false;

const WAIT_INTERVAL_SECONDS = 3600; // 1 hour
const MIN_SYNC_INTERVAL_SECONDS = 300; // 5 minutes
const INTERACTION_EVENTS = ['mousemove', 'focus'];

const timeRecorder = {
    lastInteractionTime: Date.now(),
    getTimeInterval: () => {
        return Date.now() - timeRecorder.lastInteractionTime;
    },
    isLongWait: () => {
        return timeRecorder.getTimeInterval() > config.WAIT_INTERVAL_HOURS * WAIT_INTERVAL_SECONDS * 1000;
    },
    shouldSync: () => {
        const synced: number = window.siyuan.config.sync.synced;
        return Date.now() - synced > MIN_SYNC_INTERVAL_SECONDS * 1000;
    },
    updateInteractionTime: () => {
        timeRecorder.lastInteractionTime = Date.now();
    }
};

/**
 * Performs synchronization by clicking the sync button
 * @returns {boolean} Whether sync was attempted
 */
const performSync = (): boolean => {
    try {
        const ele = document.querySelector('#toolbar>#barSync') as HTMLElement;
        if (ele) {
            console.log('[Auto-Sync] Perform Sync');
            ele.click();
            return true;
        }
        console.warn('[Auto-Sync] Sync button not found');
        return false;
    } catch (error) {
        console.error('[Auto-Sync] Error during sync:', error);
        return false;
    }
};

const performSyncThrottled = throttle(performSync, 5000);

const handleInteraction = () => {
    if (!isEnabled) return;

    if (timeRecorder.isLongWait() && timeRecorder.shouldSync()) {
        console.log('经过了长期空置后，需要自动同步')
        showMessage('长时间隔，自动同步中...');
        performSyncThrottled();
    }

    timeRecorder.updateInteractionTime();
};

/**
 * Enables automatic synchronization
 */
export const toggleEnable = () => {
    console.debug(`[Auto-Sync] toggleEnable: Wait interval: ${config.WAIT_INTERVAL_HOURS} hours`);
    if (!window.siyuan.config.sync.enabled) {
        showMessage('未开启同步，所以自动等待同步功能无效');
        return false;
    }
    if (!isEnabled) {
        isEnabled = true;
        timeRecorder.lastInteractionTime = Date.now();

        const options = { capture: true };
        INTERACTION_EVENTS.forEach(event => {
            window.addEventListener(event, handleInteraction, options);
        });
    }
    return true;
};

/**
 * Disables automatic synchronization
 */
export const toggleDisable = () => {
    console.debug('[Auto-Sync] toggleDisable');
    if (!isEnabled) {
        return;  // Already disabled
    }

    isEnabled = false;

    const options = { capture: true };
    INTERACTION_EVENTS.forEach(event => {
        window.removeEventListener(event, handleInteraction, options);
    });
};
