/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:18:59
 * @FilePath     : /src/func/toggl/index.ts
 * @LastEditTime : 2025-01-01 19:23:07
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import * as store from './state';

import * as togglAPI from './api';
import { recordTodayEntriesToDN, toggleAutoFetch } from "./func/record-to-dn";
import TogglSetting from "./setting";
import { render } from "solid-js/web";
import { TogglStatusBar } from "./components/status-bar";
import { showTogglDialog } from "./components/dialog";

export let name = "Toggl";
export let enabled = false;

let statusBarDispose: () => void;

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

    const statusBarElement = document.createElement('div');
    statusBarDispose = render(() => (
        // <TogglStatusBar onClick={() => showTogglDialog()} />
        TogglStatusBar({
            onClick: () => showTogglDialog()
        })
    ), statusBarElement);

    //插入 statusBarElement 到 statusBar 中
    const element = plugin.addStatusBar({
        element: statusBarElement,
        position: 'left'
    });
    element.style.display = 'none';
    setTimeout(() => {
        // 找到所有兄弟节点中的 .fn__flex-1 元素，并移动到其前面
        const flex1 = element.parentElement?.querySelector('.fn__flex-1');
        if (flex1) {
            flex1.parentElement?.insertBefore(element, flex1);
        }
        element.style.display = '';
    }, 1000);

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
    if (statusBarDispose) {
        statusBarDispose();
    }
    store.stopTimers();
}

export const declareToggleEnabled = {
    title: '⏰ Toggl',
    description: 'Toggl 时间跟踪',
    defaultEnabled: true
};


export const declareSettingPanel = [
    {
        key: 'Toggl',
        title: '⏲️ Toggl',
        element: TogglSetting
    }
]