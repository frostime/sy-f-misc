/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2026-01-07 22:33:56
 * @Description  : 思源笔记工具导出文件
 */

import {
    inspectNotebooksTool,
    inspectDocTreeTool,
    listActiveDocsTool,
    getDailyNoteDocsTool,
} from './document-tools';
import {
    inspectBlockInfoTool,
    inspectBlockMarkdownTool,
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
        inspectBlockMarkdownTool,
        appendContentTool,
        searchDocumentTool,
        querySQLTool,
        searchKeywordTool,
        siyuanKernalAPI
    ],
    rulePrompt: `
## 思源笔记工具组 ##

### 基础知识

**数据结构**：笔记本(Notebook) → 文档(Document, 最大7层) → 块(Block)

**ID 规则**: 格式 \`/\\d{14,}-\\w{7}/\`，如 \`20241016135347-zlrn2cz\`（可推断创建时间）

**路径属性**:
- path: ID路径，如 \`/20241020-xxx/20240331-yyy.sy\`（可推断层级）
- hpath: 名称路径，如 \`/Inbox/我的文档\`（人类可读但可能重复）

**块内容语法**:
- 块链接: \`[文本](siyuan://blocks/<BlockId>)\`
- 块引用: \`((<BlockId> "锚文本"))\` (又称为 ref, 反向链接等)
- 嵌入块: \`{{SQL语句}}\` (动态执行 SQL 并嵌入结果，SQL 内换行用 \`_esc_newline_\` 转义)

### 核心约束（必须遵守）

1. **ID 格式**：所有 ID 参数必须使用 \`\\d{14}-\\w{7}\` 格式（如 \`20241016135347-zlrn2cz\`），禁止使用名称或路径
2. **SQL LIMIT**：\`querySQL\` 必须指定 LIMIT（建议默认 32）
3. **写入反馈**：\`appendContent\` 成功后，回复中必须包含文档链接 \`[文档名](siyuan://blocks/xxx)\`
4. **鼓励链接**: 当提及某个文档、块的时候，鼓励在回复中包含对应的 siyuan 链接

### 工具流经验

**场景：用户提及文档但未给ID**
<<<
步骤1: listActiveDocs()  → 检查是否为当前打开的文档
步骤2: 若不是 → searchDocument() 或 searchKeyword()
步骤3: 确认目标后 → inspectBlockInfo() 查看结构
>>>

**场景：需要分析长文档内部结构**
<<<
inspectBlockInfo(docId)  → 获取 TOC（文档大纲）
                         → 定位目标标题的 blockId
inspectBlockMarkdown(blockId, showId=true)  → 获取该部分内容并保持结构映射
>>>

**场景：复杂查询（需要编写 SQL）**
<<<
先查阅 Rule::siyuan-tools::sql-refs-table
再构造 SQL（必须包含 LIMIT）
>>>

**场景：涉及到添加日记文档**
<<<
和用户确认是哪个笔记本(notebook)的日记
利用inspectNotebooks定位确认目标笔记本，再操作日记
>>>

### 高级文档索引

复杂场景请通过 \`ReadVar\` 查阅
`.trim(),
    declareSkillRules: siyuanSkillRules
};
