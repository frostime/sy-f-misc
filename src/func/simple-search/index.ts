/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-19 13:16:09
 * @FilePath     : /src/func/simple-search/index.ts
 * @LastEditTime : 2024-10-20 17:05:36
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import SimpleSearch from "./core";

let simpleSearch: SimpleSearch;

export let name = "SimpleSearch";
export let enabled = false;

export const declareToggleEnabled = {
    title: '🔍 简单搜索',
    description: '通过简单的语法以方便搜索',
    defaultEnabled: false
};

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
