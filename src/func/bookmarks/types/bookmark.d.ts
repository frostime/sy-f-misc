/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-20 18:54:29
 * @FilePath     : /src/func/bookmarks/types/bookmark.d.ts
 * @LastEditTime : 2024-07-01 20:23:19
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

interface IItemCore {
    id: BlockId;
    // order: number;
    style?: string;
};

interface IBookmarkGroup {
    id: TBookmarkGroupId;
    name: string;
    expand?: boolean;
    hidden?: boolean;
    // order?: number;
    items: IItemCore[];
}


//被 drag over 悬停的 item
interface IMoveItemDetail {
    srcItem: BlockId;
    afterItem: BlockId;
    srcGroup: TBookmarkGroupId;
    targetGroup: TBookmarkGroupId;
}
