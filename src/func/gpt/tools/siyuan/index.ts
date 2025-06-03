import { BlockTypeName, getBlockByID, getMarkdown, getNotebook, id2block, listDailynote, searchChildDocs, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { listDocsByPath } from "@/api";
import { appendBlock, request } from "@frostime/siyuan-plugin-kits/api";

/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-02 21:30:36
 * @FilePath     : /src/func/gpt/tools/siyuan/index.ts
 * @LastEditTime : 2025-06-03 15:09:51
 * @Description  : 
 */


const _documentMapper = (doc: Block | any) => {
    const notebook = getNotebook(doc.box);
    return {
        id: doc.id,
        hpath: doc.hpath,
        path: doc.path,
        name: doc.content,
        notebook: {
            id: notebook.id,
            name: notebook.name
        }
    }
}

const _blockMapper = (block: Block | any) => {
    return {
        id: block.id,
        type: BlockTypeName[block.type],
        content: block.content,
        document: block.root_id
    }
}

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

const getDailyNoteDocs = async (opts: {
    notebookId?: string;
    date?: string;  //YYYY-MM-DD
}) => {

    let date = new Date();
    if (opts.date) {
        date = new Date(opts.date);
        // 去掉时间
        date.setHours(0, 0, 0, 0);
    }
    const docs = await listDailynote({
        boxId: opts.notebookId,
        before: date,
        after: date
    });
    return docs.map(_documentMapper);
}

const getDocument = async (opts: {
    docId: string
}) => {
    const block = await getBlockByID(opts.docId);
    if (!block) {
        return null;
    }
    return _documentMapper(block);
}

const getBlockFullMarkdownContent = async (blockId: BlockId) => {
    return await getMarkdown(blockId);
}

const listSubDocs = (root: BlockId, depth = 1) => {
    const MAX_DEPTH = 7;
    const buildTree = async (docId, depth = 1) => {
        if (depth > MAX_DEPTH) return [];
        let children = await searchChildDocs(docId);
        //@ts-ignore
        children = children.map(_documentMapper);
        const result = [];

        for (const child of children) {
            result.push({
                ...child,
                children: await buildTree(child.id, depth + 1)
            });
        }

        return result;
    };
    if (root) {
        return buildTree(root, depth);
    }
}

const appendMarkdown = async (document: BlockId, markdown: string) => {
    await appendBlock('markdown', markdown, document);
}

const appendDailyNote = async (notebookId: BlockId, markdown: string) => {
    let url = '/api/filetree/createDailyNote';
    let app = thisPlugin().app;
    let ans = await request(url, { notebook: notebookId, app: app?.appId });
    let docId = ans.id;
    await appendMarkdown(docId, markdown);
    return docId;
}

/**
 * 笔记本列表工具
 */
const listNotebookTool: Tool = {
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


const listActiveDocsTool: Tool = {
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
                items.push(_documentMapper(block));
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
 * 日记文档工具
 */
const getDailyNoteDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getDailyNoteDocs',
            description: '获取指定日期的日记文档',
            parameters: {
                type: 'object',
                properties: {
                    notebookId: {
                        type: 'string',
                        description: '笔记本ID，可选; 如果不指定会获取所有笔记本的日记文档'
                    },
                    date: {
                        type: 'string',
                        description: '日期，格式为YYYY-MM-DD，可选，默认为当天'
                    }
                },
                required: []
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { notebookId?: string; date?: string }): Promise<ToolExecuteResult> => {
        try {
            const dailyNotes = await getDailyNoteDocs(args);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(dailyNotes)
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取日记文档失败: ${error.message}`
            };
        }
    }
};

const getParentDocTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getParentDoc',
            description: '获取指定文档的父文档',
            parameters: {
                type: 'object',
                properties: {
                    docId: {
                        type: 'string',
                        description: '文档块ID'
                    },

                },
                required: ['docId']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { docId: string }): Promise<ToolExecuteResult> => {
        const doc = await getBlockByID(args.docId);
        if (!doc) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文档 ${args.docId} 不存在`
            };
        }
        const path = doc.path;
        let pathArr = path.split("/").filter((item) => item != "");
        pathArr.pop();
        if (pathArr.length == 0) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `文档 ${args.docId} 没有父文档`
            }
        } else {
            let id = pathArr[pathArr.length - 1];
            const document = await getBlockByID(id);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(_documentMapper(document))
            }
        }
    }
};

/**
 * 列出子文档工具
 */
const listSubDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'listSubDocs',
            description: '获取指定文档的子文档列表，以树状结构返回',
            parameters: {
                type: 'object',
                properties: {
                    docId: {
                        type: 'string',
                        description: '根文档ID'
                    },
                    depth: {
                        type: 'integer',
                        description: '递归深度，默认为1，最大为7'
                    }
                },
                required: ['docId']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { docId: string; depth?: number }): Promise<ToolExecuteResult> => {
        try {
            const subDocs = await listSubDocs(args.docId, args.depth);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: JSON.stringify(subDocs)
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取子文档列表失败: ${error.message}`
            };
        }
    }
};

const listSiblingDocsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'listSiblingDocs',
            description: '获取指定文档的同级文档列表',
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
        const doc = await getBlockByID(args.docId);
        if (!doc) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文档 ${args.docId} 不存在`
            };
        }
        const path = doc.path.replace('.sy', '');
        const parts = path.split('/');

        if (parts.length > 0) {
            parts.pop();
        }

        let parentPath = parts.join('/');
        parentPath = parentPath || '/';
        let _docs = await listDocsByPath(doc.box, parentPath || '');
        const siblings = await id2block(_docs.files.map(doc => doc.id));
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: JSON.stringify(siblings)
        };
    }
};

