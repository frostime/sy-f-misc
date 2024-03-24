/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:30:38
 * @FilePath     : /src/func/index.ts
 * @LastEditTime : 2024-03-23 21:49:15
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import * as nf from './new-file';
import * as it from './insert-time';

export const load = (plugin: FMiscPlugin) => {
    nf.load(plugin);
    it.load(plugin);
}

export const unload = (plugin: FMiscPlugin) => {
    nf.unload(plugin);
    it.unload(plugin);
}
