/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2026-01-08 20:48:36
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
    appendContentTool,
    createNewDocTool
} from './content-tools';

import { applyBlockDiffTool } from './diff-edit';

import { searchDocumentTool, querySQLTool, searchKeywordTool } from './search-tools';
import { siyuanSkillRules } from './skill-doc';
import { request } from '@frostime/siyuan-plugin-kits/api';
import { Tool } from '../types';

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
        executionPolicy: 'ask-always'
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
        createNewDocTool,
        applyBlockDiffTool,
        searchDocumentTool,
        querySQLTool,
        searchKeywordTool,
        // siyuanKernalAPI
    ],
    rulePrompt: `
## 思源笔记工具组 ##

### 数据结构

笔记本(Notebook) → 文档(Document, 最大7层) → 块(Block)

### 核心约束（必须遵守）

1. **ID 格式**：所有 ID 参数必须使用 \`\\d{14}-\\w{7}\` 格式（如 \`20241016135347-zlrn2cz\`），禁止使用名称或路径
2. **SQL LIMIT**：\`querySQL\` 必须指定 LIMIT（建议默认 32）
3. **编辑方式**：appendContent 和 createNewDoc 是安全的，优先使用；applyBlockDiff 有风险，使用前必须用 \`read-rule({"name": "Rule/siyuan-tools/block-edit-search-replace"})\` 阅读其约束
4. **引用链接**：回复中提及文档/块时使用 \`[文档名](siyuan://blocks/xxx)\` 链接；appendContent 成功后必须给出该链接

### 定位目标

- 用户提及文档但未给 ID：先 listActiveDocs 看当前打开的文档，否则用 searchDocument / searchKeyword
- 分析长文档结构：getBlockInfo(docId) 取 TOC，定位 blockId 后再 getBlockContent(blockId, showId=true)
- 分页阅读长文档/容器：用 getBlockContent 的 slice 参数，语法见 \`read-rule({"name": "Rule/siyuan-tools/slice-reading"})\`
- 需要了解更多领域约定时，用 \`read-rule\` 读取下方索引中的 Rule
`.trim(),
    declareSkillRules: siyuanSkillRules
};
