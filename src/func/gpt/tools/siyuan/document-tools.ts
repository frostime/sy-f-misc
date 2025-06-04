/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/document-tools.ts
 * @Description  : 思源文档相关工具
 */

import { getBlockByID } from "@frostime/siyuan-plugin-kits";
import { listDocsByPath } from "@/api";
import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { documentMapper, getDocument, getDailyNoteDocs, listSubDocs } from './utils';

/**
 * 获取活动文档列表工具
 */
export const listActiveDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'listActiveDocs',
            description: '获取当前活动的文档列表(用户当前打开的、正在编辑的文档)',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (): Promise<ToolExecuteResult> => {
        let tabs = document.querySelectorAll(`div[data-type="wnd"] ul.layout-tab-bar>li.item:not(.item--readonly)`);
        if (!tabs || tabs.length === 0) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                data: '当前没有打开的文档'
            };
        }
        let items = [];
        let edit = [];

        for (const tab of tabs) {
            let dataId = tab.getAttribute("data-id");
            if (!dataId) {
                continue;
            }
            const activeTab = document.querySelector(`.layout-tab-container div.protyle[data-id="${dataId}"]`);
            if (!activeTab) continue;
            const eleTitle = activeTab.querySelector(".protyle-title");
            let docId = eleTitle?.getAttribute("data-node-id");
            if (docId) {
                const block = await getBlockByID(docId);
                items.push(documentMapper(block));
            }
            if (tab.classList.contains('item--focus')) {
                edit.push(docId);
            }
        }
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: JSON.stringify({
                OpenedDocs: items,
                Editing: edit
            })
        };
    }
};

/**
 * 获取文档信息工具
 */
export const getDocumentTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getDocument',
            description: '获取文档信息',
            parameters: {
                type: 'object',
                properties: {
                    docId: {
                        type: 'string',
                        description: '文档ID'
                    }
                },
                required: ['docId']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { docId: string }): Promise<ToolExecuteResult> => {
        try {
            const doc = await getDocument({ docId: args.docId });
            if (!doc) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到文档: ${args.docId}`
                };
            }
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(doc)
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取文档信息失败: ${error.message}`
            };
        }
    }
};

/**
 * 获取父文档工具
 */
export const getParentDocTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getParentDoc',
            description: '获取文档的父文档',
            parameters: {
                type: 'object',
                properties: {
                    docId: {
                        type: 'string',
                        description: '文档ID'
                    }
                },
                required: ['docId']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { docId: string }): Promise<ToolExecuteResult> => {
        try {
            const doc = await getDocument({ docId: args.docId });
            if (!doc) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到文档: ${args.docId}`
                };
            }

            const path = doc.path;
            const parts = path.split('/');
            if (parts.length <= 2) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `文档 ${args.docId} 没有父文档`
                };
            }

            const parentPath = parts.slice(0, -1).join('/');
            const docs = await listDocsByPath(doc.notebook.id, parentPath);
            if (!docs || docs.length === 0) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到父文档`
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(documentMapper(docs[0]))
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取父文档失败: ${error.message}`
            };
        }
    }
};

/**
 * 列出子文档工具
 */
export const listSubDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'listSubDocs',
            description: '列出文档的子文档',
            parameters: {
                type: 'object',
                properties: {
                    docId: {
                        type: 'string',
                        description: '文档ID'
                    },
                    depth: {
                        type: 'number',
                        description: '递归深度，默认为1'
                    }
                },
                required: ['docId']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { docId: string; depth?: number }): Promise<ToolExecuteResult> => {
        try {
            const result = await listSubDocs(args.docId, args.depth || 1);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(result)
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `列出子文档失败: ${error.message}`
            };
        }
    }
};

/**
 * 列出同级文档工具
 */
export const listSiblingDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'listSiblingDocs',
            description: '列出文档的同级文档',
            parameters: {
                type: 'object',
                properties: {
                    docId: {
                        type: 'string',
                        description: '文档ID'
                    }
                },
                required: ['docId']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { docId: BlockId }): Promise<ToolExecuteResult> => {
        try {
            const doc = await getDocument({ docId: args.docId });
            if (!doc) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到文档: ${args.docId}`
                };
            }

            const path = doc.path;
            const parts = path.split('/');
            if (parts.length <= 1) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `文档 ${args.docId} 没有同级文档`
                };
            }

            const parentPath = parts.slice(0, -1).join('/');
            const docs = await listDocsByPath(doc.notebook.id, parentPath);
            if (!docs || docs.length === 0) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到同级文档`
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(docs.map(documentMapper))
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `列出同级文档失败: ${error.message}`
            };
        }
    }
};

/**
 * 获取日记文档工具
 */
export const getDailyNoteDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getDailyNoteDocs',
            description: '获取日记文档',
            parameters: {
                type: 'object',
                properties: {
                    notebookId: {
                        type: 'string',
                        description: '笔记本ID'
                    },
                    date: {
                        type: 'string',
                        description: '日期，格式为YYYY-MM-DD'
                    }
                },
                required: []
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { notebookId?: string; date?: string }): Promise<ToolExecuteResult> => {
        try {
            const docs = await getDailyNoteDocs(args);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(docs)
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取日记文档失败: ${error.message}`
            };
        }
    }
};
