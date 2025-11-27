/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/utils.ts
 * @Description  : 思源笔记工具辅助函数
 */

import { BlockTypeName, getBlockByID, getMarkdown, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { appendBlock, request } from "@frostime/siyuan-plugin-kits/api";
import { listDocsByPath, readDir } from "@/api";

/**
 * 文档映射函数
 * @param doc Block 对象或 IFile 对象
 * @param subFileCount 可选的子文档数量（来自 listDocsByPath API）
 */
export const documentMapper = (doc: Block | any, subFileCount?: number) => {
    // const notebook = getNotebook(doc.box);
    return {
        id: doc.id,
        hpath: doc.hpath,
        path: doc.path,
        content: doc.content,
        box: doc.box,
        // subFileCount: 子文档数量
        // - undefined: 未知（未查询）
        // - 0: 叶子文档，没有子文档
        // - >0: 有子文档
        subFileCount: subFileCount ?? doc.subFileCount
    }
}

export type DocumentSummary = ReturnType<typeof documentMapper>;

/**
 * 块映射函数
 */
export const blockMapper = (block: Block | any) => {
    let ans: Partial<Block> = {
        id: block.id,
        type: BlockTypeName[block.type],
        root_id: block.root_id
    };
    if (block.type === 'd') {
        ans.content = block.content;
    } else {
        ans.markdown = block.markdown;
    }
    return ans;
}


/**
 * 获取文档信息
 */
export const getDocument = async (opts: {
    docId: string
}) => {
    const block = await getBlockByID(opts.docId);
    if (!block) {
        return null;
    }
    return documentMapper(block);
}

/**
 * 获取块的完整Markdown内容
 */
export const getBlockFullMarkdownContent = async (blockId: BlockId) => {
    return await getMarkdown(blockId);
}

/**
 * 列出子文档
 * @param root 根文档ID
 * @param maxDepth 最大递归深度，默认为1（只获取直接子文档）
 */
export const listSubDocs = (root: BlockId, maxDepth = 1) => {
    const MAX_DEPTH = 7;
    const effectiveMaxDepth = Math.min(maxDepth, MAX_DEPTH);

    const buildTree = async (_docId: BlockId, box: NotebookId, docPath: string, currentDepth: number): Promise<DocumentSummaryWithChildren[]> => {
        if (currentDepth > effectiveMaxDepth) return [];

        // 计算子文档目录路径
        const parentPath = docPath.endsWith('.sy') ? docPath : docPath + '.sy';
        const childDirPath = parentPath.replace(/\.sy$/, '');

        // 先用 readDir 检查子文档目录是否存在，避免 listDocsByPath 触发错误弹窗
        const dataDirPath = `/data/${box}${childDirPath}`;
        const dirContent = await readDir(dataDirPath);

        // 如果目录不存在或为空，直接返回
        if (!dirContent || dirContent.length === 0) {
            return [];
        }

        // 检查是否有 .sy 文件（子文档）
        const hasSyFiles = dirContent.some(item => !item.isDir && item.name.endsWith('.sy'));
        if (!hasSyFiles) {
            return [];
        }

        // 目录存在且有子文档，调用 listDocsByPath 获取详细信息
        const response = await listDocsByPath(box, childDirPath);

        if (!response || !response.files || response.files.length === 0) {
            return [];
        }

        const result: DocumentSummaryWithChildren[] = [];

        for (const file of response.files) {
            const mapped = documentMapper({
                id: file.id,
                hpath: file.hPath ?? file.name,  // IFile 可能使用不同的字段名
                path: file.path,
                content: file.name1 || file.name,
                box: box
            }, file.subFileCount);

            // 只有当 depth 允许且有子文档时才递归
            const subChildren = (currentDepth < effectiveMaxDepth && file.subFileCount > 0)
                ? await buildTree(file.id, box, file.path, currentDepth + 1)
                : [];

            result.push({
                ...mapped,
                children: subChildren.length > 0 ? subChildren : undefined
            });
        }

        return result;
    };

    if (root) {
        // 首先获取根文档信息以确定 box 和 path
        return (async () => {
            const rootDoc = await getBlockByID(root);
            if (!rootDoc) return [];
            return buildTree(root, rootDoc.box, rootDoc.path, 1);
        })();
    }
    return Promise.resolve([]);
}

export type DocumentSummaryWithChildren = DocumentSummary & { children?: DocumentSummaryWithChildren[] };

/**
 * 格式化单个文档条目，包含子文档信息
 * @param doc 文档对象
 * @returns 格式化的文档行
 */
const formatDocEntry = (doc: DocumentSummary): string => {
    const subInfo = doc.subFileCount !== undefined && doc.subFileCount > 0
        ? `/ (+${doc.subFileCount})`
        : '';
    return `[${doc.id}] ${doc.hpath}${subInfo}`;
};

/**
 * 格式化文档列表为简洁的行格式
 * @param docs 文档列表
 * @returns 格式化后的字符串
 */
export const formatDocList = (docs: DocumentSummary[]): string => {
    if (!docs || docs.length === 0) {
        return '(空列表)';
    }
    const lines = docs.map(doc => `- ${formatDocEntry(doc)}`);
    return `---文档列表 (共 ${docs.length} 个)---\n${lines.join('\n')}`;
}

/**
 * 格式化文档树条目
 * 处理三种情况：
 * 1. 叶子文档（subFileCount === 0）：显示路径
 * 2. 有子文档且已展开（children 不为空）：显示路径（子文档会递归展示）
 * 3. 有子文档但未展开（subFileCount > 0 但 children 为空）：显示 /path/ (+N)
 */
const formatDocTreeEntry = (doc: DocumentSummaryWithChildren): string => {
    const hasExpandedChildren = doc.children && doc.children.length > 0;
    const hasUnexpandedChildren = !hasExpandedChildren &&
        doc.subFileCount !== undefined && doc.subFileCount > 0;

    if (hasUnexpandedChildren) {
        // 有子文档但未展开，显示 (+N) 表示还有 N 个未展开的子文档
        return `[${doc.id}] ${doc.hpath}/ (+${doc.subFileCount})`;
    }

    // 叶子文档或已展开的文档
    return `[${doc.id}] ${doc.hpath}`;
};

/**
 * 格式化文档树为缩进格式
 * @param docs 带 children 的文档树
 * @param indent 当前缩进级别
 * @returns 格式化后的字符串
 */
export const formatDocTree = (docs: DocumentSummaryWithChildren[], indent = 0): string => {
    if (!docs || docs.length === 0) {
        return indent === 0 ? '(空列表)' : '';
    }

    const lines: string[] = [];
    const prefix = '  '.repeat(indent);

    for (const doc of docs) {
        lines.push(`${prefix}- ${formatDocTreeEntry(doc)}`);
        if (doc.children && doc.children.length > 0) {
            const childLines = formatDocTree(doc.children, indent + 1);
            if (childLines) {
                lines.push(childLines);
            }
        }
    }

    if (indent === 0) {
        // 统计总文档数
        const countDocs = (docs: DocumentSummaryWithChildren[]): number => {
            return docs.reduce((sum, doc) => {
                return sum + 1 + (doc.children ? countDocs(doc.children) : 0);
            }, 0);
        };
        return `---文档树 (共 ${countDocs(docs)} 个)---\n${lines.join('\n')}`;
    }
    return lines.join('\n');
}

/**
 * 添加Markdown内容
 */
export const appendMarkdown = async (document: BlockId, markdown: string) => {
    await appendBlock('markdown', markdown, document);
}

/**
 * 添加日记
 */
export const appendDailyNote = async (notebookId: BlockId, markdown: string) => {
    let url = '/api/filetree/createDailyNote';
    let app = thisPlugin().app;
    let ans = await request(url, { notebook: notebookId, app: app?.appId });
    let docId = ans.id;
    await appendMarkdown(docId, markdown);
    return docId;
}
