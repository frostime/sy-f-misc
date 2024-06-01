/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-20 18:54:29
 * @FilePath     : /src/func/bookmarks/types/bookmark.d.ts
 * @LastEditTime : 2024-06-01 14:56:39
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
    open?: boolean;
    hidden?: boolean;
    order?: number; //越大越靠前，默认0
    items: IItemOrder[];
}


//被 drag over 悬停的 item
interface IMoveItemDetail {
    srcItem: BlockId;
    afterItem: BlockId;
    srcGroup: TBookmarkGroupId;
    targetGroup: TBookmarkGroupId;
}
