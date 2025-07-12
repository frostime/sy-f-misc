/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-10
 * @FilePath     : /src/func/gpt/chat-in-doc/document-parser.ts
 * @Description  : 文档解析和操作
 */

import { formatDateTime } from "@frostime/siyuan-plugin-kits";
import { appendBlock } from "@frostime/siyuan-plugin-kits/api";
import { formatSingleItem, parseMarkdownToChatHistory } from "../persistence/sy-doc";
import { defaultModelId } from "../setting";
// import { type CompletionResponse } from "../openai/complete";

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


/**
 * 创建空白消息
 * @param type 消息类型
 * @param content 消息内容
 * @param options 可选配置
 * @returns 格式化的Markdown字符串
 */
export const blankMessage = (
    type: 'USER' | 'ASSISTANT' | 'SYSTEM',
    content = '',
    options?: {
        escape?: boolean;
        modelName?: string;
        meta?: Record<string, string | number>;
    }
) => {
    // 兼容旧的调用方式，如果options是布尔值，则视为escape参数
    const opts = { escape: false, ...options };

    const timeStr = formatDateTime();
    let author: string = type;
    if (type === 'USER') {
        author = userName;
    } else if (type === 'ASSISTANT') {
        author = opts.modelName || defaultModelId();
    }
    let markdown = formatSingleItem(type, '', {
        author: author,
        timestamp: timeStr,
        ...opts.meta
    }).trim();
    return `${opts.escape ? window.Lute.EscapeHTMLStr(markdown) : markdown}
{: ${SECTION_ATTR}="${type}" id="${window?.Lute.NewNodeID()}" }

${content}


{: id="${window?.Lute.NewNodeID() || '20250101120606-aaaaaaa'}" type="p" }

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
 * @param modelName 模型名称，可选
 */
export const insertAssistantMessage = async (docId: string, response: CompletionResponse, modelName?: string): Promise<void> => {
    // 创建助手对话块
    const assistantBlock = blankMessage('ASSISTANT', response.content, {
        escape: false,
        modelName: modelName,
        meta: {
            prompt: response.usage?.prompt_tokens,
            completion: response.usage?.completion_tokens
        }
    });

    try {
        await appendBlock("markdown", assistantBlock.trim(), docId);
    } catch (error) {
        console.error("插入助手对话块失败", error);
        throw error;
    }
};
