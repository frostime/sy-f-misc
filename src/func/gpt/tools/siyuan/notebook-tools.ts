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
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    declaredReturnType: {
        type: '{ id: string; name: string; dailynotePathTemplate: string }[]'
    },

    execute: async (): Promise<ToolExecuteResult> => {
        try {
            const notebooks = listNotebook();
            const boxes = await Promise.all(notebooks.map(async (notebook) => {
                const conf = await getNotebookConf(notebook.id);
                return {
                    ...notebook,
                    dailynotePathTemplate: conf.conf.dailyNoteSavePath
                }
            }));
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: boxes
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取笔记本列表失败: ${error.message}`
            };
        }
    },

    formatForLLM: (data: { id: string; name: string; dailynotePathTemplate: string }[]): string => {
        if (!data || data.length === 0) {
            return '(无笔记本)';
        }
        const lines = data.map(nb => `- [${nb.id}] ${nb.name} (日记模板: ${nb.dailynotePathTemplate})`);
        return `---笔记本列表 (共 ${data.length} 个)---\n${lines.join('\n')}`;
    }
};

export const getNotebookTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getNotebook',
            description: '获取笔记本信息, id可以唯一确定笔记本, name可以不唯一',
            parameters: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: '笔记本ID'
                    },
                    name: {
                        type: 'string',
                        description: '笔记本名称'
                    }
                }
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    declaredReturnType: {
        type: '{ id: string; name: string; dailynotePathTemplate: string }'
    },

    execute: async (args: { id?: string; name?: string }): Promise<ToolExecuteResult> => {
        if (!args.id && !args.name) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '至少提供 id 或 name 参数'
            };
        }
        let notebook;
        if (args.id) {
            notebook = listNotebook().find(notebook => notebook.id === args.id);
        } else if (args.name) {
            notebook = listNotebook().find(notebook => notebook.name === args.name);
        }
        if (!notebook) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `未找到笔记本: ${args.id || args.name}`
            };
        }
        const conf = await getNotebookConf(notebook.id);
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: {
                ...notebook,
                dailynotePathTemplate: conf.conf.dailyNoteSavePath
            }
        };
    },

    formatForLLM: (data: { id: string; name: string; dailynotePathTemplate: string }): string => {
        return `[${data.id}] ${data.name} (日记模板: ${data.dailynotePathTemplate})`;
    }
};
