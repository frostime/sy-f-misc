import { formatDateTime, getNotebook } from "@frostime/siyuan-plugin-kits";
import { createDocWithMd, setBlockAttrs, sql, updateBlock } from "@/api";
import { id2block } from "../utils";
import { showMessage } from "siyuan";

const message2markdown = (message: IChatSessionMsgItem) => {
    if (message.type === 'seperator') {
        return '---\n > 开始新的对话';
    }
    return `
---

> ${message.timestamp ? formatDateTime(null, new Date(message.timestamp)) : '--:--:--'} ${message.author}

${message.message.content}
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
        ) AND B.type = 'd';
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


export const saveToSiYuan = async (history: IChatSessionHistory) => {
    let { items, title, id, timestamp } = history;
    // 1. 检查之前是否已经导出过
    let markdownText = items.map(message2markdown).join('\n\n');
    let doc = await checkExportDocument('custom-gpt-export-doc', id);

    // 2. 如果存在, 更新
    if (doc) {
        await updateBlock('markdown', markdownText, doc.id);
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
            'custom-gpt-export-doc': id
        }
    );
    showMessage(`保存到 ${getNotebook(rootDoc.box).name}${path}/${title}`);
}
