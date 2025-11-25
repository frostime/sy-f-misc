/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/content-tools.ts
 * @Description  : 思源内容操作相关工具
 */

import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { appendDailyNote, appendMarkdown, getBlockFullMarkdownContent } from './utils';
import { normalizeLimit, DEFAULT_LIMIT_CHAR } from '../utils';

/**
 * 获取块完整Markdown内容工具
 */
export const getBlockMarkdownTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getBlockMarkdown',
            description: '获取块的完整Markdown内容\n返回 `string`（Markdown 正文，附截断范围提示）',
            parameters: {
                type: 'object',
                properties: {
                    blockId: {
                        type: 'string',
                        description: '块ID'
                    },
                    begin: {
                        type: 'number',
                        description: '开始的字符位置，默认为 0'
                    },
                    limit: {
                        type: 'number',
                        description: `为了防止文档内容过大，限制最大字符数量；默认 ${DEFAULT_LIMIT_CHAR}, 如果设置为 < 0 则不限制`
                    }
                },
                required: ['blockId']
            }
        },
        // permissionLevel: ToolPermissionLevel.PUBLIC,
        requireExecutionApproval: false,
        requireResultApproval: true
    },

    execute: async (args: { blockId: string; begin?: number; limit?: number }): Promise<ToolExecuteResult> => {
        try {
            const content = await getBlockFullMarkdownContent(args.blockId);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: content
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取块内容失败: ${error.message}`
            };
        }
    },

    // 截断器：考虑 begin 和 limit 参数
    truncateForLLM: (formatted: string, args: Record<string, any>) => {
        const begin = args.begin ?? 0;
        const limit = normalizeLimit(args.limit);

        // 应用 begin 偏移
        let content = begin > 0 ? formatted.substring(begin) : formatted;

        // 应用 limit 截断
        if (limit > 0 && content.length > limit) {
            const originalLength = formatted.length;
            content = content.substring(0, limit);
            content += `\n\n[原始内容长度: ${originalLength} 字符, 显示范围: ${begin} - ${begin + limit}]`;
        }

        return content;
    }
};

/**
 * 添加Markdown内容工具
 */
export const appendMarkdownTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'appendMarkdown',
            description: '向文档添加Markdown内容\n返回 `string`（固定值 "添加成功" 或错误信息）',
            parameters: {
                type: 'object',
                properties: {
                    document: {
                        type: 'string',
                        description: '文档ID'
                    },
                    markdown: {
                        type: 'string',
                        description: 'Markdown内容'
                    }
                },
                required: ['document', 'markdown']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { document: string; markdown: string }): Promise<ToolExecuteResult> => {
        try {
            await appendMarkdown(args.document, args.markdown);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: '添加成功'
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `添加Markdown内容失败: ${error.message}`
            };
        }
    }
};

/**
 * 添加日记工具
 */
export const appendDailyNoteTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'appendDailyNote',
            description: '添加日记\n返回 `string`（写入的日记文档 docId）',
            parameters: {
                type: 'object',
                properties: {
                    notebookId: {
                        type: 'string',
                        description: '笔记本ID'
                    },
                    markdown: {
                        type: 'string',
                        description: 'Markdown内容'
                    }
                },
                required: ['notebookId', 'markdown']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { notebookId: string; markdown: string }): Promise<ToolExecuteResult> => {
        try {
            const docId = await appendDailyNote(args.notebookId, args.markdown);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: docId
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `添加日记失败: ${error.message}`
            };
        }
    }
};
