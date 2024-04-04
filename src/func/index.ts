/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:30:38
 * @FilePath     : /src/func/index.ts
 * @LastEditTime : 2024-04-04 20:32:14
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import * as nf from './new-file';
import * as it from './insert-time';
import * as tl from './titled-link';
import * as op from './on-paste';
import * as gt from './global-this';
import * as ct from './change-theme';

interface IFuncModule {
    name: string;
    enabled: boolean;
    load: (plugin: FMiscPlugin) => void;
    unload: (plugin: FMiscPlugin) => void;
}

const ModulesToEnable = [
    nf,
    it,
    tl,
    op,
    ct
]

//`Enable${module.name}`: module
const EnableKey2Module = Object.fromEntries(ModulesToEnable.map(module => [`Enable${module.name}`, module]));

export const load = (plugin: FMiscPlugin) => {
    // const Get = plugin.getConfig.bind(plugin);
    ModulesToEnable.forEach(module => {
        if (plugin.getConfig('启用功能', `Enable${module.name}`)) {
            module.load(plugin);
            console.debug(`Load ${module.name}`);
        }
    });

    gt.load(plugin);
    console.debug(`Load ${gt.name}`);
}

export const unload = (plugin: FMiscPlugin) => {
    nf.unload(plugin);
    it.unload(plugin);
    tl.unload(plugin);
    op.unload(plugin);
    ct.unload(plugin);

    gt.unload(plugin);
}

type EnableKey = keyof FMiscPlugin['data']['configs']['启用功能'];

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
    // if (key === "EnableNewFile") DoAction(nf);
    // if (key === "EnableInsertTime") DoAction(it);
    // if (key === "EnableTitledLink") DoAction(tl);
    // if (key === "EnableOnPaste") DoAction(op);
    // if (key === "EnableGlobalThis") DoAction(gt);
}
