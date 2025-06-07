/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/content-tools.ts
 * @Description  : 思源内容操作相关工具
 */

import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { appendDailyNote, appendMarkdown, getBlockFullMarkdownContent } from './utils';

/**
 * 获取块完整Markdown内容工具
 */
export const getBlockMarkdownTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getBlockMarkdown',
            description: '获取块的完整Markdown内容',
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
                        description: '为了防止文档内容过大，限制最大字符数量；默认 7000, 如果设置为 < 0 则不限制'
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
        const limit = args.limit ?? 7000;
        const begin = args.begin ?? 0;
        try {
            let content = await getBlockFullMarkdownContent(args.blockId);
            if (limit > 0 && content.length > limit) {
                const len = content.length;
                content = content.substring(begin, begin + limit);
                content += `\n\n原始内容过长 (${len} 字符), 已省略; 只保留从 ${begin} 开始的 ${limit} 字符`;
            }
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
            description: '向文档添加Markdown内容',
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
            description: '添加日记',
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
