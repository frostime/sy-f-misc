/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/utils.ts
 * @Description  : 思源笔记工具辅助函数
 */

import { BlockTypeName, getBlockByID, getMarkdown, getNotebook, listDailynote, searchChildDocs, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { appendBlock, request } from "@frostime/siyuan-plugin-kits/api";

/**
 * 文档映射函数
 */
export const documentMapper = (doc: Block | any) => {
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

/**
 * 块映射函数
 */
export const blockMapper = (block: Block | any) => {
    return {
        id: block.id,
        type: BlockTypeName[block.type],
        content: block.content,
        document: block.root_id
    }
}

/**
 * 获取笔记本列表
 */
export const listNotebook = () => {
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
 * 获取日记文档
 */
export const getDailyNoteDocs = async (opts: {
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
    return docs.map(documentMapper);
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
 */
export const listSubDocs = (root: BlockId, depth = 1) => {
    const MAX_DEPTH = 7;
    const buildTree = async (docId, depth = 1) => {
        if (depth > MAX_DEPTH) return [];
        let children = await searchChildDocs(docId);
        //@ts-ignore
        children = children.map(documentMapper);
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
