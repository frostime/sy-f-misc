import { createStore } from "solid-js/store";

import { createMemo } from "solid-js";

export const [itemInfo, setItemInfo] = createStore<{ [key: BlockId]: IBookmarkItemInfo }>({});

export const [groups, setGroups] = createStore<IBookmarkGroup[]>([]);
export const groupMap = createMemo<Map<TBookmarkGroupId, IBookmarkGroup & {index: number}>>(() => {
    return new Map(groups.map((group, index) => [group.id, {...group, index: index}]));
});


export const [configs, setConfigs] = createStore({
    hideClosed: true,
    hideDeleted: true
});
