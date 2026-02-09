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
import * as qit from './quick-input-template/index';

let _ModulesToEnable: IFuncModule[] = [
    // #if [PRIVATE_ADD]
    priv,
    // #endif
    gpt,
    css,
    srdb,
    htmlPages,
    qit,
    mw,
    gp,
    md,
    zt,
    tg,
    nf,
    dft,
    dc,
    qd,
    it,
    tl,
    pd,
    tr,
    mr,
    ws,
    // #if [!PRIVATE_REMOVE]
    docky,
    // #endif
];

let _ModulesAlwaysEnable: IFuncModule[] = [sc];

export const ModulesToEnable = _ModulesToEnable.filter(module => module.allowToUse ? module.allowToUse() : true);
export const ModulesAlwaysEnable = _ModulesAlwaysEnable.filter(module => module.allowToUse ? module.allowToUse() : true);


//`Enable${module.name}`: module

const EnableKey2Module = Object.fromEntries(ModulesToEnable.map(module => [`Enable${module.name}`, module]));


export const load = (plugin: FMiscPlugin) => {
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
