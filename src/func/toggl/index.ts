/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:18:59
 * @FilePath     : /src/func/toggl/index.ts
 * @LastEditTime : 2025-01-02 01:24:02
 * @Description  : 
 */
import * as components from './components';
// import * as store from './state';
import * as config from './state/config';
import * as active from './state/active';
import { recordTodayEntriesToDN, toggleAutoFetch } from './func/record-to-dn';
import type FMiscPlugin from '@/index';
import TogglSetting from './setting';

export let name = 'Toggl';
export let enabled = false;


export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    await config.load(plugin);
    active.load()
    globalThis.toggl = null;

    plugin.registerMenuTopMenu('toggl', [{
        label: '今日 Toggl',
        icon: 'iconClock',
        click: () => {
            recordTodayEntriesToDN();
        }
    }]);

    if (config.config().token) {
        toggleAutoFetch(config.config().dnAutoFetch);
    }

    plugin.addLayoutReadyCallback(() => {
        components.load();
    })
};

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    globalThis.toggl = null;
    plugin.unRegisterMenuTopMenu('toggl');
    toggleAutoFetch(false);
    components.unload();
    active.unload();
}

export const declareToggleEnabled = {
    title: '⏰ Toggl',
    description: 'Toggl 时间跟踪',
    defaultEnabled: false
};


export const declareSettingPanel = [
    {
        key: 'Toggl',
        title: '⏲️ Toggl',
        element: TogglSetting
    }
]