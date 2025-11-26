/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2025-11-26
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
import { siyuanSkillDocTool } from './skill-doc';

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
        searchKeywordTool,
        siyuanSkillDocTool
    ],
    rulePrompt: `
## 思源笔记工具组 ##

思源笔记是块结构的笔记软件，数据组织层级：笔记本(Notebook/box) → 文档(Document, 最大嵌套7层) → 内容块(Block)

**ID 规则**: 格式 \`/\\d{14,}-\\w{7}/\`，如 \`20241016135347-zlrn2cz\`（可推断创建时间）
- 所有 docId/notebookId/blockId 参数必须使用 ID，不能用名称或路径 !IMPORTANT!

**路径属性**:
- path: ID路径，如 \`/20241020-xxx/20240331-yyy.sy\`（可推断层级）
- hpath: 名称路径，如 \`/Inbox/我的文档\`（人类可读但可能重复）

**块内容语法**:
- 块链接: \`[文本](siyuan://blocks/<BlockId>)\`
- 块引用: \`((<BlockId> "锚文本"))\` (又称为 ref, 反向链接等)
- 嵌入块: \`{{SQL语句}}\` (动态执行 SQL 并嵌入结果，SQL 内换行用 \`_esc_newline_\` 转义)

**工具分类概览**:
- 笔记本: listNotebook, getNotebook
- 文档导航: listActiveDocs, getDocument, getParentDoc, listSubDocs, listSiblingDocs, listNotebookDocs
- 日记: getDailyNoteDocs, appendDailyNote
- 内容读写: getBlockMarkdown, appendMarkdown
- 搜索查询: searchDocument, searchKeyword, querySQL

## 关键规则 ##

- 用户提及文档但无上下文时，先用 listActiveDocs 检查是否为当前打开的文档
- 写入文档时(appendMarkdown/appendDailyNote)，回答中必须附上 \`[文档名](siyuan://blocks/xxx)\` 链接 !IMPORTANT!
- 日记文档按笔记本独立管理，操作前需确认目标笔记本
- querySQL 必须指定 LIMIT（建议默认 32）!IMPORTANT!
- 基于块内容回答时，附上 siyuan 链接方便用户溯源
- 优先使用现成工具，仅在复杂查询时使用 querySQL

## SiYuanSkillDoc - 技能文档索引 ##

调用 **SiYuanSkillDoc** 获取详细文档。**使用 querySQL 前必须先查阅相关主题！**

| 主题 | 内容摘要 | 何时查询 |
|------|----------|----------|
| \`tool-selection\` | 工具选择决策指南 | 不确定用哪个工具时 |
| \`sql-overview\` | SQL 查询基础、核心表、参考链接 | 首次使用 querySQL |
| \`sql-blocks-table\` | blocks 表字段详解 (type/content/path等) | 查询块/文档数据 |
| \`sql-refs-table\` | refs 表、反链查询示例 | 查询块引用关系 |
| \`sql-attributes-table\` | attributes 表、自定义属性查询 | 按属性筛选块 |
| \`dailynote\` | 日记机制、路径模板、SQL 示例 | 操作日记文档 |
| \`block-markdown-syntax\` | 块链接/引用/嵌入块/标签语法 | 生成特殊 Markdown |
| \`id-and-path\` | ID 格式、path/hpath 规则详解 | 解析 ID 或路径 |

## 通用参数 ##

所有工具支持可选 \`limit\` 参数（数字）控制输出长度，默认约 8000 字符，-1 或 0 表示不限制。
`.trim()
};
