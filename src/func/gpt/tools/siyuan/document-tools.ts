/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/document-tools.ts
 * @Description  : 思源文档相关工具
 */

import { getBlockByID, listDailynote } from "@frostime/siyuan-plugin-kits";
import { listDocsByPath } from "@/api";
import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { documentMapper, DocumentSummary, DocumentSummaryWithChildren, getDocument, listSubDocs, formatDocList, formatDocTree } from './utils';
import { formatArraysToToon } from "../utils";

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

    declaredReturnType: {
        type: '{ OpenedDocs: DocumentSummary[]; Editing: string[] }',
        note: 'Editing 是当前正在编辑的文档 ID 列表'
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
    },

    formatForLLM: (data: { OpenedDocs?: DocumentSummary[]; Editing?: string[] }): string => {
        const lines: string[] = [];

        if (data.OpenedDocs && data.OpenedDocs.length > 0) {
            lines.push(`---当前打开的文档 (共 ${data.OpenedDocs.length} 个)---`);
            for (const doc of data.OpenedDocs) {
                lines.push(`- [${doc.id}] ${doc.hpath}`);
            }
        } else {
            lines.push('---当前打开的文档---\n(无)');
        }

        lines.push('');
        if (data.Editing && data.Editing.length > 0) {
            lines.push(`---正在编辑的文档---\n${data.Editing.join(', ')}`);
        } else {
            lines.push('---正在编辑的文档---\n(无)');
        }

        return lines.join('\n');
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

    declaredReturnType: {
        type: 'DocumentSummary | { docs: DocumentSummary[]; notFoundIds?: string[] }',
        note: '单个 docId 返回 DocumentSummary，docIdList 返回对象格式'
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
    },

    formatForLLM: (data: DocumentSummary | { docs: DocumentSummary[]; notFoundIds?: string[] }): string => {
        // 单个文档
        if ('id' in data && 'hpath' in data) {
            // return `[${data.id}] ${data.hpath} (box: ${data.box})`;
            return formatArraysToToon([data], 'Docs');
        }
        // 多个文档
        const result = data as { docs: DocumentSummary[]; notFoundIds?: string[] };
        // const lines = result.docs.map(doc => `- [${doc.id}] ${doc.hpath}`);
        let output = `---文档列表 (共 ${result.docs.length} 个)---\n${formatArraysToToon(result.docs, 'Docs')}`;
        if (result.notFoundIds && result.notFoundIds.length > 0) {
            output += `\n\n[未找到] ${result.notFoundIds.join(', ')}`;
        }
        return output;
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

    declaredReturnType: {
        type: 'DocumentSummary'
    },

    execute: async (args: { docId: string }): Promise<ToolExecuteResult> => {
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
    },

    formatForLLM: (data: DocumentSummary): string => {
        return `[${data.id}] ${data.hpath} (box: ${data.box})`;
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

    declaredReturnType: {
        type: 'Array<DocumentSummary & { children?: ... }>',
        note: '嵌套结构，children 递归包含子文档'
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
    },

    formatForLLM: (data: DocumentSummaryWithChildren[]): string => {
        return formatDocTree(data);
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

    declaredReturnType: {
        type: 'DocumentSummary[]'
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
            const response = await listDocsByPath(doc.box, parentPath);
            if (!response || !response.files || response.files.length === 0) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到同级文档`
                };
            }

            // 直接从 listDocsByPath 构建文档列表，保留 subFileCount 信息
            const siblingDocs = response.files.map((file: any) => {
                // 构建 hpath：父级 hpath + 文档名
                const parentHpath = doc.hpath.split('/').slice(0, -1).join('/');
                return documentMapper({
                    id: file.id,
                    hpath: parentHpath + '/' + file.name,
                    path: file.path,
                    content: file.name1 || file.name,
                    box: doc.box
                }, file.subFileCount);
            });

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: siblingDocs
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `列出同级文档失败: ${error.message}`
            };
        }
    },

    formatForLLM: (data: DocumentSummary[]): string => {
        return formatDocList(data);
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

    declaredReturnType: {
        type: 'DocumentSummary[] | Array<DocumentSummary & { children }>',
        note: 'depth=1 返回平坦列表，depth>1 返回嵌套结构'
    },

    execute: async (args: { notebookId: string; depth?: number }): Promise<ToolExecuteResult> => {
        let topLevel = await listDocsByPath(args.notebookId, '');
        if (!topLevel || !topLevel.files || topLevel.files.length === 0) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `未找到笔记本下的文档: ${args.notebookId}`
            };
        }

        // 从 listDocsByPath 返回的数据直接构建文档列表，包含 subFileCount
        const topLevelDocs = topLevel.files.map((file: any) => documentMapper({
            id: file.id,
            hpath: '/' + file.name,  // 顶级文档的 hpath 就是 /文档名
            path: file.path,
            content: file.name1 || file.name,
            box: args.notebookId
        }, file.subFileCount));

        if (args.depth === undefined || args.depth === 1) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: topLevelDocs
            };
        }

        const subDepth = args.depth - 1;
        const subDocs = await Promise.all(
            topLevelDocs.map(async (doc) => {
                const children = doc.subFileCount > 0
                    ? await listSubDocs(doc.id, subDepth)
                    : [];
                return {
                    ...doc,
                    children: children.length > 0 ? children : undefined
                };
            })
        );

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: subDocs
        };
    },

    formatForLLM: (data: DocumentSummary[] | DocumentSummaryWithChildren[]): string => {
        if (!data || data.length === 0) {
            return '(空列表)';
        }
        // 检查是否有 children 字段来决定使用哪种格式
        const hasChildren = data.some((doc: any) => doc.children !== undefined);
        if (hasChildren) {
            return formatDocTree(data as DocumentSummaryWithChildren[]);
        }
        return formatDocList(data as DocumentSummary[]);
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

    declaredReturnType: {
        type: 'DocumentSummary[]'
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
    },

    formatForLLM: (data: DocumentSummary[]): string => {
        return formatDocList(data);
    }
};
