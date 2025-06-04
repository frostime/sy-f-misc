/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/notebook-tools.ts
 * @Description  : 思源笔记本相关工具
 */

import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { listNotebook } from './utils';

/**
 * 笔记本列表工具
 */
export const listNotebookTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'listNotebook',
            description: '获取思源笔记中的笔记本列表',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (): Promise<ToolExecuteResult> => {
        try {
            const notebooks = listNotebook();
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(notebooks)
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取笔记本列表失败: ${error.message}`
            };
        }
    }
};
