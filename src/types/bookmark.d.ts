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
    subtype?: BlockSubType;
    order?: number; //越大越靠前, 默认0
}

interface IBookmarkGroupMin {
    id: TBookmarkGroupId;
    name: string;
    hidden?: boolean;
    order?: number; //越大越靠前，默认0
}

interface IBookmarkGroup extends IBookmarkGroupMin{
    items: IBookmarkItem[];
}

type IBookmarkGroupV1 = IBookmarkGroup;

interface IBookmarkGroupV2 extends IBookmarkGroupMin{
    items: BlockId[];
}
