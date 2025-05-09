/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-10
 * @FilePath     : /src/func/gpt/chat-in-doc/document-parser.ts
 * @Description  : 文档解析和操作
 */

import { formatDateTime } from "@frostime/siyuan-plugin-kits";
import { appendBlock, exportMdContent, getBlockByID } from "@frostime/siyuan-plugin-kits/api";
import { formatSingleItem, parseMarkdownToChatHistory } from "../persistence/sy-doc";
import { defaultModelId } from "../setting";



/**
 * 获取文档内容
 * @param docId 文档ID
 * @returns 文档Markdown内容
 */
export const getDocumentContent = async (docId: string): Promise<string> => {
    try {
        const result = await exportMdContent(docId, {
            yfm: false
        });
        return result.content;
    } catch (error) {
        console.error("获取文档内容失败", error);
        throw error;
    }
};

/**
 * 获取文档信息
 * @param docId 文档ID
 * @returns 文档信息
 */
export const getDocumentInfo = async (docId: string): Promise<Block> => {
    try {
        return getBlockByID(docId) as Promise<Block>;
    } catch (error) {
        console.error("获取文档信息失败", error);
        throw error;
    }
};

/**
 * 解析文档内容为聊天历史
 * @param content 文档Markdown内容
 * @returns 聊天历史对象
 */
export const parseDocumentToHistory = (content: string): IChatSessionHistory => {
    try {
        // 使用现有的解析函数
        const history = parseMarkdownToChatHistory(content);

        // 如果解析失败，创建一个新的历史记录
        if (!history) {
            return {
                id: `chat-${Date.now()}`,
                title: "文档内对话",
                timestamp: Date.now(),
                items: []
            };
        }

        return history;
    } catch (error) {
        console.error("解析文档内容失败", error);
        throw error;
    }
};

const userName = window.siyuan?.user?.userName ?? 'User';

export const SECTION_ATTR = 'custom-chat-indoc-section';

export const blankMessage = (type: 'USER' | 'ASSISTANT' | 'SYSTEM', content = '', escape: boolean = false) => {
    const timeStr = formatDateTime();
    let author: string = type;
    if (type === 'USER') {
        author = userName;
    } else if (type === 'ASSISTANT') {
        author = defaultModelId();
    }
    let markdown = formatSingleItem(type, '', {
        author: author,
        timestamp: timeStr
    }).trim();
    return `${escape ? window.Lute.EscapeHTMLStr(markdown) : markdown}
{: ${SECTION_ATTR}="${type}" }

${content}
`.trim();
}

/**
 * 在文档末尾插入用户对话块
 * @param docId 文档ID
 */
export const insertBlankMessage = async (docId: string, type: 'USER' | 'ASSISTANT' | 'SYSTEM'): Promise<void> => {
    const userBlock = blankMessage(type);

    try {
        await appendBlock("markdown", userBlock.trim(), docId);
    } catch (error) {
        console.error("插入用户对话块失败", error);
        throw error;
    }
};

/**
 * 在文档末尾插入助手对话块
 * @param docId 文档ID
 * @param content 助手回复内容
 */
export const insertAssistantMessage = async (docId: string, content: string): Promise<void> => {
    // 创建助手对话块
    const assistantBlock = blankMessage('ASSISTANT', content);

    try {
        await appendBlock("markdown", assistantBlock.trim(), docId);
    } catch (error) {
        console.error("插入助手对话块失败", error);
        throw error;
    }
};
