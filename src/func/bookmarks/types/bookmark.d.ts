/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-20 18:54:29
 * @FilePath     : /src/types/bookmark.d.ts
 * @LastEditTime : 2024-05-28 12:54:13
 * @Description  : 
 */
type TBookmarkGroupId = string;

interface IBookmarkItem {
    id: BlockId;
    title: string;
    type: BlockType;
    box: NotebookId;
    subtype?: BlockSubType | '';
    order?: number; //越大越靠前, 默认0
}


/**
 * Bookmark item 的 svelte 组件需要的信息
 */
interface IBookmarkItemInfo extends IBookmarkItem {
    icon: string;
    ref: number;
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
interface IBookmarkGroup extends IBookmarkGroupMin{
    items: IBookmarkItem[];
}

type IBookmarkGroupV1 = IBookmarkGroup;

/**
 * 2024-05-28
 * V2 版本，items 里面只存放 BlockId，具体内容运行时获取
 */
interface IBookmarkGroupV2 extends IBookmarkGroupMin{
    items: BlockId[];
}
