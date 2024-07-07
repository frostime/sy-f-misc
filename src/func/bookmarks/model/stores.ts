/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-07 14:44:03
 * @FilePath     : /src/func/bookmarks/model/stores.ts
 * @LastEditTime : 2024-07-07 17:06:43
 * @Description  : 
 */
import { createStore } from "solid-js/store";

import { createMemo } from "solid-js";

export const [itemInfo, setItemInfo] = createStore<{ [key: BlockId]: IBookmarkItemInfo }>({});

export const [groups, setGroups] = createStore<IBookmarkGroup[]>([]);
export const groupMap = createMemo<Map<TBookmarkGroupId, IBookmarkGroup & {index: number}>>(() => {
    return new Map(groups.map((group, index) => [group.id, {...group, index: index}]));
});

interface IConfig {
    hideClosed: boolean;
    hideDeleted: boolean;
    viewMode: 'bookmark' | 'card';
}

export const [configs, setConfigs] = createStore<IConfig>({
    hideClosed: true,
    hideDeleted: true,
    viewMode: 'bookmark'
});
