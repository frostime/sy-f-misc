/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-19 13:16:09
 * @FilePath     : /src/func/simple-search/index.ts
 * @LastEditTime : 2024-04-19 13:16:18
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

export let name = "SimpleSearch";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    
    enabled = false;
}
