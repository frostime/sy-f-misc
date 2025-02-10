/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-28 15:49:07
 * @FilePath     : /src/func/gpt/data-utils.ts
 * @LastEditTime : 2025-02-10 16:42:42
 * @Description  : 
 */

/**
 * 解析获取 content 的内容，返回 text 和 images 两个部分
 * @param content 
 * @returns 
 */
export const adaptIMessageContent = (content: IMessage['content']) => {
    if (typeof content === 'string') {
        return {
            'text': content,
            'images': null
        }
    }

    return {
        'text': content.filter((item) => item.type === 'text').map((item) => item.text).join('\n'),
        'images': content.filter((item) => item.type === 'image_url').map((item) => item.image_url?.url)
    }
}


/**
 * 将当前 `message` 存储到 `versions` 中，并生成一个新的版本 ID。
 * 如果 `currentVersion` 已存在，则使用它作为版本 ID；否则生成一个新的版本 ID（例如使用时间戳）。
 * 
 * @param item - 需要操作的 `IChatSessionMsgItem` 对象。
 * @returns 更新后的 `IChatSessionMsgItem` 对象。
 */
export const stageMsgItemVersion = (item: IChatSessionMsgItem, version?: string) => {
    if (item.message) {
        // 生成一个新的版本 ID（例如使用时间戳或 UUID）
        const versionId = version ?? (item.currentVersion ?? Date.now().toString());
        item.versions = item.versions || {}; // 确保 versions 存在
        item.versions[versionId] = {
            content: item.message.content,
            reasoning_content: item.message.reasoning_content || '',
            author: item.author,
            timestamp: item.timestamp,
            token: item.token
        };
        item.currentVersion = versionId; // 更新当前版本
    }
    return item;
};

/**
 * 将 `versions` 中的某个版本应用到当前 `message`。
 * 更新 `message` 的内容、作者、时间戳和 token 为选中版本的值。
 * 
 * @param item - 需要操作的 `IChatSessionMsgItem` 对象。
 * @param version - 要应用的版本 ID。
 * @returns 更新后的 `IChatSessionMsgItem` 对象。
 */
export const applyMsgItemVersion = (item: IChatSessionMsgItem, version: string) => {
    if (item.versions && item.versions[version]) {
        const selectedVersion = item.versions[version];
        item.message.content = selectedVersion.content;
        // 更新 reasoning_content，如果存在的话
        if (selectedVersion.reasoning_content) {
            item.message.reasoning_content = selectedVersion.reasoning_content;
        } else if (item.message.reasoning_content) {
            item.message.reasoning_content = '';
        }
        selectedVersion.author && (item.author = selectedVersion.author);
        selectedVersion.timestamp && (item.timestamp = selectedVersion.timestamp);
        selectedVersion.token && (item.token = selectedVersion.token);
        item.currentVersion = version; // 更新当前版本
    }
    return item;
};


export const isMsgItemWithMultiVersion = (item: IChatSessionMsgItem) => {
    return item.versions !== undefined && Object.keys(item.versions).length > 1;
}
