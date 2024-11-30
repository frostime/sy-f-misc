/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/types/index.d.ts
 * @LastEditTime : 2024-11-30 19:35:22
 * @Description  : 
 */

interface IDockyBlock {
    name: string;
    position: 'RightTop' | 'RightBottom' | 'LeftTop' | 'LeftBottom';
    id: string;
    icon?: string;
    hotkey?: string;
}

type ThemeMode = "light" | "dark";
interface ITheme {
    name: string;
    modes: ThemeMode[];
    repoHash: string;
    repoURL: string;
}

type TKeyText = {
    key: string;
    text: string;
}

interface KV {
    key: string;
    value: any;
}

interface ChangeEvent {
    group: string;
    key: string;
    value: any;
}

type DocumentId = string;
type BlockId = string;
type NotebookId = string;
type PreviousID = BlockId;
type ParentID = BlockId | DocumentId;

type Notebook = {
    id: NotebookId;
    name: string;
    icon: string;
    sort: number;
    closed: boolean;
}

type NotebookConf = {
    name: string;
    closed: boolean;
    refCreateSavePath: string;
    createDocNameTemplate: string;
    dailyNoteSavePath: string;
    dailyNoteTemplatePath: string;
}

type BlockType = "c" | "d" | "s" | "h" | "t" | "i" | "p" | "f" | "audio" | "video" | "query_embed";

type BlockSubType = "d1" | "d2" | "s1" | "s2" | "s3" | "t1" | "t2" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "table" | "task" | "toggle" | "latex" | "quote" | "html" | "code" | "footnote" | "cite" | "collection" | "bookmark" | "attachment" | "comment" | "mindmap" | "spreadsheet" | "calendar" | "image" | "audio" | "video" | "other";

type Block = {
    id: BlockId;
    parent_id?: BlockId;
    root_id: DocumentId;
    hash: string;
    box: string;
    path: string;
    hpath: string;
    name: string;
    alias: string;
    memo: string;
    tag: string;
    content: string;
    fcontent?: string;
    markdown: string;
    length: number;
    type: BlockType;
    subtype: BlockSubType;
    /** string of { [key: string]: string } 
     * For instance: "{: custom-type=\"query-code\" id=\"20230613234017-zkw3pr0\" updated=\"20230613234509\"}" 
     */
    ial?: string;
    sort: number;
    created: string;
    updated: string;
}

type doOperation = {
    action: string;
    data: string;
    id: BlockId;
    parentID: BlockId | DocumentId;
    previousID: BlockId;
    retData: null;
}

declare interface Window {
    siyuan: {
        config: any;
        notebooks: any;
        menus: any;
        dialogs: any;
        blockPanels: any;
        storage: any;
        user: any;
        ws: any;
        languages: any;
        emojis: any;
    };
    Lute: any;
    fmisc: FMiscPlugin;
    mermaid: any;
}

interface IPluginProtyleSlash {
    filter: string[],
    html: string,
    id: string,
    callback(protyle: Protyle): void,
};

interface ISiyuanEventPaste {
    protyle: IProtyle,
    resolve: <T>(value: T | PromiseLike<T>) => void,
    textHTML: string,
    textPlain: string,
    siyuanHTML: string,
    files: FileList | DataTransferItemList;
}
