/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 14:17:37
 * @FilePath     : /src/func/gpt/persistence/sy-doc.ts
 * @LastEditTime : 2024-12-24 17:44:13
 * @Description  : 
 */
import { formatDateTime, getNotebook } from "@frostime/siyuan-plugin-kits";
import { createDocWithMd, setBlockAttrs, sql, updateBlock } from "@/api";
import { id2block } from "../utils";
import { showMessage } from "siyuan";

const item2markdown = (item: IChatSessionMsgItem) => {
    if (item.type === 'seperator') {
        return '---\n > 开始新的对话';
    }
    let author: string = item.message.role;
    if (item.message.role === 'assistant') {
        author = `${item.message.role} [${item.author}]`;
    }
    return `
---

> ${item.timestamp ? formatDateTime(null, new Date(item.timestamp)) : '--:--:--'} ${author}

${item.message.content}
`.trim();
}

const checkExportDocument = async (attr: string, value: string) => {
    let docs = await sql(`
        SELECT B.*
        FROM blocks AS B
        WHERE B.id IN (
            SELECT A.block_id
            FROM attributes AS A
            WHERE A.name = '${attr}' AND A.value = '${value}'
        ) AND B.type = 'd'
        order by created;
        `);
    if (docs?.length > 0) {
        if (docs.length !== 1) {
            console.warn(`Multiple documents found with attribute ${attr}=${value}`);
        }
        return docs[0];
    }
    return null;
}


async function ensureRootDocument(newTitle: string, notebookId?: NotebookId): Promise<Block> {
    // 'custom-gpt-export-root', 'true', 
    const attr = 'custom-gpt-export-root';
    const value = 'true';
    let doc = await checkExportDocument(attr, value);
    if (doc) {
        return doc;
    }
    if (!notebookId) {
        const notebooks = window.siyuan.notebooks.filter(n => n.closed === false);
        if (notebooks.length === 0) {
            throw new Error('No opened notebook found');
        }
        notebookId = notebooks[0].id;
    }
    let docid = await createDocWithMd(notebookId, `/${newTitle}`, '');
    await setBlockAttrs(docid,
        {
            [attr]: value
        }
    );
    let blocks = await id2block(docid)[0];
    return blocks;
}

export const itemsToMarkdown = (items: IChatSessionMsgItem[]) => {
    let markdownText = items.map(item2markdown).join('\n\n');
    return markdownText;
}


export const saveToSiYuan = async (history: IChatSessionHistory) => {
    let { title, timestamp } = history;
    // 1. 检查之前是否已经导出过
    let markdownText = itemsToMarkdown(history.items);
    let doc = await checkExportDocument('custom-gpt-export-doc', history.id);

    // 2. 如果存在, 更新
    if (doc) {
        await updateBlock('markdown', markdownText, doc.id);
        return;
    }

    // 3. 如果不存在, 创建
    // 3.1 首先找到导出文档的根目录文档
    const rootDoc = await ensureRootDocument('GPT 导出文档');

    //3.2 创建导出文档
    title = title || `GPT 导出文档`;
    title = formatDateTime('yyyy-MM-dd', new Date(timestamp)) + ' ' + title;
    let path = rootDoc.hpath;
    let docid = await createDocWithMd(rootDoc.box, `${path}/${title}`, markdownText);
    await setBlockAttrs(docid,
        {
            'custom-gpt-export-doc': history.id
        }
    );
    showMessage(`保存到 ${getNotebook(rootDoc.box).name}${path}/${title}`);
}
