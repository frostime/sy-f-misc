/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2026-01-08 18:56:44
 * @Description  : 思源笔记工具导出文件
 */

import {
    listNotebooksTool,
    navigateDocTreeTool,
    listActiveDocsTool,
    getDailyNoteDocsTool,
} from './document-tools';
import {
    getBlockInfoTool,
    getBlockContentTool,
    appendContentTool
} from './content-tools';

import { applyBlockDiffTool } from './diff-edit';

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
        listNotebooksTool,
        navigateDocTreeTool,
        listActiveDocsTool,
        getDailyNoteDocsTool,
        getBlockInfoTool,
        getBlockContentTool,
        appendContentTool,
        applyBlockDiffTool,
        searchDocumentTool,
        querySQLTool,
        searchKeywordTool,
        siyuanKernalAPI
    ],
    rulePrompt: `
## 思源笔记工具组 ##

### 数据结构

笔记本(Notebook) → 文档(Document, 最大7层) → 块(Block)

### 核心约束（必须遵守）

1. **ID 格式**：所有 ID 参数必须使用 \`\\d{14}-\\w{7}\` 格式（如 \`20241016135347-zlrn2cz\`），禁止使用名称或路径
2. **SQL LIMIT**：\`querySQL\` 必须指定 LIMIT（建议默认 32）
3. **写入反馈**：\`appendContent\` 成功后，回复中必须包含文档链接 \`[文档名](siyuan://blocks/xxx)\`
4. **编辑文档**：推荐使用 \`applyBlockDiff\` 或者 \`appendContent\` 工具，避免直接操作 API
5. **鼓励链接**：回复中提及文档/块时，使用 siyuan:// 链接

### 工具流经验

**场景：用户提及文档但未给ID**
\`\`\`
步骤1: listActiveDocs() → 检查当前打开的文档
步骤2: 若不是 → searchDocument() 或 searchKeyword()
步骤3: 确认目标后 → getBlockInfo() 查看结构
\`\`\`

**场景：需要编辑/修改文档内容**
\`\`\`
步骤1: getBlockContent(docId, showId=true) → 获取带 ID 标记的内容
步骤2: 参考 block-diff-edit 规则构造 diff
步骤3: applyBlockDiff(diff) → 应用修改
\`\`\`

**场景：分析长文档内部结构**
\`\`\`
步骤1: getBlockInfo(docId) → 获取 TOC（文档大纲）
步骤2: 定位目标标题的 blockId
步骤3: getBlockContent(blockId, showId=true) → 获取该部分内容
\`\`\`

**场景：复杂查询（需要编写 SQL）**
\`\`\`
步骤1: ReadVar('siyuan-sql-overview') → 查阅 SQL 基础
步骤2: 根据需要查阅具体表结构（sql-blocks-table / sql-refs-table 等）
步骤3: 构造 SQL（必须包含 LIMIT）
\`\`\`

**场景：涉及到添加日记文档**
\`\`\`
步骤1: 和用户确认是哪个笔记本(notebook)的日记
步骤2: 利用 listNotebooks 定位确认目标笔记本
步骤3: appendContent(targetType='dailynote', target=notebookId)
\`\`\`

### 高级文档索引

复杂场景请通过 \`ReadVar\` 查阅
`.trim(),
    declareSkillRules: siyuanSkillRules
};
