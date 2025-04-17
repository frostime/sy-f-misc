/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-04-17 15:20:21
 * @FilePath     : /src/func/private-func/index.ts
 * @LastEditTime : 2025-04-17 18:20:39
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import { toggleDisable, toggleEnable } from "./auto-sync";

import {config } from './config';
export { declareModuleConfig } from './config';

export let name = "PrivateFunc";
export let enabled = false;

export const declareToggleEnabled = {
    title: "🇫 个人功能",
    description: "个人私人功能",
    defaultEnabled: false
};

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    if (config.AutoSyncAfterLongWait) {
        toggleEnable();
    }
};

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;

    toggleDisable();
};
