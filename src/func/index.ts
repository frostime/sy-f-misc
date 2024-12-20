/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:30:38
 * @FilePath     : /src/func/index.ts
 * @LastEditTime : 2024-12-03 17:42:04
 * @Description  : 
 */
import { type JSX } from "solid-js";

import type FMiscPlugin from "@/index";
import * as nf from './new-file';
import * as it from './insert-time';
import * as tl from './titled-link';
import * as zt from './zotero';
import * as ct from './change-theme';
import * as mw from './mini-window';
import * as docky from './docky';
import * as tr from './transfer-ref';
import * as ss from './simple-search';
// import * as dq from './data-query';
import * as dc from './doc-context';
import * as ta from './test-api';
import * as ws from './websocket';
import * as pd from './post-doc';
import * as wb from './webview';
import * as tg from './toggl';
import * as mr from './migrate-refs';
import * as css from './custom-css-file';

// import * as bookmark from './bookmarks';

interface IFuncModule {
    name: string;
    enabled: boolean;
    load: (plugin: FMiscPlugin) => void;
    unload: (plugin?: FMiscPlugin) => void;
    // 如果声明了, 在会在设置面板中显示启用的按钮
    declareToggleEnabled?: {
        title: string;
        description: string;
        defaultEnabled?: boolean;
    },
    // 放入 Setting 面板中的界面
    declareSettingPanel?: {
        key: string;
        title: string;
        element: () => JSX.Element;
    }[];
}

export const ModulesToEnable = [
    mw,
    docky,
    ss,
    it,
    tl,
    ct,
    zt,
    nf,
    tr,
    mr,
    ws,
    pd,
    ta,
]

export const ModulesAlwaysEnable = [
    // dq,
    dc,
    wb,
    tg,
    css
]

//`Enable${module.name}`: module
const EnableKey2Module = Object.fromEntries(ModulesToEnable.map(module => [`Enable${module.name}`, module]));

export const load = (plugin: FMiscPlugin) => {
    // const Get = plugin.getConfig.bind(plugin);
    ModulesToEnable.forEach(module => {
        if (plugin.getConfig('Enable', `Enable${module.name}`)) {
            module.load(plugin);
            console.debug(`Load ${module.name}`);
        }
    });

    ModulesAlwaysEnable.forEach(module => {
        module.load(plugin);
    });
}

export const unload = (plugin: FMiscPlugin) => {
    ModulesToEnable.forEach(module => {
        module.unload(plugin);
    });

    ModulesAlwaysEnable.forEach(module => {
        module.unload(plugin);
    });
}

type EnableKey = keyof FMiscPlugin['data']['configs']['Enable'];

export const toggleEnable = (plugin: FMiscPlugin, key: EnableKey, enable: boolean) => {
    const DoAction = (module: IFuncModule) => {
        if (module === undefined) return;
        if (enable === true) {
            module.load(plugin);
        } else {
            module.unload(plugin);
        }
    };
    const module = EnableKey2Module?.[key];
    console.debug(`Toggle ${key} to ${enable}`);
    DoAction(module);
}
