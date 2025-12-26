/*
 * 会话管理工具
 * 包含原 data-utils.ts 的功能
 * 纯函数，避免 mutation 操作
 * 
 * 设计原则：
 * 1. 使用通用访问器 + 类型系统，而非为每个属性写独立函数
 * 2. V1→V2 迁移时只需修改访问器实现，不改调用代码
 * 3. 命名体系：
 *    - Meta: Item 的元数据（管理信息）
 *    - Payload: 消息的有效载荷（实际数据内容）
 *    - Message: OpenAI 消息格式
 * 4. 关键差异：
 *    - V1: Payload 在 item 顶层
 *    - V2: Payload 在 item.versions[versionId] 中（IMessagePayload）
 */

import { extractContentText } from './msg-content';
import { assembleContext2Prompt } from '../context-provider';
import { formatSingleItem } from '../persistence';

// ============================================================================
// 类型定义：Meta / Payload / Message 三层结构
// ============================================================================

/**
 * Meta 属性 - Item 元数据（管理信息，不随版本变化）
 * V1/V2 都直接在 item 上
 */
type MetaProps =
    | 'id'
    | 'type'
    | 'context'
    | 'multiModalAttachments'
    | 'hidden'
    | 'pinned'
    | 'loading'
    | 'attachedItems'
    | 'attachedChars'
    | 'branchFrom'
    | 'branchTo';

/**
 * Payload 属性 - 消息有效载荷（实际数据内容，随版本变化）
 * V1: 在 item 顶层
 * V2: 在 item.versions[versionId] 中（IMessagePayload）
 */
type PayloadProps =
    | 'message'
    | 'author'
    | 'timestamp'
    | 'token'
    | 'usage'
    | 'time'
    | 'userPromptSlice'
    | 'toolChainResult';

/**
 * Message 属性 - OpenAI 消息格式（在 Payload.message 中）
 * V1: item.message.xxx
 * V2: item.versions[versionId].message.xxx
 */
type MessageProps =
    | 'role'
    | 'content'
    | 'name'
    | 'refusal'
    | 'reasoning_content'
    | 'tool_calls'
    | 'tool_call_id';

// ============================================================================
// 核心访问器：基于类型的通用访问
// ============================================================================

/**
 * 获取 Meta 属性（Item 元数据）
 * V1/V2 实现相同
 */
export function getMeta<K extends MetaProps>(
    item: Readonly<IChatSessionMsgItem>,
    prop: K
): IChatSessionMsgItem[K] {
    return item[prop];
}

/**
 * 获取 Payload 属性（消息有效载荷）
 * V1: 从 item 顶层读取
 * V2: 从 item.versions[currentVersionId] 读取
 */
export function getPayload<K extends PayloadProps>(
    item: Readonly<IChatSessionMsgItem>,
    prop: K
): IChatSessionMsgItem[K] {
    // V1 实现
    return item[prop];

    // V2 实现（未来迁移时取消注释）
    // const currentVersion = item.versions?.[item.currentVersionId as string];
    // return currentVersion?.[prop] ?? item[prop];
}

/**
 * 获取 Message 属性（OpenAI 消息格式）
 * V1: item.message?.xxx
 * V2: item.versions[currentVersionId]?.message?.xxx
 */
export function getMessageProp<K extends MessageProps>(
    item: Readonly<IChatSessionMsgItem>,
    prop: K
): IMessageLoose[K] | undefined {
    // V1 实现
    return item.message?.[prop];

    // V2 实现（未来迁移时取消注释）
    // const currentVersion = item.versions?.[item.currentVersionId as string];
    // return currentVersion?.message?.[prop];
}


// ============================================================================
// Setter 函数（保持不变性）
// ============================================================================

/**
 * 设置 Meta 属性（Item 元数据）
 */
export function setMeta<K extends MetaProps>(
    item: Readonly<IChatSessionMsgItem>,
    prop: K,
    value: IChatSessionMsgItem[K]
): IChatSessionMsgItem {
    return {
        ...item,
        [prop]: value
    };
}

/**
 * 设置 Payload 属性（消息有效载荷）
 * V1: 直接设置到 item
 * V2: 设置到 item.versions[currentVersionId]
 */
export function setPayload<K extends PayloadProps>(
    item: Readonly<IChatSessionMsgItem>,
    prop: K,
    value: IChatSessionMsgItem[K]
): IChatSessionMsgItem {
    // V1 实现
    return {
        ...item,
        [prop]: value
    };

    // V2 实现（未来迁移时取消注释）
    // const currentVersionId = item.currentVersionId;
    // if (!currentVersionId || !item.versions) return { ...item };
    // 
    // return {
    //     ...item,
    //     versions: {
    //         ...item.versions,
    //         [currentVersionId]: {
    //             ...item.versions[currentVersionId],
    //             [prop]: value
    //         }
    //     }
    // };
}

/**
 * 设置 Message 属性（OpenAI 消息格式）
 */
export function setMessageProp<K extends MessageProps>(
    item: Readonly<IChatSessionMsgItem>,
    prop: K,
    value: IMessageLoose[K]
): IChatSessionMsgItem {
    if (!item.message) return { ...item };

    // V1 实现
    return {
        ...item,
        message: {
            ...item.message,
            [prop]: value
        }
    };

    // V2 实现（未来迁移时取消注释）
    // const currentVersionId = item.currentVersionId;
    // if (!currentVersionId || !item.versions) return { ...item };
    // 
    // const currentVersion = item.versions[currentVersionId];
    // if (!currentVersion?.message) return { ...item };
    // 
    // return {
    //     ...item,
    //     versions: {
    //         ...item.versions,
    //         [currentVersionId]: {
    //             ...currentVersion,
    //             message: {
    //                 ...currentVersion.message,
    //                 [prop]: value
    //             }
    //         }
    //     }
    // };
}

/**
 * 便捷 Toggle 函数
 */
export const toggleMsgHidden = (item: Readonly<IChatSessionMsgItem>): IChatSessionMsgItem => {
    return setMeta(item, 'hidden', !getMeta(item, 'hidden'));
};

export const toggleMsgPinned = (item: Readonly<IChatSessionMsgItem>): IChatSessionMsgItem => {
    return setMeta(item, 'pinned', !getMeta(item, 'pinned'));
};

export const updateMsgItem = (
    item: Readonly<IChatSessionMsgItem>,
    updates: Partial<IChatSessionMsgItem>
): IChatSessionMsgItem => {
    return { ...item, ...updates };
};

/**
 * 深度克隆
 */
export const cloneMsgItem = (item: Readonly<IChatSessionMsgItem>): IChatSessionMsgItem => {
    return structuredClone(item);
};

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
