/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-18 22:10:17
 * @FilePath     : /src/func/fake-breadcrumb/index.ts
 * @LastEditTime : 2024-04-18 22:14:34
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import FakeDocBreadcrumb from './core';

let CorePlugin: FakeDocBreadcrumb;

export let name = "FakeBreadcrumb";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    CorePlugin = new FakeDocBreadcrumb(plugin);
    CorePlugin.onload();
    CorePlugin.onLayoutReady();
    enabled = true;
}

export const unload = () => {
    if (!enabled) return;
    CorePlugin.onunload();
    CorePlugin = null;
    enabled = false;
}
