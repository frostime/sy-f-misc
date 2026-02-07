/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-08 17:58:38
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/index.ts
 * @LastEditTime : 2026-02-07 22:33:16
 * @Description  : applyBlockDiff Tool（SEARCH/REPLACE 模式）
 */

import type { BlockEdit, ValidationResult } from './types';
import {
    parseBlockDiff,
    formatEdit,
    formatValidationError
} from './parser';
import {
    validateAllHunks,
    executeEdits,
    createSiyuanAPI
} from './core';
import { Tool, ToolExecuteStatus, ToolPermissionLevel } from '@gpt/tools/types';
import { request } from '@/api';

// ============ 思源 API request 函数 ============

let _request: (url: string, data: any) => Promise<any> = request;

export const DIFF_SKILL_NAME = 'block-edit-search-replace';

// ============ Tool 定义 ============

export const applyBlockDiffTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'applyBlockDiff',
            description: `应用 Block Edit 到思源笔记文档（SEARCH/REPLACE 模式）。

使用 Git 冲突标记风格：

\`\`\`diff
@@<blockId>@@
<<<<<<< SEARCH
原始内容（必须完全匹配）
=======
新内容
>>>>>>> REPLACE
\`\`\`

**操作类型**

| SEARCH | REPLACE | 操作 |
|--------|---------|------|
| 非空 | 非空 | UPDATE（更新） |
| 非空 | 空 | DELETE（删除） |

**指令模式**（跳过内容校验）

| 语法 | 作用 |
|------|------|
| @@REPLACE:id@@ + 新内容 | 直接替换整个块（跳过校验） |
| @@DELETE:id@@ | 删除整个块（无需内容） |
| @@BEFORE:id@@ + 新内容 | 在块前插入 |
| @@AFTER:id@@ + 新内容 | 在块后插入 |
| @@PREPEND:id@@ + 新内容 | 在容器开头插入 |
| @@APPEND:id@@ + 新内容 | 在容器末尾追加 |

IMPORTANT: 必须先阅读 ${DIFF_SKILL_NAME} 规则才能使用此工具。`,
            parameters: {
                type: 'object',
                properties: {
                    diff: {
                        type: 'string',
                        description: '符合 SEARCH/REPLACE 格式的编辑内容'
                    },
                    dryRun: {
                        type: 'boolean',
                        description: '仅解析和校验，不执行（用于预览）。默认 false'
                    },
                    strictMatch: {
                        type: 'boolean',
                        description: '严格匹配模式（默认 true，SEARCH/REPLACE 总是严格匹配）'
                    }
                },
                required: ['diff']
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: {
        diff: string;
        dryRun?: boolean;
        strictMatch?: boolean;
    }) => {
        const { diff, dryRun = false, strictMatch = true } = args;

        // ========== 第一步：解析 diff ==========
        let parseResult: {
            hunks: any[];
            edits: BlockEdit[];
            warnings: string[];
        };

        try {
            parseResult = parseBlockDiff(diff);
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `❌ Diff 解析失败\n\n${error instanceof Error ? error.message : String(error)}\n\n` +
                    `格式要求：\n` +
                    `1. 块 ID 格式：yyyyMMddHHmmss-xxxxxxx\n` +
                    `2. hunk 头部：@@blockId@@ 或 @@COMMAND:blockId@@\n` +
                    `3. SEARCH/REPLACE 格式：\n` +
                    `   @@blockId@@\n` +
                    `   <<<<<<< SEARCH\n` +
                    `   原始内容\n` +
                    `   =======\n` +
                    `   新内容\n` +
                    `   >>>>>>> REPLACE\n\n` +
                    `建议仔细阅读 ${DIFF_SKILL_NAME} 规则了解详情。`
            };
        }

        const { hunks, edits, warnings } = parseResult;

        if (edits.length === 0) {
            // 可能所有 hunk 都被跳过了
            if (warnings.length > 0) {
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        message: `没有有效的编辑操作; 建议仔细阅读 ${DIFF_SKILL_NAME} 规则了解详情。`,
                        warnings
                    }
                };
            }
            return {
                status: ToolExecuteStatus.ERROR,
                error: '未解析到有效的编辑操作，请检查 diff 格式; 建议仔细阅读 ' + DIFF_SKILL_NAME + ' 规则了解详情。'
            };
        }

        // ========== 第二步：强制内容校验 ==========
        const api = createSiyuanAPI(_request);
        let validationResult: ValidationResult;

        try {
            validationResult = await validateAllHunks(hunks, edits, api, strictMatch);
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `❌ 校验过程出错\n\n${error instanceof Error ? error.message : String(error)}` +
                    `\n\n请确保使用 getBlockContent(showId=true) 获取最新内容` +
                    `，并仔细阅读 ${DIFF_SKILL_NAME} 规则了解详情。`
            };
        }

        // 如果有校验错误，拒绝整个操作
        if (!validationResult.valid) {
            const errorMessages = validationResult.errors
                .map(e => formatValidationError(e))
                .join('\n\n');

            return {
                status: ToolExecuteStatus.ERROR,
                error: `❌ 内容校验失败，拒绝执行编辑\n\n` +
                    `共 ${validationResult.errors.length} 个错误:\n\n${errorMessages}\n\n` +
                    `请确保：\n` +
                    `1. 使用 getBlockContent(showId=true) 获取最新内容\n` +
                    `2. SEARCH 块内容与实际块内容完全一致\n` +
                    `3. 块 ID 正确且块存在\n\n` +
                    `建议仔细阅读 ${DIFF_SKILL_NAME} 规则了解详情。`
            };
        }

        // 收集警告
        const allWarnings = [...warnings, ...validationResult.warnings];

        // ========== 第三步：干运行模式 ==========
        if (dryRun) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    message: `✅ 校验通过，以下 ${validationResult.edits.length} 个操作未执行（干运行模式）`,
                    operations: validationResult.edits.map(e => formatEdit(e)),
                    warnings: allWarnings.length > 0 ? allWarnings : undefined
                }
            };
        }

        // ========== 第四步：执行编辑 ==========
        const results = await executeEdits(validationResult.edits, api);

        // ========== 第五步：汇总结果 ==========
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        if (failCount === 0) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    message: `✅ 成功执行 ${successCount} 个操作`,
                    operations: results.map(r => ({
                        operation: formatEdit(r.edit),
                        success: r.success,
                        newBlockId: r.newBlockId
                    })),
                    warnings: allWarnings.length > 0 ? allWarnings : undefined
                }
            };
        } else if (successCount === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `❌ 全部 ${failCount} 个操作执行失败`,
                details: results.map(r => ({
                    operation: formatEdit(r.edit),
                    success: r.success,
                    error: r.error
                }))
            };
        } else {
            return {
                status: ToolExecuteStatus.ERROR,
                data: {
                    message: `⚠️ 部分成功: ${successCount} 成功, ${failCount} 失败`,
                    operations: results.map(r => ({
                        operation: formatEdit(r.edit),
                        success: r.success,
                        error: r.error,
                        newBlockId: r.newBlockId
                    })),
                    warnings: allWarnings.length > 0 ? allWarnings : undefined
                }
            };
        }
    }
};

// ============ 导出 ============

export { parseBlockDiff, formatEdit } from './parser';
export { executeEdits, createSiyuanAPI } from './core';
export { BLOCK_DIFF_EDIT_SKILL } from './diff-edit-skill';
export type { BlockEdit, EditResult, ValidationResult } from './types';
