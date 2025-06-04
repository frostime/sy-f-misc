/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2025-06-03 22:56:18
 * @Description  : 思源笔记工具导出文件
 */

import { listNotebookTool } from './notebook-tools';
import {
    listActiveDocsTool,
    getDocumentTool,
    getParentDocTool,
    listSubDocsTool,
    listSiblingDocsTool,
    getDailyNoteDocsTool
} from './document-tools';
import {
    getBlockMarkdownTool,
    appendMarkdownTool,
    appendDailyNoteTool
} from './content-tools';

// 导出思源笔记工具列表
export const siyuanTool = {
    name: 'siyuan-tools',
    description: '思源笔记工具',
    tools: [
        listNotebookTool,
        listActiveDocsTool,
        getDocumentTool,
        getDailyNoteDocsTool,
        getParentDocTool,
        listSubDocsTool,
        listSiblingDocsTool,
        getBlockMarkdownTool,
        appendMarkdownTool,
        appendDailyNoteTool
    ],
    rulePrompt: `
思源笔记(https://github.com/siyuan-note/siyuan)是一个块结构的笔记软件

### 笔记本与文档

顶层为笔记本，每个笔记本下嵌套若干的文档块，每个文档块内部包含若干内容块
文档可以上下嵌套，最大深度不超过 7

可以使用 listNotebook 工具获取所有笔记本的定义
可以使用 getParentDoc/listSiblingDocs/listSubDocs 来获取嵌套的文档结构

注意: 参数 docID 为文档块的 ID，而非文档的名称或者路径!

DailyNote(日记) 是一种每个笔记本下会根据日期创建的特殊文档; 可以通过 getDailyNoteDocs 工具获取日记文档。
由于日记文档每个笔记本内各自独立，所以当涉及到需要读取、写入某个特定的日记文档的时候，请你：
1. 首先获取所有可以的 notebook
2. 向用户询问使用哪个笔记本
3. 然后再进行下一个操作

### 文档

- ID: 文档本质也是一个块，他的 ID 是唯一的
    - e.g. 20240331203024-9vpgge9
- path: 是文档 ID 路径, 在相同笔记本下总是唯一的
    - e.g. /20241020123921-0bdt86h/20240331203024-9vpgge9.sy
    - 最后的"20240331203024-9vpgge9"是文档的 ID; sy 是后缀名，可以无视
- hpath: 文档名称路径, path ， 在相同笔记本下可能重复 (例如存在两个都叫 A 的文档，但他们的 ID 不同)
    - e.g. /Inbox/独立测试文档
    - 最后的"独立测试文档"是文档的名称

思源笔记类似 vscode 支持多页签编辑文档，可以通过 listActiveDocs 工具获取当前活动的文档列表(页签中打开的)。
如果用户没有任何上下文就提及了某个文档，并默认你应该知道，请使用 listActiveDocs 查看是否是当前活动文档。

### 块/文档/笔记的 ID

每个块都有一个 ID，格式为 /^\d{14,}-\w{7}$/ (创建时间-随机符号), 例如 20241016135347-zlrn2cz 代表一个创建于 2024-10-16 13:53:47 的块

所有工具中涉及到 docId/notebookId 的都需要传入这种格式的 ID，而非文档名称。 !IMPORTANT!

### 内容

块/文档的内容用 Markdown 格式表示.

- 获取 Markdown： getBlockMarkdown
    - 可选参数 begin/limit 用于限制返回的字符范围, 一般情况不用指定，除非明确发现所需要内容在限制范围之外
- 增加: appendMarkdown 将内容添加到文档末尾
    - 对日记文档，可使用 appendDailyNote (不用指定文档 ID)

思源中的 Markdown 有一些特殊语法:
- 块链接: [内容](siyuan://block/<BlockId>)，例如 [块](siyuan://block/20241016135347-zlrn2cz)
- 块引用: ((<BlockId> "锚文本"))，例如 ((20241016135347-zlrn2cz "引用")); 这里的引号可以是单引号或双引号

`
};
