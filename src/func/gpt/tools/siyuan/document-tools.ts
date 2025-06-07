/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/document-tools.ts
 * @Description  : 思源文档相关工具
 */

import { getBlockByID, id2block, listDailynote } from "@frostime/siyuan-plugin-kits";
import { listDocsByPath } from "@/api";
import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { documentMapper, getDocument, listSubDocs } from './utils';

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
            data: {
                OpenedDocs: items,
                Editing: edit
            }
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
            description: '获取文档信息; docId/docIdList 只能提供一个',
            parameters: {
                type: 'object',
                properties: {
                    docId: {
                        type: 'string',
                        description: '文档ID'
                    },
                    docIdList: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: '文档ID列表，可同时获取多个文档信息'
                    }
                },
                required: []
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { docId?: string; docIdList?: string[] }): Promise<ToolExecuteResult> => {
        try {
            // 处理单个文档ID的情况
            if (args.docId && !args.docIdList) {
                const doc = await getDocument({ docId: args.docId });
                if (!doc) {
                    return {
                        status: ToolExecuteStatus.NOT_FOUND,
                        error: `未找到文档: ${args.docId}`
                    };
                }
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: doc
                };
            }

            // 处理多个文档ID的情况
            if (args.docIdList && args.docIdList.length > 0) {
                const docs = [];
                const notFoundIds = [];

                for (const docId of args.docIdList) {
                    const doc = await getDocument({ docId });
                    if (doc) {
                        docs.push(doc);
                    } else {
                        notFoundIds.push(docId);
                    }
                }

                if (docs.length === 0) {
                    return {
                        status: ToolExecuteStatus.NOT_FOUND,
                        error: `未找到任何文档: ${notFoundIds.join(', ')}`
                    };
                }

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        docs,
                        notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
                    }
                };
            }

            // 如果既没有提供 docId 也没有提供 docIdList
            return {
                status: ToolExecuteStatus.ERROR,
                error: '请提供 docId 或 docIdList 参数'
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
        debugger
        const doc = await getDocument({ docId: args.docId });
        if (!doc) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `未找到文档: ${args.docId}`
            };
        }

        const path = doc.path;
        const parts = path.split('/').filter(p => p !== '');
        if (parts.length <= 1) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `文档 ${args.docId} 没有父文档`
            };
        }
        // 获取倒数第二个
        const parentId = parts[parts.length - 2];
        const parentDoc = await getDocument({ docId: parentId });
        if (!parentDoc) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `未找到父文档: ${parentId}`
            };
        }
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: documentMapper(parentDoc)
        };
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
                data: result
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
            const docs = await listDocsByPath(doc.box, parentPath);
            if (!docs || docs.length === 0) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到同级文档`
                };
            }

            let blocks = await id2block(docs.files.map(doc => doc.id));
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: blocks.map(documentMapper)
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `列出同级文档失败: ${error.message}`
            };
        }
    }
};

export const listNotebookDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'listNotebookDocs',
            description: '列出笔记本下的文档, 若 depth 则列出子文档森林',
            parameters: {
                type: 'object',
                properties: {
                    notebookId: {
                        type: 'string',
                        description: '笔记本ID'
                    },
                    depth: {
                        type: 'number',
                        description: '递归深度，默认为1',
                        minimum: 1,
                    }
                },
                required: ['notebookId', 'depth']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { notebookId: string; depth?: number }): Promise<ToolExecuteResult> => {
        let topLevel = await listDocsByPath(args.notebookId, '');
        if (!topLevel || topLevel.length === 0) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `未找到笔记本下的文档: ${args.notebookId}`
            };
        }

        let topLevelDocs = await id2block(topLevel.files.map(doc => doc.id));
        if (args.depth === undefined || args.depth === 1) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: topLevelDocs.map(documentMapper)
            };
        }

        const subDepth = args.depth - 1;
        const subDocs = await Promise.all(
            topLevelDocs.map(async (doc) => {
                const subDocs = await listSubDocs(doc.id, subDepth);
                return {
                    ...doc,
                    children: subDocs
                };
            })
        );

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: subDocs
        };
    }
}

/**
 * 获取日记文档工具
 */
export const getDailyNoteDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getDailyNoteDocs',
            description: '获取日记文档, 可以指定某天/时间范围，可以指定笔记本',
            parameters: {
                type: 'object',
                properties: {
                    atDate: {
                        type: 'string',
                        description: '指定单个日期文档，格式为 yyyy-MM-dd；与beforeDate/afterDate互斥'
                    },
                    beforeDate: {
                        type: 'string',
                        description: '获取此日期（含）之前的日记，格式为yyyy-MM-dd；与atDate互斥，可与afterDate组合使用'
                    },
                    afterDate: {
                        type: 'string',
                        description: '获取此日期（含）之后的日记，格式为 yyyy-MM-dd；与atDate互斥，可与beforeDate组合使用'
                    },
                    notebookId: {
                        type: 'string',
                        description: '笔记本ID, 可选; 默认查询所有笔记本下的日记'
                    }
                },
                required: []
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { notebookId?: string; atDate?: string; beforeDate?: string; afterDate?: string }): Promise<ToolExecuteResult> => {
        // 检查参数互斥性
        if (args.atDate && (args.beforeDate || args.afterDate)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: 'atDate 参数与 beforeDate/afterDate 参数互斥，请只使用其中一种方式指定日期范围'
            };
        }

        let before: Date | undefined;
        let after: Date | undefined;

        // 处理单日查询
        if (args.atDate) {
            const date = new Date(args.atDate);
            date.setHours(0, 0, 0, 0);
            before = new Date(date);
            after = new Date(date);
        }
        // 处理日期范围查询
        else {
            if (args.beforeDate) {
                before = new Date(args.beforeDate);
                before.setHours(23, 59, 59, 999); // 设置为当天结束时间
            }

            if (args.afterDate) {
                after = new Date(args.afterDate);
                after.setHours(0, 0, 0, 0); // 设置为当天开始时间
            }

            // 如果没有指定任何日期，默认为当天
            if (!before && !after) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                before = new Date(today);
                after = new Date(today);
            }
        }

        const docs = await listDailynote({
            boxId: args.notebookId,
            before: before,
            after: after
        });
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: docs.map(documentMapper)
        };
    }
};
