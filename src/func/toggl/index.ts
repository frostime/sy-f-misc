/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:18:59
 * @FilePath     : /src/func/toggl/index.ts
 * @LastEditTime : 2025-01-01 22:54:54
 * @Description  : 
 */
import { render } from 'solid-js/web';
import { TogglStatusBar } from './components/status-bar';
import { showTogglDialog } from './components/dialog';
import * as store from './state';
import * as active from './state/active';
import { recordTodayEntriesToDN, toggleAutoFetch } from './func/record-to-dn';
import type FMiscPlugin from '@/index';
import TogglSetting from './setting';

export let name = 'Toggl';
export let enabled = false;

let statusBarDispose: () => void;

const InMiniWindow = () => {
    const body: HTMLElement = document.querySelector('body');
    return body.classList.contains('body--window');
}


export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    await store.load(plugin);
    globalThis.toggl = null;

    plugin.registerMenuTopMenu('toggl', [{
        label: '今日 Toggl',
        icon: 'iconClock',
        click: () => {
            recordTodayEntriesToDN();
        }
    }]);

    if (!InMiniWindow()) {
        // 创建悬浮气泡容器
        const container = document.createElement('div');
        document.body.appendChild(container);

        // 渲染悬浮气泡
        const StatusBarComponent = () => TogglStatusBar({ onClick: showTogglDialog });
        statusBarDispose = render(StatusBarComponent, container);
    }

    if (store.config.token) {
        toggleAutoFetch(store.config.dnAutoFetch);
    }
};

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    globalThis.toggl = null;
    plugin.unRegisterMenuTopMenu('toggl');
    toggleAutoFetch(false);
    if (statusBarDispose) {
        statusBarDispose();
    }
    active.unload();
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