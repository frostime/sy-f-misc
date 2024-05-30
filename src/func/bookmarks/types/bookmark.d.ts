/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-20 18:54:29
 * @FilePath     : /src/func/bookmarks/types/bookmark.d.ts
 * @LastEditTime : 2024-05-30 20:21:22
 * @Description  : 
 */
type TBookmarkGroupId = string;

interface IBookmarkItem {
    id: BlockId;
    title: string;
    type: BlockType;
    box: NotebookId;
    subtype: BlockSubType | '';
}


/**
 * Bookmark item 的 svelte 组件需要的信息
 */
interface IBookmarkItemInfo extends IBookmarkItem {
    icon: string;
    ref: number;
    err?: 'BoxClosed' | 'BlockDeleted';
}

interface IItemOrder {
    id: BlockId;
    order: number;
};

interface IBookmarkGroup {
    id: TBookmarkGroupId;
    name: string;
    hidden?: boolean;
    order?: number; //越大越靠前，默认0
    items: IItemOrder[];
}
