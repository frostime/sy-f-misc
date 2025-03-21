/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 14:17:37
 * @FilePath     : /src/func/gpt/persistence/sy-doc.ts
 * @LastEditTime : 2025-03-21 12:52:39
 * @Description  : 
 */
import { formatDateTime, getNotebook } from "@frostime/siyuan-plugin-kits";
import { createDocWithMd, getBlockKramdown, renameDoc, setBlockAttrs, sql, updateBlock } from "@/api";
import { convertMathFormulas, id2block } from "../utils";
import { adaptIMessageContent } from '../data-utils';

import { showMessage } from "siyuan";
import { defaultConfig } from "../setting";

const ATTR_GPT_EXPORT_ROOT = 'custom-gpt-export-root';
export const ATTR_GPT_EXPORT_DOC = 'custom-gpt-export-doc';
const ATTR_GPT_EXPORT_DOC_EDITABLE_AREA = 'custom-gpt-export-doc-editable-area';

const CUSTOM_EDITABLE_AREA = `
> **可编辑区域**
{: id="20241226142458-lrm1v3l" ${ATTR_GPT_EXPORT_DOC_EDITABLE_AREA}="true" custom-b="note" custom-callout-mode="small" memo="可编辑区域" }
`.trim();

const SEPERATOR_LINE = `> -------`;

const formatSingleItem = (name: string, content: string, meta?: Record<string, string>) => {
    const xmlAttrs = Object.entries(meta || {}).map(([key, value]) => {
        if (!value) return '';
        return `${key}="${value}"`;
    }).filter(Boolean).join(' ');
    return `
${SEPERATOR_LINE}
> <${name} ${xmlAttrs}/>

${content}

`.trim();
};

const item2markdown = (item: IChatSessionMsgItem, options?: {
    convertImage?: boolean
}) => {
    const { convertImage } = options || {
        convertImage: true
    };
    if (item.type === 'seperator') {
        return `
${SEPERATOR_LINE}
> <SEPERATOR />
`.trim();
    }
    let author: string = item.message.role;
    if (item.message.role === 'assistant') {
        author = item.author;
    }
    let { text, images } = adaptIMessageContent(item.message.content);
    if (defaultConfig().convertMathSyntax) {
        text = convertMathFormulas(text);
    }

    const imagesDivs = () => {
        if (!images || images.length === 0 || !convertImage) return '';
        let imgs = images.map(b64code => `<img style="max-width: 100%; display: inline-block;" src="${b64code}" />`);
        return `<div style="display: flex; flex-direction: column; gap: 10px;">\n${imgs.join('\n')}\n</div>`;
    }

    let xmlTagName = item.message.role.toUpperCase();
    const timeStr = item.timestamp ? formatDateTime(null, new Date(item.timestamp)) : '';
    const content = `${text}\n\n${imagesDivs()}`.trim();
    return formatSingleItem(xmlTagName, content, {
        author,
        time: timeStr
    });

//     return `
// ${SEPERATOR_LINE}
// > <${xmlTagName} ${author ? `author="${author}"` : ''} ${timeStr ? `time="${timeStr}"` : ''} />

// ${text}

// ${imagesDivs()}

// `.trim();
}

const checkBlockWithAttr = async (attr: string, value: string, cond: string = `B.type = 'd'`): Promise<Block[]> => {
    let docs = await sql(`
        SELECT B.*
        FROM blocks AS B
        WHERE B.id IN (
            SELECT A.block_id
            FROM attributes AS A
            WHERE A.name = '${attr}' AND A.value = '${value}'
        ) ${cond ? 'AND ' + cond : ''}
        order by created;
        `);
    if (docs?.length > 0) {
        // if (docs.length !== 1) {
        //     console.warn(`Multiple documents found with attribute ${attr}=${value}`);
        // }
        // return docs[0];
        return docs;
    }
    return null;
}


