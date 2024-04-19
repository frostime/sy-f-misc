/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-19 13:16:09
 * @FilePath     : /src/func/simple-search/index.ts
 * @LastEditTime : 2024-04-19 14:27:58
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import SimpleSearch from "./core";

let simpleSearch: SimpleSearch;

export let name = "SimpleSearch";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    simpleSearch = new SimpleSearch(plugin);
    simpleSearch.onLayoutReady();
    enabled = true;
}

export const unload = () => {
    if (!enabled) return;
    simpleSearch.onunload();
    simpleSearch = null;
    enabled = false;
}
