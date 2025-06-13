/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-04-17 15:20:21
 * @FilePath     : /src/func/private-func/index.ts
 * @LastEditTime : 2025-06-13 12:11:56
 * @Description  :
 */
import type FMiscPlugin from "@/index";
import { toggleDisable, toggleEnable } from "./auto-sync";
import * as toQuickDn from "./to-quick-dn";
// import { showMessage } from "siyuan";

import { config } from './config';
export { declareModuleConfig } from './config';

export let name = "PrivateFunc";
export let enabled = false;
let plugin: FMiscPlugin | null = null;

export const declareToggleEnabled = {
    title: "🇫 个人功能",
    description: "个人私人功能",
    defaultEnabled: false
};

const handleKeyDown = (e: KeyboardEvent) => {
    // 检查是否是 Ctrl+S
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        // 阻止默认的保存行为
        e.preventDefault();
        e.stopPropagation();
        const target = e.target as HTMLElement;
        const protyle = target.closest('.protyle');
        if (protyle) {
            const dataid = protyle.getAttribute('data-id');
            const header = document.querySelector(`li[data-type="tab-header"][data-id="${dataid}"]`);
            if (!header) return;
            header.classList.toggle('item--unupdate', false);
            return;
        }
        const headers = document.querySelectorAll('li[data-type="tab-header"].item--unupdate');
        if (headers.length === 0) return;
        headers.forEach(header => {
            header.classList.remove('item--unupdate');
        });
    }
};

export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin = plugin_;

    // 添加全局键盘事件监听（如果配置启用）
    if (config.EnableCtrlSFixTab) {
        document.addEventListener('keydown', handleKeyDown, true);
    }

    if (config.AutoSyncAfterLongWait) {
        toggleEnable();
    }

    toQuickDn.load();
};

export const unload = (_plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;

    // 移除全局键盘事件监听
    document.removeEventListener('keydown', handleKeyDown, true);

    toggleDisable();
    plugin = null;

    toQuickDn.unload();
};
