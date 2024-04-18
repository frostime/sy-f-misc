/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/types/api.d.ts
 * @LastEditTime : 2024-04-18 18:57:04
 * @Description  : 
 */
interface IResGetNotebookConf {
    box: string;
    conf: NotebookConf;
    name: string;
}

interface IBlockDOM {
    id: BlockId;
    dom: string;
}

interface IBacklink2 {
    backlinks: {
        id: BlockId;
        count: number;
        box: NotebookId;
    }[];
    backmentions: {
        id: BlockId;
        count: number;
        box: NotebookId;
    }[];
}

interface IReslsNotebooks {
    notebooks: Notebook[];
}

interface IResUpload {
    errFiles: string[];
    succMap: { [key: string]: string };
}

interface IResdoOperations {
    doOperations: doOperation[];
    undoOperations: doOperation[] | null;
}

interface IResGetBlockKramdown {
    id: BlockId;
    kramdown: string;
}

interface IResGetChildBlock {
    id: BlockId;
    type: BlockType;
    subtype?: BlockSubType;
}

interface IResGetTemplates {
    content: string;
    path: string;
}

interface IResReadDir {
    isDir: boolean;
    isSymlink: boolean;
    name: string;
}

interface IResExportMdContent {
    hPath: string;
    content: string;
}

interface IResBootProgress {
    progress: number;
    details: string;
}

interface IResForwardProxy {
    body: string;
    contentType: string;
    elapsed: number;
    headers: { [key: string]: string };
    status: number;
    url: string;
}

interface IResExportResources {
    path: string;
}


interface IDocTreeNode {
    id: BlockId;
    children?: IDocTreeNode[];
}
interface IResListDocTree {
    tree: IDocTreeNode[];
}
