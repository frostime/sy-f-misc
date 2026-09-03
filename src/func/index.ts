/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:30:38
 * @FilePath     : /src/func/index.ts
 * @LastEditTime : 2025-12-20 00:33:16
 * @Description  :
 */
// import { type JSX } from "solid-js";

import type FMiscPlugin from "@/index";
import { settleModuleTransitions } from './lifecycle';
// import * as nf from './new-file/legacy';
import * as nf from './asset-file';
import * as it from './insert-time';
import * as tl from './titled-link';
import * as zt from './zotero';
// import * as ct from './change-theme';
import * as mw from './mini-window';
import * as docky from './docky';
import * as tr from './transfer-ref';

import * as dc from './doc-context';
// import * as ta from './test-api';
import * as ws from './websocket';
import * as pd from './post-doc';
// import * as wb from './webview';
import * as tg from './toggl';
import * as qd from './quick-draft';
import * as qi from './quick-input';
import * as mr from './migrate-refs';
import * as css from './custom-css-file';
import * as gpt from './gpt';
import * as gp from './global-paste';

import * as md from './markdown';

import * as sc from './shared-configs';

import * as srdb from './super-ref-db';

// import * as bookmark from './bookmarks';
import * as dft from './docfile-tools';

import * as priv from './private-func';
import * as htmlPages from './html-pages';

let _ModulesToEnable: IFuncModule[] = [
    // #if [PRIVATE_ADD]
    priv,
    // #endif
    gpt,
    css,
    srdb,
    htmlPages,
    mw,
    gp,
    md,
    zt,
    // tg,
    nf,
    dft,
    dc,
    qd,
    qi,
    it,
    tl,
    pd,
    tr,
    mr,
    ws,
    docky,
    // #if [!PRIVATE_REMOVE]
    tg,
    // #endif
];

let _ModulesAlwaysEnable: IFuncModule[] = [sc];

export const ModulesToEnable = _ModulesToEnable.filter(module => module.allowToUse ? module.allowToUse() : true);
export const ModulesAlwaysEnable = _ModulesAlwaysEnable.filter(module => module.allowToUse ? module.allowToUse() : true);


//`Enable${module.name}`: module

const EnableKey2Module = Object.fromEntries(ModulesToEnable.map(module => [`Enable${module.name}`, module]));


export const load = async (plugin: FMiscPlugin) => {
    const enabledModules = ModulesToEnable.filter(module =>
        plugin.getConfig('Enable', `Enable${module.name}`)
    );
    await settleModuleTransitions(
        'load',
        [...enabledModules, ...ModulesAlwaysEnable],
        plugin
    );
}

export const unload = async (plugin: FMiscPlugin) => {
    await settleModuleTransitions(
        'unload',
        [...ModulesToEnable, ...ModulesAlwaysEnable],
        plugin
    );
}

type EnableKey = keyof FMiscPlugin['data']['configs']['Enable'];

export const toggleEnable = async (plugin: FMiscPlugin, key: EnableKey, enable: boolean) => {
    const module = EnableKey2Module?.[key];
    if (module === undefined) return;

    console.debug(`Toggle ${key} to ${enable}`);
    if (enable === true) {
        await module.load(plugin);
    } else {
        await module.unload(plugin);
    }
}
