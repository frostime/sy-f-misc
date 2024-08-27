/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:18:59
 * @FilePath     : /src/func/toggl/index.ts
 * @LastEditTime : 2024-08-27 17:57:12
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import * as store from './store';

import * as togglAPI from './api';
import { Menu } from "siyuan";
import { recordTodayEntriesToDN } from "./func/record-to-dn";

const topbar = (menu: Menu) => {
    menu.addItem({
        label: '今日 Toggl',
        click: () => {
            recordTodayEntriesToDN();
        }
    });
}

let timer: ReturnType<typeof setInterval> | null = null;
const clearTimer = () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

export let name = "Toggl";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    store.load(plugin);

    globalThis.toggl = togglAPI;

    plugin.eb.on('on-topbar-menu', topbar);

    clearTimer();
    //一个小时
    const interval = 60 * 60 * 1000;
    timer = setInterval(() => {
        recordTodayEntriesToDN();
    }, interval);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    globalThis.toggl = null;
    plugin.eb.off('on-topbar-menu', topbar);
    clearTimer();
}