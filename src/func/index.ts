/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:30:38
 * @FilePath     : /src/func/index.ts
 * @LastEditTime : 2024-04-04 19:25:53
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import * as nf from './new-file';
import * as it from './insert-time';
import * as tl from './titled-link';
import * as op from './on-paste';
import * as gt from './global-this';

interface IFuncModule {
    enabled: boolean;
    load: (plugin: FMiscPlugin) => void;
    unload: (plugin: FMiscPlugin) => void;
}

export const Modules = {
    nf,
    it,
    tl,
    op,
    gt
}

export const load = (plugin: FMiscPlugin) => {
    const Get = plugin.getConfig.bind(plugin);
    if (Get("启用功能", "EnableNewFile")) nf.load(plugin);
    if (Get("启用功能", "EnableInsertTime")) it.load(plugin);
    if (Get("启用功能", "EnableTitledLink")) tl.load(plugin);
    if (Get("启用功能", "EnableOnPaste")) op.load(plugin);
    gt.load(plugin);
}

export const unload = (plugin: FMiscPlugin) => {
    nf.unload(plugin);
    it.unload(plugin);
    tl.unload(plugin);
    op.unload(plugin);
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
    if (key === "EnableNewFile") DoAction(nf);
    if (key === "EnableInsertTime") DoAction(it);
    if (key === "EnableTitledLink") DoAction(tl);
    if (key === "EnableOnPaste") DoAction(op);
    // if (key === "EnableGlobalThis") DoAction(gt);
}
