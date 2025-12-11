/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 14:17:37
 * @FilePath     : /src/func/gpt/persistence/sy-doc.ts
 * @LastEditTime : 2025-05-10 20:25:37
 * @Description  :
 */
import { formatDateTime, getNotebook, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { createDocWithMd, getBlockKramdown, renameDoc, setBlockAttrs, sql, updateBlock } from "@/api";
import { convertMathFormulas, id2block } from "../utils";
import { extractMessageContent } from '../chat-utils';

import { showMessage } from "siyuan";
import { defaultConfig, globalMiscConfigs } from "../setting";
import { appendBlock } from "@frostime/siyuan-plugin-kits/api";

const ATTR_GPT_EXPORT_ROOT = 'custom-gpt-export-root';
export const ATTR_GPT_EXPORT_DOC = 'custom-gpt-export-doc';
const ATTR_GPT_EXPORT_DOC_EDITABLE_AREA = 'custom-gpt-export-doc-editable-area';
const ATTR_GPT_EXPORT_ASSET_LINK = 'custom-gpt-export-asset-link';

const CUSTOM_EDITABLE_AREA = `
> **可编辑区域**
{: id="20241226142458-lrm1v3l" ${ATTR_GPT_EXPORT_DOC_EDITABLE_AREA}="true" custom-b="note" custom-callout-mode="small" memo="可编辑区域" }
`.trim();

// Used to as separator between message items
const SEPERATOR_LINE = `> ---`;


/**
Item 格式化为 markdown 的基本协议

每个 Item 被格式化为:
```
> ---
> < xml 说明 />

或者按照标准 Markdown 语法

> ---
>
> < TAG_NAME />

具体内容
```
其中 xml 说明是一个单个闭合的 XML 标签, tag name 为 SYSTEM, USER, ASSISTANT 或者 SEPERATOR; 可以带有 xml 属性, 例如 author, timestamp 等。

 */

export const formatSingleItem = (name: string, content: string, meta?: Record<string, string>) => {
    const xmlAttrs = Object.entries(meta || {}).map(([key, value]) => {
        if (!value) return '';
        return `${key}="${value}"`;
    }).filter(Boolean).join(' ');
    return `
${SEPERATOR_LINE}
>
> <${name} ${xmlAttrs}/>

${content}

`.trim();
};

export const item2markdown = (item: IChatSessionMsgItem, options?: {
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
    let { text, images } = extractMessageContent(item.message.content);
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
        timestamp: timeStr
    });

    //     return `
    // ${SEPERATOR_LINE}
    // > <${xmlTagName} ${author ? `author="${author}"` : ''} ${timeStr ? `time="${timeStr}"` : ''} />

    // ${text}

    // ${imagesDivs()}

    // `.trim();
}

type History = {
    items: IChatSessionMsgItem[],
    sysPrompt?: string
};


export const chatHistoryToMarkdown = (history: IChatSessionMsgItem[] | History,
    options?: Parameters<typeof item2markdown>[1]
) => {
    let markdownText = '';
    let item: IChatSessionMsgItem[] = null;
    let sysPrompt = null;
    if (Array.isArray(history)) {
        item = history;
    } else {
        item = history.items;
        sysPrompt = history.sysPrompt;
    }

    if (globalMiscConfigs().exportMDSkipHidden) {
        item = item.filter(item => !item.hidden);
    }

    if (sysPrompt) {
        markdownText += formatSingleItem('SYSTEM', sysPrompt) + '\n\n';
    }
    markdownText += item.map(item => item2markdown(item, options)).join('\n\n');
    return markdownText;
}


/**
 * 假定 markdown 已经 split 了 SEPERATOR_LINE, 将每个 item 输入本函数可以解析 item 信息
 * @param markdown
 * @returns {name, content, meta}
 */
