/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:30:38
 * @FilePath     : /src/func/index.ts
 * @LastEditTime : 2024-04-28 20:20:26
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import * as nf from './new-file';
import * as it from './insert-time';
import * as tl from './titled-link';
import * as op from './on-paste';
import * as gt from './global-this';
import * as ct from './change-theme';
import * as mw from './mini-window';
import * as rj from './run-js';
import * as docky from './docky';
import * as tr from './transfer-ref';
import * as fb from './fake-breadcrumb';
import * as ss from './simple-search';
import * as tt from './test-template';

interface IFuncModule {
    name: string;
    enabled: boolean;
    load: (plugin: FMiscPlugin) => void;
    unload: (plugin?: FMiscPlugin) => void;
}

const ModulesToEnable = [
    nf,
    it,
    tl,
    op,
    ct,
    mw,
    rj,
    docky,
    tr,
    fb,
    ss,
    tt
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

    gt.load();
}

export const unload = (plugin: FMiscPlugin) => {
    ModulesToEnable.forEach(module => {
        module.unload(plugin);
    });

    gt.unload();
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
