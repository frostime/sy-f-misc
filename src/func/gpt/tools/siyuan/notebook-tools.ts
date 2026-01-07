/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/notebook-tools.ts
 * @Description  : 思源笔记本相关工具
 */

import { getNotebookConf } from '@frostime/siyuan-plugin-kits/api';
import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';


const listNotebook = () => {
    return window.siyuan.notebooks
        .filter((notebook) => notebook.closed !== true)
        .map((notebook) => {
            return {
                name: notebook.name,
                id: notebook.id
            }
        });
}

/**
 * 笔记本检查工具（合并 list 和 get）
 */
export const inspectNotebooksTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'inspectNotebooks',
            description: '查看笔记本信息。不提供参数时列出所有笔记本；提供 id 或 name 时返回匹配的笔记本',
            parameters: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: '笔记本 ID（唯一标识）'
                    },
                    name: {
                        type: 'string',
                        description: '笔记本名称（可能不唯一，返回所有匹配项）'
                    }
                },
                required: []
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    declaredReturnType: {
        type: '{ id: string; name: string; dailynotePathTemplate: string }[]',
        note: 'id 查询返回 0-1 个结果，name 查询可能返回多个结果'
    },

    execute: async (args: { id?: string; name?: string }): Promise<ToolExecuteResult> => {
        try {
            let notebooks = listNotebook();

            // 过滤笔记本
            if (args.id) {
                notebooks = notebooks.filter(nb => nb.id === args.id);
            } else if (args.name) {
                notebooks = notebooks.filter(nb => nb.name === args.name);
            }
            // 如果没有参数，返回所有笔记本

            // 获取配置信息
            const boxes = await Promise.all(notebooks.map(async (notebook) => {
                const conf = await getNotebookConf(notebook.id);
                return {
                    ...notebook,
                    dailynotePathTemplate: conf.conf.dailyNoteSavePath
                };
            }));

            // 如果查询了 id 或 name 但没有结果
            if ((args.id || args.name) && boxes.length === 0) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到笔记本: ${args.id || args.name}`
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: boxes
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `查询笔记本失败: ${error.message}`
            };
        }
    },

    formatForLLM: (data: { id: string; name: string; dailynotePathTemplate: string }[]): string => {
        if (!data || data.length === 0) {
            return '(无笔记本)';
        }
        const lines = data.map(nb => `- [${nb.id}] ${nb.name} (日记: ${nb.dailynotePathTemplate})`);
        return `---笔记本 (共 ${data.length} 个)---\n${lines.join('\n')}`;
    }
};
