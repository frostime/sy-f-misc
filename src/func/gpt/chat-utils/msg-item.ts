/*
 * 会话管理工具
 * 包含原 data-utils.ts 的功能
 * 纯函数，避免 mutation 操作
 */


import { extractContentText } from './msg-content';
import { assembleContext2Prompt } from '../context-provider';  // 保留原有的导入
import { formatSingleItem } from '../persistence';  // 保留原有的导入

// ================================================================
// Basic Getter
// ================================================================

export const checkHasToolChain = (item: Readonly<IChatSessionMsgItem>): boolean => {
    return (
        item.toolChainResult !== undefined &&
        item.toolChainResult.toolCallHistory.length > 0
    );
}

// ============================================================================
// Version Management
// ============================================================================

/**
 * 将当前 message 存储到 versions 中
 */
export function stageMsgItemVersion(
    item: Readonly<IChatSessionMsgItem>,
    version?: string
): IChatSessionMsgItem {
    // if (item.message) {
    //     const versionId = version ?? (item.currentVersion ?? Date.now().toString());
    //     item.versions = item.versions || {};
    //     item.versions[versionId] = {
    //         content: item.message.content,
    //         reasoning_content: (item.message as any).reasoning_content || '',
    //         author: item.author,
    //         timestamp: item.timestamp,
    //         token: item.token,
    //         time: item.time
    //     };
    //     item.currentVersion = versionId;
    // }
    // return item;
    if (!item.message) {
        return item;
    }

    const versionId = version ?? (item.currentVersion ?? Date.now().toString());

    return {
        ...item,
        versions: {
            ...(item.versions || {}),
            [versionId]: {
                content: item.message.content,
                reasoning_content: (item.message as any).reasoning_content || '',
                author: item.author,
                timestamp: item.timestamp,
                token: item.token,
                time: item.time
            }
        },
        currentVersion: versionId
    };
}

/**
 * 应用指定版本到当前 message
 */
export function applyMsgItemVersion(
    item: Readonly<IChatSessionMsgItem>,
    version: string
): IChatSessionMsgItem {
    // if (item.versions && item.versions[version]) {
    //     const selectedVersion = item.versions[version];
    //     item.message!.content = selectedVersion.content;

    //     if (selectedVersion.reasoning_content) {
    //         (item.message as any).reasoning_content = selectedVersion.reasoning_content;
    //     } else if ((item.message as any).reasoning_content) {
    //         (item.message as any).reasoning_content = '';
    //     }

    //     selectedVersion.author && (item.author = selectedVersion.author);
    //     selectedVersion.timestamp && (item.timestamp = selectedVersion.timestamp);
    //     selectedVersion.token && (item.token = selectedVersion.token);
    //     selectedVersion.time && (item.time = selectedVersion.time);
    //     item.currentVersion = version;
    // }
    // return item;
    if (!item.versions || !item.versions[version]) {
        return item;
    }

    const selectedVersion = item.versions[version];

    return {
        ...item,
        message: item.message ? {
            ...item.message,
            content: selectedVersion.content,
            ...(selectedVersion.reasoning_content && {
                reasoning_content: selectedVersion.reasoning_content
            })
        } : item.message,
        ...(selectedVersion.author && { author: selectedVersion.author }),
        ...(selectedVersion.timestamp && { timestamp: selectedVersion.timestamp }),
        ...(selectedVersion.token && { token: selectedVersion.token }),
        ...(selectedVersion.time && { time: selectedVersion.time }),
        currentVersion: version
    };
}

/**
 * 检查是否有多个版本
 */
export function isMsgItemWithMultiVersion(item: Readonly<IChatSessionMsgItem>): boolean {
    return item.versions !== undefined && Object.keys(item.versions).length > 1;
}

/**
 * 合并所有版本为一个文本（用于显示）
 */
export function mergeMultiVersion(item: Readonly<IChatSessionMsgItem>): string {
    const allVersions = Object.values(item.versions || {});
    if (!allVersions.length) {
        return extractContentText(item.message!.content);
    }

    let mergedContent = '以下是对同一个问题的不同回复:\n\n';
    allVersions.forEach((v, index) => {
        if (v.content) {
            mergedContent += formatSingleItem(
                item.message!.role.toUpperCase(),
                extractContentText(v.content),
                {
                    version: (index + 1).toString(),
                    author: v.author
                }
            );
            mergedContent += '\n\n';
        }
    });
    return mergedContent;
}

// ============================================================================
// Context Integration
// ============================================================================

/**
 * 合并用户输入与上下文
 */
export function mergeInputWithContext(
    input: string,
    contexts: readonly IProvidedContext[]
): {
    content: string;
    userPromptSlice: [number, number];
} {
    let result = {
        content: input,
        userPromptSlice: [0, input.length] as [number, number]
    };

    if (contexts && contexts.length > 0) {
        let prompts = assembleContext2Prompt(contexts);
        if (prompts) {
            const contextLength = prompts.length + 2; // +2 for \n\n
            result.userPromptSlice = [contextLength, contextLength + input.length];
            result.content = `${prompts}\n\n${input}`;
        }
    }

    return result;
}

/**
 * 从 IChatSessionMsgItem 中提取用户实际输入（去除上下文）
 */
export function splitPromptFromContext(item: Readonly<IChatSessionMsgItem>) {
    const content = extractContentText(item.message!.content);

    const parts = {
        contextPrompt: '',
        userPrompt: '',
        userPromptSlice: [0, 0] as [number, number]
    }

    if (item.userPromptSlice) {
        const [start, end] = item.userPromptSlice;
        // return content.slice(start, end);
        parts.contextPrompt = content.slice(0, start);
        parts.userPrompt = content.slice(start, end);
        parts.userPromptSlice = [start, end];
    } else {
        parts.userPrompt = content;
        parts.userPromptSlice = [0, content.length];
    }

    return parts;
}

// ============================================================================
// Token & Stats Calculation
// ============================================================================


// ============================================================================
// Message Utilities
// ============================================================================

/**
 * 生成唯一 ID
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}


/**
 * 检查消息项是否为空
 */
export function isMsgItemEmpty(item: Readonly<IChatSessionMsgItem>): boolean {
    if (item.type !== 'message' || !item.message) return true;
    const text = extractContentText(item.message.content);
    return text.trim() === '';
}
