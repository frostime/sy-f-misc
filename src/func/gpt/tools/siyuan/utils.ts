/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/utils.ts
 * @Description  : 思源笔记工具辅助函数
 */

import { getBlockByID } from "@frostime/siyuan-plugin-kits";
import { request, sql } from "@frostime/siyuan-plugin-kits/api";

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


// ================================================================
// For Inspect
// ================================================================
// 添加到 utils.ts

/**
 * 判断是否是有效的思源 ID 格式
 * 格式: 14位数字-7位字母数字
 */
export function isIDFormat(str: string): boolean {
    return /^\d{14}-[a-z0-9]{7}$/.test(str);
}

/**
 * 容器块类型列表
 */
// const CONTAINER_TYPES = new Set(['d', 'b', 'l', 's', 'c']); // document, blockquote, list, superblock, container

/**
 * 判断块是否是容器块
 */
export async function isContainerBlock(id: string): Promise<boolean> {
    // const block = await getBlockByID(id);
    // if (!block) return false;
    // return CONTAINER_TYPES.has(block.type);
    const childs = await getChildBlocks(id);
    return childs.length > 0;
}

/**
 * 获取容器块的直接子块 ID 列表
 */
export async function getChildBlocks(id: string): Promise<string[]> {
    const result = await request('/api/block/getChildBlocks', { id });
    if (!result || result.length === 0) return [];
    return result.map((row: any) => row.id);
}

/**
 * 标题节点结构
 */
export interface HeaderNode {
    blockId: string;
    content: string;
    children: HeaderNode[];
}

/**
 * 获取文档的标题大纲 (TOC)
 */
export async function getToc(docId: string): Promise<HeaderNode[]> {
    // 获取文档中所有标题块，按顺序排列
    const headers = await sql(`
        SELECT id, content, subtype FROM blocks
        WHERE root_id = '${docId}' AND type = 'h'
        ORDER BY sort
    `);

    if (!headers || headers.length === 0) return [];

    // 构建层级结构
    const root: HeaderNode[] = [];
    const stack: { node: HeaderNode; level: number }[] = [];

    for (const h of headers) {
        // subtype: h1, h2, h3, ...
        const level = parseInt(h.subtype?.replace('h', '') || '1', 10);

        const node: HeaderNode = {
            blockId: h.id,
            content: h.content,
            children: []
        };

        // 找到正确的父节点
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        if (stack.length === 0) {
            root.push(node);
        } else {
            stack[stack.length - 1].node.children.push(node);
        }

        stack.push({ node, level });
    }

    return root;
}

