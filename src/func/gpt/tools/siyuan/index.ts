/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2026-01-07 19:21:01
 * @Description  : 思源笔记工具导出文件
 */

import { inspectNotebooksTool } from './notebook-tools';
import {
    listActiveDocsTool,
    inspectDocTreeTool,
    getDailyNoteDocsTool,
} from './document-tools';
import {
    inspectBlockInfoTool,
    getBlockMarkdownTool,
    appendContentTool
} from './content-tools';
import { searchDocumentTool, querySQLTool, searchKeywordTool } from './search-tools';
import { siyuanSkillRules } from './skill-doc';
import { request } from '@frostime/siyuan-plugin-kits/api';
import { Tool, ToolPermissionLevel } from '../types';

export const siyuanKernalAPI: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'siyuanKernalAPI',
            description: '思源笔记内核API调用接口',
            parameters: {
                type: 'object',
                properties: {
                    endpoint: {
                        type: 'string',
                        description: 'API端点，例如 /api/attr/getBlockAttrs'
                    },
                    payload: {
                        type: 'object',
                        description: '请求负载，依据具体API而定'
                    }
                },
                required: ['endpoint']
            }
        }
    },
    permission: {
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { endpoint: string; payload?: any }): Promise<any> => {
        const response = await request(args.endpoint, args.payload, 'response');
        return { ok: response.code === 0, code: response.code, data: response.data };
    }
}

// 导出思源笔记工具列表
export const siyuanTool = {
    name: 'siyuan-tools',
    description: '思源笔记工具',
    tools: [
        inspectNotebooksTool,
        inspectDocTreeTool,
        listActiveDocsTool,
        getDailyNoteDocsTool,
        inspectBlockInfoTool,
        getBlockMarkdownTool,
        appendContentTool,
        searchDocumentTool,
        querySQLTool,
        searchKeywordTool,
        siyuanKernalAPI
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
- 笔记本: inspectNotebooksTool
- 文档系统导航: listActiveDocs, inspectDocTree
- 分析块、文档的属性结构等: inspectBlockTool (特别适合分析长文档内部块结构)
- 日记: getDailyNoteDocs, appendContentTool(dailynote)
- 内容读写: getBlockMarkdown, appendContentTool(block/document)
- 搜索查询: searchDocument, searchKeyword, querySQL

## 关键规则 ##

- 用户提及文档但无上下文时，先用 listActiveDocs 检查是否为当前打开的文档
- 写入文档时(appendContentTool)，回答中必须附上 \`[文档名](siyuan://blocks/xxx)\` 链接 !IMPORTANT!
- 日记文档按笔记本独立管理，操作前需确认目标笔记本
- querySQL 必须指定 LIMIT（建议默认 32）!IMPORTANT!
- 基于块内容回答时，附上 siyuan 链接方便用户溯源
- 优先使用现成工具，仅在复杂查询时使用 querySQL
- 谨慎访问 siyuanKernalAPI

## 高级文档 ##
- 需要工具选择/SQL 说明时，查阅高级文档主题（tool-selection, sql-overview 等）；使用 querySQL 前先读相关 SQL 主题。
- Markdown 语法、日记、ID 规则等专题也可在高级文档中查看。

## 通用参数 ##

所有工具支持可选 \`limit\` 参数（数字）控制输出长度，默认约 8000 字符，-1 或 0 表示不限制。
`.trim(),
    declareSkillRules: siyuanSkillRules
};