const parseItemMarkdown = (markdown: string) => {
    markdown = markdown.trim();
    if (!markdown) return null;

    // 解析 xml tag - 修复正则表达式以匹配自闭合标签
    // 正则表达式解释：
    //   >\s*<([A-Za-z]+)([^>]*?)(\s*\/?)>
    //   - >\s* 匹配 '>' 后面的空白字符
    //   - <([A-Za-z]+) 匹配 '<' 后面的标签名（大写字母）
    //   - ([^>]*?) 匹配标签属性（非 '>' 的任意字符，非贪婪匹配）
    //   - (\s*\/?) 匹配标签的结束符（ '/' 或空白字符）
    const xmlTagRegex = />\s*<([A-Za-z]+)([^>]*?)(\s*\/?)>/;
    const match = markdown.match(xmlTagRegex);

    if (!match) {
        console.warn('Failed to match XML tag in:', markdown.substring(0, 100));
        return null;
    }

    const [fullMatch, name, attributesStr] = match;

    // 解析属性
    const meta: Record<string, string> = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
        const [_, key, value] = attrMatch;
        meta[key] = value;
    }

    // 提取内容 (去掉XML标签行)
    let lines = markdown.split('\n');
    const tagLineIndex = lines.findIndex(line => line.includes(fullMatch));

    // 如果找不到标签行，返回空内容
    if (tagLineIndex < 0) {
        return { name, content: '', meta };
    } else {
        // 去掉这行
        lines.splice(tagLineIndex, 1);
    }

    const content = lines.join('\n').trim();

    return { name, content, meta };
}


/**
 * 扩展 IChatSessionHistory 接口，添加 preamble 字段
 */
interface IChatSessionHistoryWithPreamble extends IChatSessionHistory {
    preamble?: string;
}

