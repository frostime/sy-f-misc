/*
 * 会话管理工具 - V2 Tree Model
 * 包含原 data-utils.ts 的功能
 * 纯函数，避免 mutation 操作
 *
 * 设计原则：
 * 1. 使用通用访问器 + 类型系统，而非为每个属性写独立函数
 * 2. 只支持 V2 Tree Model，强制类型系统检查迁移完整性
 * 3. 命名体系：
 *    - Meta: Item 的元数据（管理信息）
 *    - Payload: 消息的有效载荷（实际数据内容）
 *    - Message: OpenAI 消息格式
 * 4. V2 结构：
 *    - Payload 在 item.versions[currentVersionId] 中（IMessagePayload）
 *    - 支持树形结构（parent/children）
 *    - 支持多版本管理
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
type MetaProps = keyof IChatSessionMsgItemV2;

/**
 * Payload 属性 - 消息有效载荷（实际数据内容，随版本变化）
 * V1: 在 item 顶层
 * V2: 在 item.versions[versionId] 中（IMessagePayload）
 */
type PayloadProps = keyof IMessagePayload;

/**
 * Message 属性 - OpenAI 消息格式（在 Payload.message 中）
 * V1: item.message.xxx
 * V2: item.versions[versionId].message.xxx
 */
type MessageProps = keyof IMessageLoose;

// ============================================================================
// 核心访问器：基于类型的通用访问
// ============================================================================

/**
 * 获取 Meta 属性（Item 元数据）
 */
export function getMeta<K extends MetaProps>(
    item: Readonly<IChatSessionMsgItemV2>,
    prop: K
): IChatSessionMsgItemV2[K] {
    if (prop === 'role') {
        const role = item.role;
        if (role === undefined) {
            return getMessageProp(item, 'role') as IChatSessionMsgItemV2[K];
        }
    }
    return item[prop];
}

/**
 * 获取 Payload 属性（消息有效载荷）
 * 从 item.versions[currentVersionId] 读取
 */
export function getPayload<K extends PayloadProps>(
    item: Readonly<IChatSessionMsgItemV2>,
    prop: K
): IMessagePayload[K] | undefined {
    if (!item.currentVersionId || !item.versions) return undefined;

    const currentVersion = item.versions[item.currentVersionId];
    if (!currentVersion) return undefined;

    return currentVersion[prop];
}

/**
 * 获取 Message 属性（OpenAI 消息格式）
 * 从 item.versions[currentVersionId].message 读取
 */
export function getMessageProp<K extends MessageProps>(
    item: Readonly<IChatSessionMsgItemV2>,
    prop: K
): IMessageLoose[K] | undefined {
    if (!item.currentVersionId || !item.versions) return undefined;

    const currentVersion = item.versions[item.currentVersionId];
    if (!currentVersion?.message) return undefined;

    return currentVersion.message[prop];
}


// ============================================================================
// Setter 函数（保持不变性）
// ============================================================================

/**
 * 设置 Meta 属性（Item 元数据）
 */
export function setMeta<K extends MetaProps>(
    item: Readonly<IChatSessionMsgItemV2>,
    prop: K,
    value: IChatSessionMsgItemV2[K]
): IChatSessionMsgItemV2 {
    return {
        ...item,
        [prop]: value
    };
}

/**
 * 设置 Payload 属性（消息有效载荷）
 * 设置到 item.versions[currentVersionId]
 */
export function setPayload<K extends PayloadProps>(
    item: Readonly<IChatSessionMsgItemV2>,
    prop: K,
    value: IMessagePayload[K]
): IChatSessionMsgItemV2 {
    if (!item.currentVersionId) return item;

    return {
        ...item,
        versions: {
            ...item.versions,
            [item.currentVersionId]: {
                ...item.versions[item.currentVersionId],
                [prop]: value
            } as IMessagePayload
        }
    };
}

/**
 * 设置 Message 属性（OpenAI 消息格式）
 */
export function setMessageProp<K extends MessageProps>(
    item: Readonly<IChatSessionMsgItemV2>,
    prop: K,
    value: IMessageLoose[K]
): IChatSessionMsgItemV2 {
    if (!item.currentVersionId || !item.versions) return item;

    const currentVersion = item.versions[item.currentVersionId];
    if (!currentVersion?.message) return item;

    return {
        ...item,
        versions: {
            ...item.versions,
            [item.currentVersionId]: {
                ...currentVersion,
                message: {
                    ...currentVersion.message,
                    [prop]: value
                }
            } as IMessagePayload
        }
    };
}

