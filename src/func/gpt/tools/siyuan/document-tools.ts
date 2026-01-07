/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/document-tools.ts
 * @Description  : 思源文档相关工具
 */



import { getBlockByID, listDailynote } from "@frostime/siyuan-plugin-kits";
import { lsNotebooks } from "@frostime/siyuan-plugin-kits/api";
import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { documentMapper, DocumentSummary, formatDocList } from './utils';
import { siyuanVfs } from '@/libs/vfs/vfs-siyuan-adapter';

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
        }
    },

    permission: {
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
        }
    },

    permission: {
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

// ================================================================
// List
// ================================================================

// ============ 辅助函数 ============

/**
 * 从 .sy 文件名提取文档 ID
 */
function extractDocId(filename: string): string {
    return filename.replace('.sy', '');
}

/**
 * 列出目录下的 .sy 文件名
 */
async function listSyFiles(dirPath: string): Promise<string[]> {
    const result = await siyuanVfs.readdir(dirPath);
    if (!result.ok || !result.items) return [];
    return result.items
        .filter(item => !item.isDir && item.name.endsWith('.sy'))
        .map(item => item.name);
}

/**
 * 获取文档的子文档目录路径
 * @param box 笔记本 ID
 * @param docPath 文档的 path 属性（如 /xxx/yyy.sy）
 */
function getChildDirPath(box: string, docPath: string): string {
    // docPath: /20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
    // 子文档目录: /data/{box}/20260107143325-zbrtqup/20260107143334-l5eqs5i/
    const dirPath = docPath.replace('.sy', '');
    return `/data/${box}${dirPath}`;
}

/**
 * 文档节点（用于树结构）
 */
interface DocNode {
    doc: DocumentSummary;
    children: DocNode[];
}

/**
 * 获取文档摘要（包括 subFileCount）
 */
async function fetchDocSummary(docId: string, box?: string): Promise<DocumentSummary | null> {
    const block = await getBlockByID(docId);
    if (!block) return null;

    const actualBox = box || block.box;
    const childDirPath = getChildDirPath(actualBox, block.path);
    const syFiles = await listSyFiles(childDirPath);

    return {
        id: block.id,
        hpath: block.hpath,
        path: block.path,
        content: block.content,
        box: block.box,
        subFileCount: syFiles.length
    };
}

/**
 * 递归构建文档树
 * @param docId 文档 ID
 * @param box 笔记本 ID
 * @param remainingDepth 剩余展开层数（0 表示不再展开子节点）
 */
async function buildDocTree(
    docId: string,
    box: string,
    remainingDepth: number
): Promise<DocNode | null> {
    const block = await getBlockByID(docId);
    if (!block) return null;

    const childDirPath = getChildDirPath(box, block.path);
    const syFiles = await listSyFiles(childDirPath);

    const doc: DocumentSummary = {
        id: block.id,
        hpath: block.hpath,
        path: block.path,
        content: block.content,
        box: block.box,
        subFileCount: syFiles.length
    };

    // 没有更多深度可展开，或者没有子文档
    if (remainingDepth <= 0 || syFiles.length === 0) {
        return { doc, children: [] };
    }

    // 递归构建子节点
    const children: DocNode[] = [];
    for (const syFile of syFiles) {
        const childId = extractDocId(syFile);
        const childNode = await buildDocTree(childId, box, remainingDepth - 1);
        if (childNode) {
            children.push(childNode);
        }
    }

    return { doc, children };
}

/**
 * 将 DocNode 树格式化为字符串
 */
function formatDocNodeTree(roots: DocNode[], indent: string = ''): string {
    const lines: string[] = [];
    for (let i = 0; i < roots.length; i++) {
        const node = roots[i];
        const isLast = i === roots.length - 1;
        const prefix = indent + (isLast ? '└─ ' : '├─ ');

        const hasUnexpanded = node.children.length === 0 && node.doc.subFileCount > 0;
        const suffix = hasUnexpanded ? ` (+${node.doc.subFileCount})` : '';
        lines.push(`${prefix}[${node.doc.id}] ${node.doc.hpath}${suffix}`);

        if (node.children.length > 0) {
            const childIndent = indent + (isLast ? '   ' : '│  ');
            lines.push(formatDocNodeTree(node.children, childIndent));
        }
    }
    return lines.join('\n');
}

/**
 * 统计树中节点总数
 */
function countNodes(roots: DocNode[]): number {
    let count = 0;
    for (const node of roots) {
        count += 1 + countNodes(node.children);
    }
    return count;
}

// ============ inspectDocTreeTool ============

export const inspectDocTreeTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'inspectDocTree',
            description: '文档树层级导航工具，支持向上、平级、向下遍历',
            parameters: {
                type: 'object',
                properties: {
                    entry: {
                        type: 'string',
                        description: `导航起点：
- notebook/box id = 笔记本（仅支持 children）
- document id = 文档
示例："20220112192155-gzmnt6y"`
                    },
                    direction: {
                        type: 'string',
                        enum: ['parent', 'siblings', 'children'],
                        description: `导航方向：
- parent: 获取父文档（entry 须为 document id）
- siblings: 获取同级文档（entry 须为 document id）
- children: 获取子文档/下级文档`
                    },
                    depth: {
                        type: 'number',
                        description: '展开层数（仅 children 有效）。depth=1 返回下一层文档列表；depth>1 返回树结构。默认 1，最大 7',
                        minimum: 1,
                        maximum: 7
                    }
                },
                required: ['entry', 'direction']
            }
        }
    },

    declaredReturnType: {
        type: 'DocumentSummary[] | DocNode[]',
        note: 'depth=1 返回列表，depth>1 返回树'
    },

    permission: {
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: {
        entry: string;
        direction: 'parent' | 'siblings' | 'children';
        depth?: number;
    }): Promise<ToolExecuteResult> => {
        const { entry, direction, depth = 1 } = args;
        const clampedDepth = Math.min(Math.max(depth, 1), 7);

        if (!entry) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '必须提供 entry 参数'
            };
        }

        try {
            // ===== 判断 entry 类型 =====
            const notebooksResp = await lsNotebooks();
            const isNotebook = notebooksResp.notebooks.some(nb => nb.id === entry);

            // ===== Notebook 分支 =====
            if (isNotebook) {
                if (direction !== 'children') {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: 'entry 是笔记本 ID，只支持 direction="children"'
                    };
                }

                const notebookDirPath = `/data/${entry}`;
                const syFiles = await listSyFiles(notebookDirPath);

                if (syFiles.length === 0) {
                    return { status: ToolExecuteStatus.SUCCESS, data: [] };
                }

                if (clampedDepth === 1) {
                    // 只返回顶层文档列表
                    const docs: DocumentSummary[] = [];
                    for (const syFile of syFiles) {
                        const docId = extractDocId(syFile);
                        const docSummary = await fetchDocSummary(docId, entry);
                        if (docSummary) docs.push(docSummary);
                    }
                    return { status: ToolExecuteStatus.SUCCESS, data: docs };
                }

                // depth > 1：构建树
                const roots: DocNode[] = [];
                for (const syFile of syFiles) {
                    const docId = extractDocId(syFile);
                    // remainingDepth = depth - 1，因为顶层本身算第一层
                    const node = await buildDocTree(docId, entry, clampedDepth - 1);
                    if (node) roots.push(node);
                }
                return { status: ToolExecuteStatus.SUCCESS, data: roots };
            }

            // ===== Document 分支 =====
            const block = await getBlockByID(entry);
            if (!block) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到文档: ${entry}`
                };
            }

            // ----- parent -----
            if (direction === 'parent') {
                // path: /20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
                const pathParts = block.path.split('/').filter(p => p);
                // pathParts: ['20260107143325-zbrtqup', '20260107143334-l5eqs5i.sy']

                if (pathParts.length <= 1) {
                    return {
                        status: ToolExecuteStatus.NOT_FOUND,
                        error: '该文档没有父文档（已是笔记本顶层文档）'
                    };
                }

                // 倒数第二个元素（可能带 .sy 也可能不带）
                const parentPart = pathParts[pathParts.length - 2];
                const parentId = parentPart.replace('.sy', '');

                const parentDoc = await fetchDocSummary(parentId, block.box);
                if (!parentDoc) {
                    return {
                        status: ToolExecuteStatus.NOT_FOUND,
                        error: `未找到父文档: ${parentId}`
                    };
                }
                return { status: ToolExecuteStatus.SUCCESS, data: parentDoc };
            }

            // ----- siblings -----
            if (direction === 'siblings') {
                const pathParts = block.path.split('/').filter(p => p);

                let siblingDirPath: string;
                if (pathParts.length <= 1) {
                    // 顶层文档，兄弟目录就是笔记本根目录
                    siblingDirPath = `/data/${block.box}`;
                } else {
                    // 非顶层文档，兄弟目录是父文档的子文档目录
                    // path: /aaa/bbb/ccc.sy → 兄弟目录: /data/{box}/aaa/bbb/
                    const parentPath = pathParts.slice(0, -1).join('/');
                    siblingDirPath = `/data/${block.box}/${parentPath}`;
                }

                const syFiles = await listSyFiles(siblingDirPath);
                const siblings: DocumentSummary[] = [];
                for (const syFile of syFiles) {
                    const siblingId = extractDocId(syFile);
                    const siblingDoc = await fetchDocSummary(siblingId, block.box);
                    if (siblingDoc) siblings.push(siblingDoc);
                }
                return { status: ToolExecuteStatus.SUCCESS, data: siblings };
            }

            // ----- children -----
            if (direction === 'children') {
                const childDirPath = getChildDirPath(block.box, block.path);
                const syFiles = await listSyFiles(childDirPath);

                if (syFiles.length === 0) {
                    return { status: ToolExecuteStatus.SUCCESS, data: [] };
                }

                if (clampedDepth === 1) {
                    // 只返回直接子文档列表
                    const children: DocumentSummary[] = [];
                    for (const syFile of syFiles) {
                        const childId = extractDocId(syFile);
                        const childDoc = await fetchDocSummary(childId, block.box);
                        if (childDoc) children.push(childDoc);
                    }
                    return { status: ToolExecuteStatus.SUCCESS, data: children };
                }

                // depth > 1：构建子树（不包括 entry 自身）
                const roots: DocNode[] = [];
                for (const syFile of syFiles) {
                    const childId = extractDocId(syFile);
                    // remainingDepth = depth - 1
                    const node = await buildDocTree(childId, block.box, clampedDepth - 1);
                    if (node) roots.push(node);
                }
                return { status: ToolExecuteStatus.SUCCESS, data: roots };
            }

            return {
                status: ToolExecuteStatus.ERROR,
                error: `未知的 direction: ${direction}`
            };

        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `导航失败: ${error.message}`
            };
        }
    },

    formatForLLM: (data: DocumentSummary[] | DocNode[] | DocumentSummary): string => {
        if (!data) return '(空)';

        // 单个文档（parent 返回）
        if ('id' in data && 'hpath' in data && !Array.isArray(data)) {
            const doc = data as DocumentSummary;
            const subInfo = doc.subFileCount > 0 ? ` (+${doc.subFileCount})` : '';
            return `[${doc.id}] ${doc.hpath}${subInfo}`;
        }

        // 数组
        if (!Array.isArray(data) || data.length === 0) {
            return '(空列表)';
        }

        // 判断是 DocumentSummary[] 还是 DocNode[]
        const first = data[0];
        if ('doc' in first && 'children' in first) {
            // DocNode[] - 树结构
            const nodes = data as DocNode[];
            const totalNodes = countNodes(nodes);
            const formatted = formatDocNodeTree(nodes);
            return `---文档树 (共 ${totalNodes} 个)---\n${formatted}`;
        } else {
            // DocumentSummary[] - 列表
            return formatDocList(data as DocumentSummary[]);
        }
    }
};

