/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:18:59
 * @FilePath     : /src/func/toggl/index.ts
 * @LastEditTime : 2024-12-19 14:21:04
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import * as store from './store';

import * as togglAPI from './api';
import { recordTodayEntriesToDN, toggleAutoFetch } from "./func/record-to-dn";
import TogglSetting from "./setting";

export let name = "Toggl";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    await store.load(plugin);

    globalThis.toggl = togglAPI;

    plugin.registerMenuTopMenu('toggl', [{
        label: '今日 Toggl',
        icon: 'iconClock',
        click: () => {
            recordTodayEntriesToDN();
        }
    }]);

    if (store.config.token) {
        toggleAutoFetch(store.config.dnAutoFetch);
    }
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    globalThis.toggl = null;
    plugin.unRegisterMenuTopMenu('toggl');
    toggleAutoFetch(false);
}

export const declareSettingPanel = [
    {
        key: 'Toggl',
        title: '⏲️ Toggl',
        element: TogglSetting
    }
]