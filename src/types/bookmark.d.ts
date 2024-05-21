/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-20 18:54:29
 * @FilePath     : /src/types/bookmark.d.ts
 * @LastEditTime : 2024-05-21 22:38:54
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

interface IBookmarkGroup {
    id: TBookmarkGroupId;
    name: string;
    items?: IBookmarkItem[];
    hidden?: boolean;
    order?: number; //越大越靠前，默认0
}
