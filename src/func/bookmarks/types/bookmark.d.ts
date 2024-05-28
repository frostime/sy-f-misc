/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-20 18:54:29
 * @FilePath     : /src/func/bookmarks/types/bookmark.d.ts
 * @LastEditTime : 2024-05-28 21:22:04
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
interface IBookmarkItemInfo extends IBookmarkItem{
    icon: string;
    ref: number;
}


interface IBookmarkItemInGroup {
    id: BlockId;
    order: number;
}


interface IBookmarkGroupMin {
    id: TBookmarkGroupId;
    name: string;
    hidden?: boolean;
    order?: number; //越大越靠前，默认0
}

/**
 * 重构之前的版本，items 里面直接存放完整的 IBookmarkItem
 */
interface IBookmarkGroupV1 extends IBookmarkGroupMin{
    items: IBookmarkItem[];
}

/**
 * 2024-05-28
 * V2 版本，items 里面只存放 BlockId，具体内容运行时获取
 */
interface IBookmarkGroupV2 extends IBookmarkGroupMin{
    items: IBookmarkItemInGroup[];
}