export const parseMarkdownToChatHistory = (markdown: string): IChatSessionHistoryWithPreamble | null => {
    if (!markdown || typeof markdown !== 'string') {
        return null;
    }

    console.group('parseMarkdownToChatHistory');

    // 检测前导文本
    let preamble: string | undefined;
    let contentToParse = markdown;

    // 查找第一个分隔符的位置
    const firstSeparatorIndex = markdown.indexOf(SEPERATOR_LINE);

    if (firstSeparatorIndex > 0) {
        // 提取前导文本（第一个分隔符之前的所有内容）
        preamble = markdown.substring(0, firstSeparatorIndex).trim();
        if (preamble) {
            console.log('Detected preamble:', preamble);
        }
        // 从第一个分隔符开始解析
        contentToParse = markdown.substring(firstSeparatorIndex);
    }

    // 通过 SEPERATOR_LINE 分割
    const splited = contentToParse.split(SEPERATOR_LINE).filter(Boolean);
    console.log(`Split markdown into ${splited.length} parts`);

    const parts = [];
    let itemText = [];
    for (let slice of splited) {
        slice = slice.trim();

        // 使用正则表达式检查是否匹配 XML 标签行模式
        /**
         > <TAG_NAME/>
        或者
         >
         > <TAG_NAME/>
         */
        const xmlTagRegex = /^>\s*(?:\n>\s*)?\s*<[A-Za-z]+[^>]*\/>/;
        const isXMLTagLine = xmlTagRegex.test(slice);

        if (!isXMLTagLine) {
            console.warn('Slice is not start with XML tag, suspended to next slice', slice);
            itemText.push(slice);
            continue;
        }

        if (slice.startsWith('>\n')) {
            slice = slice.slice(2);
        }
        itemText.push(slice);

        parts.push(itemText.join('\n\n'));
        itemText = [];
    }

    // 添加最后一个项目（如果有）
    if (itemText.length > 0) {
        parts.push(itemText.join('\n\n'));
    }

    if (parts.length === 0) {
        return null;
    }

    let sysPrompt: string | undefined;
    const items: IChatSessionMsgItem[] = [];

    for (const part of parts) {
        const parsed = parseItemMarkdown(part);
        if (!parsed) {
            console.warn('Failed to parse item markdown:', part);
            continue;
        }

        const { name, content, meta } = parsed;

        // 处理系统提示
        if (name.toLocaleUpperCase() === 'SYSTEM') {
            sysPrompt = content;
            continue;
        }

        // 处理分隔符
        if (name.toLocaleUpperCase() === 'SEPERATOR') {
            items.push({
                type: 'seperator',
                id: `seperator-${Date.now()}-${items.length}`
            });
            continue;
        }

        // 处理消息
        const role = name.toLowerCase() as 'user' | 'assistant' | 'system';
        if (!['user', 'assistant', 'system'].includes(role)) {
            console.warn(`Unknown role: ${role}, skipping message`);
            continue;
        }

        // 提取图片
        const imgRegex = /<img[^>]*src="([^"]*)"[^>]*>/g;
        const images: string[] = [];
        let imgMatch;
        let textContent = content;

        // 如果内容中包含图片区域
        if (content.includes('<div style="display: flex; flex-direction: column; gap: 10px;">')) {
            // 分离文本内容和图片区域
            const parts = content.split('<div style="display: flex; flex-direction: column; gap: 10px;">');
            textContent = parts[0].trim();

            // 提取所有图片URL
            const imgPart = parts[1] || '';
            while ((imgMatch = imgRegex.exec(imgPart)) !== null) {
                images.push(imgMatch[1]);
            }
        }

        // 构造消息内容
        let messageContent: TMessageContent;
        if (images.length > 0) {
            messageContent = [
                { type: 'text', text: textContent }
            ];

            for (const imgUrl of images) {
                messageContent.push({
                    type: 'image_url',
                    image_url: { url: imgUrl }
                });
            }
        } else {
            messageContent = textContent;
        }

        // 创建消息项
        const timestamp = meta.timestamp ?
            new Date(meta.timestamp).getTime() :
            Date.now();

        const item: IChatSessionMsgItem = {
            type: 'message',
            id: `msg-${Date.now()}-${items.length}`,
            message: {
                role,
                content: messageContent
            },
            author: meta.author || role,
            timestamp
        };

        items.push(item);
    }

    const now = Date.now();

    const id = window.Lute.NewNodeID();

    console.log(`Successfully parsed ${items.length} message items, system prompt: ${sysPrompt ? 'present' : 'not present'}, preamble: ${preamble ? 'present' : 'not present'}`);

    console.groupEnd();

    return {
        items,
        sysPrompt,
        preamble,  // 添加前导文本
        id: id,
        title: `Chat ${formatDateTime(null, new Date(now))}`,
        timestamp: now,
        updated: now,
        type: 'history'
    };
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


/**
 * 保存到思源笔记的附件当中
 * @param history
 */
export const saveToSiYuanAssetFile = async (history: IChatSessionHistory) => {
    let { title, id } = history;
    let markdownText = chatHistoryToMarkdown(history);

    const plugin = thisPlugin();
    await plugin.saveBlob(`${id}.md`, markdownText, '/data/assets/chat-markdown');

    const newMd = `
${formatDateTime()} | [${title}.md](assets/chat-markdown/${id}.md)
{: ${ATTR_GPT_EXPORT_ASSET_LINK}="${history.id}" }
`;
    let rootDoc = await ensureRootDocument('GPT 导出文档');
    let assetLinkBlock = await checkBlockWithAttr(ATTR_GPT_EXPORT_ASSET_LINK, history.id, null);
    if (!assetLinkBlock || assetLinkBlock.length === 0) {
        await appendBlock('markdown', newMd, rootDoc.id);
    } else {
        await updateBlock('markdown', newMd, assetLinkBlock[0].id);
    }
}


export const findBindDoc = async (historyId: string) => {
    let doc = await checkBlockWithAttr(ATTR_GPT_EXPORT_DOC, historyId);
    return doc;
}