/**
 * 获取块完整Markdown内容工具
 */
const getBlockMarkdownTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getBlockFullMD',
            description: '获取指定块的完整Markdown内容(包括文档的内容, 标题下方的内容)',
            parameters: {
                type: 'object',
                properties: {
                    blockId: {
                        type: 'string',
                        description: '块ID'
                    }
                },
                required: ['blockId']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { blockId: string }): Promise<ToolExecuteResult> => {
        try {
            const markdown = await getBlockFullMarkdownContent(args.blockId);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: markdown
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取块Markdown内容失败: ${error.message}`
            };
        }
    }
};


const appendMarkdownTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'appendMarkdown',
            description: '向指定文档追加Markdown内容',
            parameters: {
                type: 'object',
                properties: {
                    document: {
                        type: 'string',
                        description: '文档ID'
                    },
                    markdown: {
                        type: 'string',
                        description: '要追加的Markdown内容'
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
                data: 'Markdown内容已成功追加'
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `追加Markdown内容失败: ${error.message}`
            };
        }
    }
};

const appendDailyNoteTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'appendDailyNote',
            description: '向指定笔记本的DailyNote文档 (今天的日记) 追加Markdown内容',
            parameters: {
                type: 'object',
                properties: {
                    notebookId: {
                        type: 'string',
                        description: '笔记本ID'
                    },
                    markdown: {
                        type: 'string',
                        description: '要追加的Markdown内容'
                    }
                },
                required: ['notebookId', 'markdown']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { notebookId: string; markdown: string }): Promise<ToolExecuteResult> => {
        try {
            debugger
            const docId = await appendDailyNote(args.notebookId, args.markdown);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `Markdown内容已成功追加到日记文档 ${docId}`
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `追加Markdown内容失败: ${error.message}`
            };
        }
    }
};

// 导出思源笔记工具列表
export const siyuanTool = {
    name: 'siyuan-tools',
    tools: [
        listNotebookTool, listActiveDocsTool,
        getParentDocTool, listSubDocsTool, listSiblingDocsTool,
        getDailyNoteDocsTool,
        getBlockMarkdownTool,
        appendMarkdownTool, appendDailyNoteTool
    ],
    rulePrompt: `
思源笔记(https://github.com/siyuan-note/siyuan)是一个块结构的笔记软件

### 笔记本与文档

顶层为笔记本，每个笔记本下嵌套若干的文档块，每个文档块内部包含若干内容块
文档可以上下嵌套，最大深度不超过 7

可以使用 listNotebook 工具获取所有笔记本的定义
可以使用 getParentDoc/listSiblingDocs/listSubDocs 来获取嵌套的文档结构

注意: 参数 docID 为文档块的 ID，而非文档的名称或者路径!

DailyNote(日记) 是一种每个笔记本下会根据日期创建的特殊文档; 可以通过 getDailyNoteDocs 工具获取日记文档。
由于日记文档每个笔记本内各自独立，所以当涉及到需要读取、写入某个特定的日记文档的时候，请你：
1. 首先获取所有可以的 notebook
2. 向用户询问使用哪个笔记本
3. 然后再进行下一个操作

### 文档

- ID: 文档本质也是一个块，他的 ID 是唯一的
    - e.g. 20240331203024-9vpgge9
- path: 是文档 ID 路径, 在相同笔记本下总是唯一的
    - e.g. /20241020123921-0bdt86h/20240331203024-9vpgge9.sy
    - 最后的"20240331203024-9vpgge9"是文档的 ID; sy 是后缀名，可以无视
- hpath: 文档名称路径, path ， 在相同笔记本下可能重复 (例如存在两个都叫 A 的文档，但他们的 ID 不同)
    - e.g. /Inbox/独立测试文档
    - 最后的"独立测试文档"是文档的名称

思源笔记类似 vscode 支持多页签编辑文档，可以通过 listActiveDocs 工具获取当前活动的文档列表(页签中打开的)。
如果用户没有任何上下文就提及了某个文档，并默认你应该知道，请使用 listActiveDocs 查看是否是当前活动文档。

### 块/文档/笔记的 ID

每个块都有一个 ID，格式为 /^\d{14,}-\w{7}$/ (创建时间-随机符号), 例如 20241016135347-zlrn2cz 代表一个创建于 2024-10-16 13:53:47 的块

所有工具中涉及到 docId/notebookId 的都需要传入这种格式的 ID，而非文档名称。 !IMPORTANT!

### 内容

块的内容用 Markdown 格式表示.
可以通过 getBlockFullMD 获取块/文档的 Markdown 内容; 也可以通过 appendMarkdown 来增加文档内容 (对日记可使用 appendDailyNote)
`
};