export async function ensureRootDocument(newTitle: string, notebookId?: NotebookId): Promise<Block> {
    // 'custom-gpt-export-root', 'true', 
    const attr = ATTR_GPT_EXPORT_ROOT;
    const value = 'true';
    let docs = await checkBlockWithAttr(attr, value);
    if (docs && docs?.length > 0) {
        return docs[0];
    }
    if (!notebookId) {
        const notebooks = window.siyuan.notebooks.filter(n => n.closed === false);
        if (notebooks.length === 0) {
            throw new Error('No opened notebook found');
        }
        notebookId = notebooks[0].id;
    }
    showMessage(`创建导出文档位置: ${getNotebook(notebookId).name}/${newTitle}`);
    let docid = await createDocWithMd(notebookId, `/${newTitle}`, '');
    await setBlockAttrs(docid,
        {
            [attr]: value
        }
    );
    let blocks = await id2block(docid)[0];
    return blocks;
}

export const chatHistoryToMarkdown = (history: IChatSessionMsgItem[] | {
    items: IChatSessionMsgItem[],
    sysPrompt?: string
},
    options?: Parameters<typeof item2markdown>[1]
) => {
    let markdownText = '';
    let item = null;
    let sysPrompt = null;
    if (Array.isArray(history)) {
        item = history;
    } else {
        item = history.items;
        sysPrompt = history.sysPrompt;
    }
    if (sysPrompt) {
        markdownText += formatSingleItem('SYSTEM', sysPrompt) + '\n\n';
    }
    markdownText += item.map(item => item2markdown(item, options)).join('\n\n');
    return markdownText;
}

/**
 * 保存到思源笔记
 * @param history 
 */
export const saveToSiYuan = async (history: IChatSessionHistory) => {
    let { title, timestamp } = history;
    // 1. 检查之前是否已经导出过
    let markdownText = chatHistoryToMarkdown(history);
    let docs = await checkBlockWithAttr(ATTR_GPT_EXPORT_DOC, history.id);

    let doc = docs?.[0] ?? null;

    // 2. 如果存在, 更新
    if (doc) {
        let editableAreas = await checkBlockWithAttr(ATTR_GPT_EXPORT_DOC_EDITABLE_AREA, 'true', `B.root_id = '${doc.root_id}'`);
        if (editableAreas) {
            let ids = Array.from(editableAreas).map(b => b.id);
            const markdowns = await Promise.all(ids.map(async (id) => {
                let markdown = await getBlockKramdown(id);
                return markdown.kramdown;
            }));
            markdownText = markdowns.join('\n\n') + '\n\n' + markdownText;
        } else {
            // markdownText = markdownText + '\n\n' + CUSTOM_EDITABLE_AREA;
        }
        await updateBlock('markdown', markdownText, doc.id);
        title = formatDateTime('yyyy-MM-dd', new Date(timestamp)) + ' ' + title;
        // 更新标题
        await renameDoc(doc.box, doc.path, title);
        showMessage(`更新到 ${getNotebook(doc.box).name}/${title}`);
        return;
    }

    // 3. 如果不存在, 创建
    // 3.1 首先找到导出文档的根目录文档
    let rootDoc = await ensureRootDocument('GPT 导出文档');
    //3.2 创建导出文档
    const exportDoc = async (rootDoc: Block) => {
        title = title || `GPT 导出文档`;
        title = formatDateTime('yyyy-MM-dd', new Date(timestamp)) + ' ' + title;
        let path = rootDoc.hpath;
        let docid = await createDocWithMd(rootDoc.box, `${path}/${title}`, CUSTOM_EDITABLE_AREA + '\n\n' + markdownText);
        await setBlockAttrs(docid,
            {
                'custom-gpt-export-doc': history.id
            }
        );
        showMessage(`保存到 ${getNotebook(rootDoc.box).name}${path}/${title}`);
    }

    if (!rootDoc) {
        setTimeout(async () => {
            rootDoc = await ensureRootDocument('GPT 导出文档');
            if (!rootDoc) {
                showMessage('导出失败，请再尝试一次');
                return;
            }
            await exportDoc(rootDoc);
        }, 1000);
    } else {
        exportDoc(rootDoc);
    }
}


export const findBindDoc = async (historyId: string) => {
    let doc = await checkBlockWithAttr(ATTR_GPT_EXPORT_DOC, historyId);
    return doc;
}
