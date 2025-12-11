/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-28 15:49:07
 * @FilePath     : /src/func/gpt/data-utils.ts
 * @LastEditTime : 2025-05-13 21:59:00
 * @Description  : 
 */

import { assembleContext2Prompt } from "./context-provider";
import { formatSingleItem } from "./persistence";
import { extractMessageContent } from "./chat-utils/msg-content";

/**
 * 解析获取 content 的内容，返回 text 和 images 两个部分
 * @param content 
 * @returns 
 */
// export const adaptIMessageContentGetter = (content: TMessageContent) => {
//     if (typeof content === 'string') {
//         return {
//             'text': content,
//             'images': null
//         }
//     }

//     return {
//         'text': content.filter((item) => item.type === 'text').map((item) => item.text).join('\n'),
//         'images': content.filter((item) => item.type === 'image_url').map((item) => item.image_url?.url)
//     }
// }


// export const adaptIMessageContentSetter = (content: TMessageContent, text: string) => {
//     if (typeof content === 'string') {
//         return text;
//     }

//     const newContent: TMessageContent = content.map((item) => {
//         if (item.type === 'text') {
//             return { ...item, text: text };
//         }
//         return item;
//     });

//     // 如果没有 text 类型的内容，则添加一个新的
//     if (!newContent.some(item => item.type === 'text')) {
//         newContent.push({ type: 'text', text: text });
//     }

//     return newContent;
// }


export const mergeMultiVesion = (item: IChatSessionMsgItem) => {
    const allVersions = Object.values(item.versions || {});
    if (!allVersions.length) return extractMessageContent(item.message.content).text;
    let mergedContent = '以下是对同一个问题的不同回复:\n\n';
    allVersions.forEach((v, index) => {
        if (v.content) {
            mergedContent += formatSingleItem(
                item.message.role.toUpperCase(),
                extractMessageContent(v.content).text, {
                version: (index + 1).toString(),
                author: v.author
            }
            );
            mergedContent += '\n\n';
        }
    });
    return mergedContent;
}


/**
 * 将当前 `message` 存储到 `versions` 中，并生成一个新的版本 ID。
 * 如果 `currentVersion` 已存在，则使用它作为版本 ID；否则生成一个新的版本 ID（例如使用时间戳）。
 * 
 * @param item - 需要操作的 `IChatSessionMsgItem` 对象。
 * @returns 更新后的 `IChatSessionMsgItem` 对象。
 */
// export const stageMsgItemVersion = (item: IChatSessionMsgItem, version?: string) => {
//     if (item.message) {
//         // 生成一个新的版本 ID（例如使用时间戳或 UUID）
//         const versionId = version ?? (item.currentVersion ?? Date.now().toString());
//         item.versions = item.versions || {}; // 确保 versions 存在
//         item.versions[versionId] = {
//             content: item.message.content,
//             reasoning_content: (item.message as IAssistantMessage).reasoning_content || '',
//             author: item.author,
//             timestamp: item.timestamp,
//             token: item.token,
//             time: item.time
//         };
//         item.currentVersion = versionId; // 更新当前版本
//     }
//     return item;
// };

/**
 * 将 `versions` 中的某个版本应用到当前 `message`。
 * 更新 `message` 的内容、作者、时间戳和 token 为选中版本的值。
 * 
 * @param item - 需要操作的 `IChatSessionMsgItem` 对象。
 * @param version - 要应用的版本 ID。
 * @returns 更新后的 `IChatSessionMsgItem` 对象。
 */
// export const applyMsgItemVersion = (item: IChatSessionMsgItem, version: string) => {
//     if (item.versions && item.versions[version]) {
//         const selectedVersion = item.versions[version];
//         item.message.content = selectedVersion.content;
//         // 更新 reasoning_content，如果存在的话
//         if (selectedVersion.reasoning_content) {
//             (item.message as IAssistantMessage).reasoning_content = selectedVersion.reasoning_content;
//         } else if ((item.message as IAssistantMessage).reasoning_content) {
//             (item.message as IAssistantMessage).reasoning_content = '';
//         }
//         selectedVersion.author && (item.author = selectedVersion.author);
//         selectedVersion.timestamp && (item.timestamp = selectedVersion.timestamp);
//         selectedVersion.token && (item.token = selectedVersion.token);
//         selectedVersion.time && (item.time = selectedVersion.time);
//         item.currentVersion = version; // 更新当前版本
//     }
//     return item;
// };


// export const isMsgItemWithMultiVersion = (item: IChatSessionMsgItem) => {
//     return item.versions !== undefined && Object.keys(item.versions).length > 1;
// }

// export const mergeInputWithContext = (input: string, contexts: IProvidedContext[]) => {
//     let result = {
//         content: input,
//         userPromptSlice: [0, input.length] as [number, number]
//     }
//     if (contexts && contexts?.length > 0) {
//         let prompts = assembleContext2Prompt(contexts);
//         if (prompts) {
//             // 记录 context prompt 的长度，以便在 MessageItem 中显示用户输入部分
//             const contextLength = prompts.length + 2; // +2 for \n\n
//             result.userPromptSlice = [contextLength, contextLength + input.length];
//             result.content = `${prompts}\n\n${input}`;
//         }
//     }
//     return result;
// }
