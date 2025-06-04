/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2025-06-04 11:45:16
 * @Description  : 思源笔记工具导出文件
 */

import { getNotebookTool, listNotebookTool } from './notebook-tools';
import {
    listActiveDocsTool,
    getDocumentTool,
    getParentDocTool,
    listSubDocsTool,
    listSiblingDocsTool,
    getDailyNoteDocsTool,
    listNotebookDocsTool
} from './document-tools';
import {
    getBlockMarkdownTool,
    appendMarkdownTool,
    appendDailyNoteTool
} from './content-tools';
import { searchDocumentTool, queryViewTools } from './search';

// 导出思源笔记工具列表
export const siyuanTool = {
    name: 'siyuan-tools',
    description: '思源笔记工具',
    tools: [
        listNotebookTool,
        getNotebookTool,
        listActiveDocsTool,
        getDocumentTool,
        getDailyNoteDocsTool,
        getParentDocTool,
        listSubDocsTool,
        listSiblingDocsTool,
        listNotebookDocsTool,
        getBlockMarkdownTool,
        appendMarkdownTool,
        appendDailyNoteTool,
        searchDocumentTool,
        ...queryViewTools
    ],
    rulePrompt: `
思源笔记(https://github.com/siyuan-note/siyuan)是一个块结构的笔记软件

### 笔记本与文档结构

- **笔记本(Notebook)**：顶层结构; 别名 box
- **文档(Document)**：嵌套结构(最大深度7)，每个文档包含多个内容块
- **内容块(Block)**: 以块对内容进行组织，如标题、列表、段落等为不同类型的块; 每个块的 root_id 指向容器文档id

- **日记(DailyNote)**：一种特殊的文档，每个笔记本下按日期模板创建

### ID 规则
每个块、文档、笔记本都有一个唯一的 ID
- 格式：/\\d{14,}-\\w{7}/ (创建时间-随机符号)，如 20241016135347-zlrn2cz (2024-10-16 13:53:47 创建)
- 所有"docId/notebookId"的参数都要用 ID 而非名称/路径 !IMPORTANT!

### 文档级别属性
- **id**: 唯一标识(块ID)
- **path**: ID路径，笔记本内唯一，如 /20241020123921-0bdt86h/20240331203024-9vpgge9.sy; "20241020123921-0bdt86h" 是 "20240331203024-9vpgge" 的父文档
- **hpath**: 名称路径，可能重复，如 /Inbox/独立测试文档; "Inbox" 是 "独立测试文档" 的父文档

### 文档/块内容

块/文档的内容用 Markdown 格式表示，兼容一些特殊语法

- 块链接: \`[内容](siyuan://blocks/<BlockId>)\`
- 块引用: \`((<BlockId> "锚文本"))\`; 引号可以是单引号或双引号

### 常用工具(不一定完整)

- 笔记本操作
  - listNotebook: 获取所有笔记本
  - getNotebook: 获取特定笔记本
- 文档结构
  - getParentDoc/listSiblingDocs/listSubDocs: 查询文档上下层级关系
  - listNotebookDocsTool: 获取笔记本下文档嵌套结构
  - listActiveDocs: 获取当前活动的文档列表(思源支持类似 vscode 支持多页签编辑文档)
  - searchDocument: 搜索文档(按名称/路径)
- 日记文档
  - getDailyNoteDocs: 获取日记文档
- 内容操作
  - getBlockMarkdown: 获取块内容(文档,普通块均可)
  - appendMarkdown: 在文档末尾添加内容
  - appendDailyNote: 在日记文档末尾添加内容

### 工具使用经验

- 如果用户没有任何上下文就提及了某个文档，并默认你应该知道，尝试 listActiveDocs 查看是否是当前活动文档
- 日记文档每个笔记本内各自独立; 所以涉及日记文档操作时，和用户确定使用哪个笔记本
- 学会通过 path/hpath 来推断文档的层级关系
- 学会通过 ID 来分析文档的时间戳
`
};
