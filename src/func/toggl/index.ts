/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:18:59
 * @FilePath     : /src/func/toggl/index.ts
 * @LastEditTime : 2024-10-20 17:29:57
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import * as store from './store';

import * as togglAPI from './api';
import { Menu } from "siyuan";
import { recordTodayEntriesToDN, toggleAutoFetch } from "./func/record-to-dn";
import TogglSetting from "./setting";

const topbar = (menu: Menu) => {
    menu.addItem({
        label: '今日 Toggl',
        icon: 'iconClock',
        click: () => {
            recordTodayEntriesToDN();
        }
    });
}

export const declareSettingPanel = [
    {
        key: 'Toggl',
        title: '⏲️ Toggl',
        element: TogglSetting
    }
]

export let name = "Toggl";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    await store.load(plugin);

    globalThis.toggl = togglAPI;

    plugin.eb.on('on-topbar-menu', topbar);
    toggleAutoFetch(store.config.dnAutoFetch);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    globalThis.toggl = null;
    plugin.eb.off('on-topbar-menu', topbar);
    toggleAutoFetch(false);
}