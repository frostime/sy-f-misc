/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:18:59
 * @FilePath     : /src/func/toggl/index.ts
 * @LastEditTime : 2024-08-27 15:16:55
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import * as store from './store';

import * as togglAPI from './api';

export let name = "Toggl";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    store.load(plugin);

    globalThis.toggl = togglAPI;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    globalThis.toggl = null;
}