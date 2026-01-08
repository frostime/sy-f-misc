/**
 * applyBlockDiff Tool
 *
 * 应用 Block Diff 编辑到思源笔记
 */

import type {
    BlockEdit,
} from './types';
import { parseBlockDiff, formatEdit, validateOldContent } from './parser';
import { executeEdits, createSiyuanAPI } from './core';
import { Tool, ToolExecuteStatus, ToolPermissionLevel } from '@gpt/tools/types';
import { request } from '@/api';


// ============ 思源 API request 函数（需外部注入） ============

let _request: (url: string, data: any) => Promise<any> = request;

const SKILL_NAME = 'block-diff-edit';

// ============ Tool 定义 ============

export const applyBlockDiffTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'applyBlockDiff',
            description: `应用 Block Diff 编辑到思源笔记文档。

**Diff 格式**

使用基于 Block ID 锚定的 Unified Diff 格式：

\`\`\`diff
@@<blockId>@@
- 要删除/替换的原始内容
+ 要添加/替换的新内容
\`\`\`

**案例**

\`\`\`diff
@@20260108164554-m5ar6vb@@段落
- Hello World
+ 你好，世界

@@20260108164544-w8lz0zj@@标题
- ## Old Title
+ ## New Title

@@APPEND:20241020121005-3a8cynh@@
+ 这是追加到文档末尾的新内容
\`\`\`

IMPORTANT: 如果不清楚如何使用，请首先阅读 ${SKILL_NAME}.

\`\`\``,
            parameters: {
                type: 'object',
                properties: {
                    diff: {
                        type: 'string',
                        description: '符合 Block Diff 格式的编辑内容'
                    },
                    dryRun: {
                        type: 'boolean',
                        description: '仅解析不执行，用于预览操作（默认 false）'
                    },
                    validateOld: {
                        type: 'boolean',
                        description: '是否校验 oldContent 与实际内容匹配（默认 false）'
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
        validateOld?: boolean;
    }) => {
        const { diff, dryRun = false, validateOld = false } = args;

        // 1. 解析 diff
        let edits: BlockEdit[];
        try {
            edits = parseBlockDiff(diff);
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Diff 解析失败: ${error instanceof Error ? error.message : String(error)}`
            };
        }

        if (edits.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '未解析到有效的编辑操作，请检查 diff 格式'
            };
        }

        // 2. 干运行模式：仅返回解析结果
        if (dryRun) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    message: '干运行模式，以下操作未执行',
                    operations: edits.map(e => formatEdit(e)),
                    parsed: edits
                }
            };
        }

        // 3. 校验 oldContent（如果启用）
        if (validateOld) {
            const api = createSiyuanAPI(_request);
            for (const edit of edits) {
                if (edit.oldContent && (edit.type === 'UPDATE' || edit.type === 'DELETE')) {
                    const block = await api.getBlockByID(edit.blockId);
                    if (!block) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `块不存在: ${edit.blockId}`
                        };
                    }
                    if (!validateOldContent(block.markdown, edit.oldContent, false)) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `块内容不匹配: ${edit.blockId}\n期望: ${edit.oldContent}\n实际: ${block.markdown}`
                        };
                    }
                }
            }
        }

        // 4. 执行编辑
        if (!_request) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '思源 API 未初始化，请先调用 setRequestFunction'
            };
        }

        const api = createSiyuanAPI(_request);
        const results = await executeEdits(edits, api);

        // 5. 汇总结果
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        if (failCount === 0) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    message: `成功执行 ${successCount} 个操作`,
                    operations: results.map(r => ({
                        operation: formatEdit(r.edit),
                        success: r.success,
                        newBlockId: r.newBlockId
                    }))
                }
            };
        } else if (successCount === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `全部 ${failCount} 个操作失败`,
                details: results
            };
        } else {
            return {
                status: ToolExecuteStatus.ERROR,
                data: {
                    message: `部分成功: ${successCount} 成功, ${failCount} 失败`,
                    operations: results.map(r => ({
                        operation: formatEdit(r.edit),
                        success: r.success,
                        error: r.error,
                        newBlockId: r.newBlockId
                    }))
                }
            };
        }
    }
};
