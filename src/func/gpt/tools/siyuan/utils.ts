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
import { createTreeSource, TreeBuilder, formatTree, Tree, type Tree as DocumentTree } from '@/libs/tree-model';

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
 * 获取文档的子文档
 */
async function getDocChildren(doc: DocumentSummary): Promise<DocumentSummary[]> {
    const parentPath = doc.path.endsWith('.sy') ? doc.path : doc.path + '.sy';
    const childDirPath = parentPath.replace(/\.sy$/, '');
    const dataDirPath = `/data/${doc.box}${childDirPath}`;

    // 检查目录是否存在
    const dirContent = await readDir(dataDirPath);
    if (!dirContent?.length) return [];

    // 检查是否有 .sy 文件
    const hasSyFiles = dirContent.some(item => !item.isDir && item.name.endsWith('.sy'));
    if (!hasSyFiles) return [];

    // 获取子文档详细信息
    const response = await listDocsByPath(doc.box, childDirPath);
    if (!response?.files?.length) return [];

    return response.files.map(file => documentMapper({
        id: file.id,
        hpath: file.hPath ?? file.name,
        path: file.path,
        content: file.name1 || file.name,
        box: doc.box
    }, file.subFileCount));
}

/**
 * 列出子文档 - 返回文档树
 * @param root 根文档ID
 * @param maxDepth 最大递归深度，默认为1（只获取直接子文档）
 */
export const listSubDocs = async (root: BlockId, maxDepth = 1): Promise<DocumentTree> => {
    const MAX_DEPTH = 7;
    const effectiveMaxDepth = Math.min(maxDepth, MAX_DEPTH);

    if (!root) {
        return new Tree([]);
    }

    // 获取根文档
    const rootDoc = await getBlockByID(root);
    if (!rootDoc) {
        return new Tree([]);
    }

    const rootSummary = documentMapper(rootDoc);

    // 使用 tree-model 构建树
    const source = createTreeSource<DocumentSummary>({
        root: rootSummary,
        getChildren: getDocChildren
    });

    return await TreeBuilder.build<DocumentSummary>([source], { maxDepth: effectiveMaxDepth });
}

export type DocumentSummaryWithChildren = DocumentSummary & { children?: DocumentSummaryWithChildren[] };

/**
 * 文档树类型
 */
export type { DocumentTree };

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
    if (!docs?.length) return '(空列表)';

    const lines = docs.map(doc => `- ${formatDocEntry(doc)}`);
    return `---文档列表 (共 ${docs.length} 个)---\n${lines.join('\n')}`;
}

/**
 * 格式化文档树为树形结构
 * @param tree 文档树
 * @returns 格式化后的字符串
 */
export const formatDocTree = (tree: DocumentTree): string => {
    if (!tree || tree.roots.length === 0) {
        return '(空列表)';
    }

    const stats = tree.getStats();
    const formatted = formatTree({
        tree,
        formatter: (doc, node) => {
            const hasUnexpandedChildren = node.children.length === 0 && doc.subFileCount && doc.subFileCount > 0;
            if (hasUnexpandedChildren) {
                return `[${doc.id}] ${doc.hpath}/ (+${doc.subFileCount})`;
            }
            return `[${doc.id}] ${doc.hpath}`;
        },
        showChildCount: true
    });

    return `---文档树 (共 ${stats.totalNodes} 个)---\n${formatted}`;
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
