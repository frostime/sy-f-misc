/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2025-06-07 18:37:00
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
import { searchDocumentTool, querySQLTool, searchKeywordTool } from './search-tools';

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
        querySQLTool,
        searchKeywordTool
    ],
    rulePrompt: `
思源笔记(https://github.com/siyuan-note/siyuan)是一个块结构的笔记软件

### 笔记本与文档结构

- **笔记本(Notebook)**：顶层结构; 别名 box
- **文档(Document)**：嵌套结构(最大深度7)，每个文档包含多个内容块
- **内容块(Block)**: 以块对内容进行组织，如标题、列表、段落等为不同类型的块; 每个块的 root_id 指向容器文档id

- **日记(DailyNote)**：一种特殊的文档，每个笔记本下按特定模板按照特定 hpath 模式创建
  - 使用 GO 模板语法设置 hpath 路径模板
  - 例如 "/daily note/{{now | date "2006/01"}}/{{now | date "2006-01-02"}}"; 可能会在 2025-12-15 这天渲染得到一篇 hpath 为 "/daily note/2025/12/2025-12-15" 的文档
  - 日记文档有特殊属性："custom-dailynote-<yyyyMMdd>=<yyyyMMdd>"
  - 例如 custom-dailynote-20240101=20240101 的文档，被视为 2024-01-01 这天的 daily note 文档

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
  - 反链: 如果 A 引用了 B; 那么对 B 而言 A 是他的反链(ref/backlink)
- 嵌入块/查询块: {{<SQL>}}; 思源支持SQL动态查询，SQL 语句需要用 _esc_newline_ 转义换行, 例如:
    {{select * from blocks where type='d' _esc_newline_ order by updated desc;}}
- 标签: \`#标签名#\`

### SQL 相关简单说明
querySQL 工具提供了 SQL 查询功能，是思源笔记的核心高级功能

- 完整SQL表结构文档: https://docs.siyuan-note.club/zh-Hans/reference/database/table.html
- SQL 查询 CheatSheet: https://ld246.com/article/1739546865001

常用表为 blocks 表, refs 表, attributes 表

**blocks 表核心部分说明**
- id: 块id
- type: d: 文档, h: 标题, m: 数学公式, c: 代码块, t: 表格块, l: 列表块, b: 引述块, s: 超级块，p：段落块，av：属性视图（俗称数据库，注意区分，这只是一个内容块的叫法）
- subtype: 特定类型的内容块还存在子类型, 标题块的 h1 到 h6; 列表块的 u (无序), t (任务), o (有序)
- markdown/content: 原始 markdown 内容和无格式内容
  - 对文档块而言, content 为文档标题
  - 对其他内容块而言, 为块的内容
- created/updated
- box: 所在笔记本
- root_id/path/hpath: 所在文档

例: \`select * from blocks where type='d'\`

**refs 表核心部分说明**(记录块引用/反链)
- block_id: 引用所在内容块 ID
- def_block_id: 被引用块的块 ID

例: 查询反链
\`\`\`
select * from blocks where id in (
select block_id from refs where def_block_id = '<被引用的块ID>'
) limit 999
\`\`\`

**attributes 表核心部分说明**(记录块属性)
- block_id: 属性所在内容块 ID
- name: 属性键
  - 思源中的用户自定义属性必须加上 "custom-" 前缀
- value: 属性值

例: 查询指定范围内日记
\`\`\`
select distinct B.* from blocks as B join attributes as A
on B.id = A.block_id
where A.name like 'custom-dailynote-%' and B.type='d'
and A.value >= '20231010' and A.value <= '20231013'
order by A.value desc;
\`\`\`

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
- 查询
  - searchKeyword: 思源中根据关键词搜索笔记内
  - querySQL: 在思源中执行 SQL 查询 (高级的操作, 可自定义大部分查询需求)
    - 请优先考虑现成的工具，若现有工具不足以完成任务再考虑使用 SQL 查询

### 经验

- 如果用户没有任何上下文就提及了某个文档，并默认你应该知道，尝试 listActiveDocs 查看是否是当前活动文档
- 日记文档每个笔记本内各自独立; 所以涉及日记文档操作时，和用户确定使用哪个笔记本
- 学会通过 path/hpath 来推断文档的层级关系
- 学会通过 ID 来分析文档的时间戳
- 当涉及到写入文档内容(appendMarkdown, appendDailyNote)的时候，请在你的回答中用[文档](链接)的形式提及写入的文档目标 !IMPORTANT!
- 查询日记文档时候，如果是当天或者指定单个日期的 dailynote，可以使用 getDailyNoteDocs; 如果是大批量多个日记文档，可以: A) 获取 notebook 的 dailynotePathTemplate 属性分析日记文档的路径模板，然后用 searchDocument/listSubDocs 等工具来组合分析日记文档所在位置; 或者 B) 使用 SQL 配合 "custom-dailynote-<yyyyMMdd>=<yyyyMMdd>" 属性查询 
- 使用 querySQL 工具的时候, 一定要明确指出 limit 限制, 以避免返回大量数据,建议默认32 !IMPORTANT!
- 不错的社区网站:
  - 思源论文精选: https://ld246.com/tag/siyuan/perfect
  - 思源主题博客: https://siyuannote.com/

`
};