/**
 * 便捷 Toggle 函数
 */
export const toggleMsgHidden = (item: Readonly<IChatSessionMsgItemV2>): IChatSessionMsgItemV2 => {
    return setMeta(item, 'hidden', !getMeta(item, 'hidden'));
};

export const toggleMsgPinned = (item: Readonly<IChatSessionMsgItemV2>): IChatSessionMsgItemV2 => {
    return setMeta(item, 'pinned', !getMeta(item, 'pinned'));
};

export const updateMsgItem = (
    item: Readonly<IChatSessionMsgItemV2>,
    updates: Partial<IChatSessionMsgItemV2>
): IChatSessionMsgItemV2 => {
    return { ...item, ...updates };
};

/**
 * 深度克隆
 */
export const cloneMsgItem = (item: Readonly<IChatSessionMsgItemV2>): IChatSessionMsgItemV2 => {
    return structuredClone(item);
};

export const checkHasToolChain = (item: Readonly<IChatSessionMsgItemV2>): boolean => {
    const toolChainResult = getPayload(item, 'toolChainResult');
    return (
        toolChainResult !== undefined &&
        toolChainResult.toolCallHistory.length > 0
    );
}

// ============================================================================
// Version Management
// ============================================================================

/**
 * 将当前 message 存储到 versions 中
 * @deprecated V2 中应使用 TreeModel.addVersion()
 */
export function stageMsgItemVersion(
    item: Readonly<IChatSessionMsgItemV2>,
    version?: string
): IChatSessionMsgItemV2 {
    const message = getPayload(item, 'message');
    if (!message) {
        return item;
    }

    const versionId = version ?? (item.currentVersionId ?? Date.now().toString());
    const author = getPayload(item, 'author');
    const timestamp = getPayload(item, 'timestamp');
    const token = getPayload(item, 'token');
    const time = getPayload(item, 'time');
    const userPromptSlice = getPayload(item, 'userPromptSlice');
    const toolChainResult = getPayload(item, 'toolChainResult');

    return {
        ...item,
        versions: {
            ...(item.versions || {}),
            [versionId]: {
                id: versionId,
                message: message,
                author,
                timestamp,
                token,
                time,
                userPromptSlice,
                toolChainResult
            }
        },
        currentVersionId: versionId
    };
}

/**
 * 应用指定版本到当前 message
 * @deprecated V2 中应使用 TreeModel.switchVersion()
 */
export function applyMsgItemVersion(
    item: Readonly<IChatSessionMsgItemV2>,
    version: string
): IChatSessionMsgItemV2 {
    if (!item.versions || !item.versions[version]) {
        return item;
    }

    return {
        ...item,
        currentVersionId: version
    };
}

/**
 * 检查是否有多个版本
 */
export function isMsgItemWithMultiVersion(item: Readonly<IChatSessionMsgItemV2>): boolean {
    return item.versions !== undefined && Object.keys(item.versions).length > 1;
}

/**
 * 合并所有版本为一个文本（用于显示）
 */
export function mergeMultiVersion(item: Readonly<IChatSessionMsgItemV2>): string {
    const allVersions = Object.values(item.versions || {});
    if (!allVersions.length) {
        const message = getPayload(item, 'message');
        if (!message) return '';
        return extractContentText(message.content);
    }

    let mergedContent = '以下是对同一个问题的不同回复:\n\n';
    allVersions.forEach((v, index) => {
        if (v.message) {
            mergedContent += formatSingleItem(
                v.message.role.toUpperCase(),
                extractContentText(v.message.content),
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
 * 从 IChatSessionMsgItemV2 中提取用户实际输入（去除上下文）
 */
export function splitPromptFromContext(item: Readonly<IChatSessionMsgItemV2>) {
    const message = getPayload(item, 'message');
    if (!message) return { contextPrompt: '', userPrompt: '', userPromptSlice: [0, 0] as [number, number] };
    const content = extractContentText(message.content);

    const parts = {
        contextPrompt: '',
        userPrompt: '',
        userPromptSlice: [0, 0] as [number, number]
    }

    const userPromptSlice = getPayload(item, 'userPromptSlice');
    if (userPromptSlice) {
        const [start, end] = userPromptSlice;
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
 * 检查消息项是否为空
 */
export function isMsgItemEmpty(item: Readonly<IChatSessionMsgItemV2>): boolean {
    if (item.type !== 'message') return true;
    const message = getPayload(item, 'message');
    if (!message) return true;
    const text = extractContentText(message.content);
    return text.trim() === '';
}
