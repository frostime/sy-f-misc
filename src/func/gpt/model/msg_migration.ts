// src/func/gpt/model/msg_migration.ts
/**
 * V1 → V2 历史记录迁移模块
 * 
 * 设计原则：
 * 1. 读时迁移：每次读取旧格式自动转换，不自动回写
 * 2. 渐进兼容：支持 V0(无schema) → V1 → V2 的迁移路径
 * 3. 边缘情况：妥善处理各种异常数据
 */

// ============================================================================
// Schema 版本管理
// ============================================================================

export const HISTORY_SCHEMA_CURRENT = 2;

/**
 * 检测历史记录的 schema 版本
 * @returns 0 = 未知格式, 1 = V1(items数组), 2 = V2(nodes树)
 */
export function detectHistorySchema(data: any): number {
    if (!data || typeof data !== 'object') return 0;

    // 显式声明的 schema
    if (typeof data.schema === 'number') return data.schema;

    // V2 特征检测：有 nodes 和 worldLine
    if (data.nodes && Array.isArray(data.worldLine) && data.rootId !== undefined) {
        return 2;
    }

    // V1 特征检测：有 items 数组
    if (Array.isArray(data.items)) {
        return 1;
    }

    return 0;
}

export const isV1History = (history: IChatSessionHistory | IChatSessionHistoryV2): history is IChatSessionHistory => {
    return detectHistorySchema(history) === 1;
}

export const isV2History = (history: IChatSessionHistory | IChatSessionHistoryV2): history is IChatSessionHistoryV2 => {
    return detectHistorySchema(history) === 2;
}

/**
 * 判断是否需要迁移
 */
export function needsMigration(data: any): boolean {
    return detectHistorySchema(data) < HISTORY_SCHEMA_CURRENT;
}

/**
 * 统一迁移入口
 */
export function migrateHistory(data: any): IChatSessionHistoryV2 {
    const schema = detectHistorySchema(data);

    if (schema === 2) return data as IChatSessionHistoryV2;
    if (schema === 1) return migrateHistoryV1ToV2(data as IChatSessionHistory);

    // 未知格式，尝试作为空会话处理
    console.warn('[Migration] Unknown history schema, creating empty session');
    return createEmptyHistoryV2(data?.id || generateId(), data?.title || '未知会话');
}

/**
 * 创建空的 V2 历史记录
 */
export function createEmptyHistoryV2(id: string, title: string): IChatSessionHistoryV2 {
    return {
        schema: 2,
        type: 'history',
        id,
        title,
        timestamp: Date.now(),
        updated: Date.now(),
        tags: [],
        sysPrompt: '',
        customOptions: {},
        nodes: {},
        rootId: null,
        worldLine: [],
        bookmarks: [],
    };
}

// ============================================================================
// V1 → V2 迁移实现
// ============================================================================

function migrateHistoryV1ToV2(v1: IChatSessionHistory): IChatSessionHistoryV2 {
    // 空会话处理
    if (!v1.items || v1.items.length === 0) {
        return createEmptyHistoryV2(v1.id, v1.title);
    }

    const nodes: Record<ItemID, IChatSessionMsgItemV2> = {};
    const worldLine: ItemID[] = [];
    let prevId: ItemID | null = null;

    for (const item of v1.items) {
        // 边缘情况：item.id 不存在（极旧数据）
        const itemId = item.id || generateId();

        // 1. 兼容旧数据的拼写错误 seperator → separator
        const nodeType = (item.type as string) === 'seperator' ? 'separator' : item.type;

        // 2. 构建 Versions
        const versions: Record<string, IMessagePayload> = {};
        let currentVersionId = '';

        // 仅 Message 类型需要构建 Version
        if (nodeType === 'message') {
            if (item.versions && Object.keys(item.versions).length > 0) {
                // Case A: V1 已经是多版本结构 (V1 后期特性)
                for (const [verId, ver] of Object.entries(item.versions)) {
                    const validVerId = verId || generateId();
                    const isCurrent = validVerId === item.currentVersion;

                    versions[validVerId] = {
                        id: validVerId,
                        message: {
                            role: item.message?.role ?? 'user',
                            content: ver.content ?? '',
                            reasoning_content: ver.reasoning_content,
                            tool_calls: item.message?.tool_calls,
                            tool_call_id: item.message?.tool_call_id,
                            name: item.message?.name,
                            refusal: item.message?.refusal,
                        },
                        author: ver.author ?? item.author,
                        timestamp: ver.timestamp ?? item.timestamp,
                        token: ver.token ?? (isCurrent ? item.token : undefined),
                        time: ver.time ?? (isCurrent ? item.time : undefined),
                        userPromptSlice: item.userPromptSlice,
                        usage: isCurrent ? item.usage : undefined,
                        toolChainResult: isCurrent ? item.toolChainResult : undefined,
                    };
                }
                currentVersionId = item.currentVersion ?? Object.keys(versions)[0];
            } else if (item.message) {
                // Case B: V1 普通单消息
                const verId = 'v_' + generateId();
                versions[verId] = {
                    id: verId,
                    message: { ...item.message },
                    author: item.author,
                    timestamp: item.timestamp,
                    token: item.token,
                    usage: item.usage,
                    time: item.time,
                    userPromptSlice: item.userPromptSlice,
                    toolChainResult: item.toolChainResult,
                };
                currentVersionId = verId;
            } else {
                // Case B2: message 类型但无 message 字段（异常数据）
                console.warn(`[Migration] Item ${itemId} is 'message' type but has no message field`);
                const verId = 'v_' + generateId();
                versions[verId] = {
                    id: verId,
                    message: { role: 'user', content: '' },
                    author: item.author || 'unknown',
                    timestamp: item.timestamp || Date.now(),
                };
                currentVersionId = verId;
            }
        }
        // Case C: Separator → versions={}, currentVersionId=''

        // 3. 构建 V2 Node
        const v2Node: IChatSessionMsgItemV2 = {
            id: itemId,
            type: nodeType as 'message' | 'separator',

            role: item.message?.role ?? '',
            name: item.message?.name,

            currentVersionId,
            versions,

            parent: prevId,
            children: [],

            context: item.context,
            multiModalAttachments: item.multiModalAttachments,

            hidden: item.hidden,
            pinned: item.pinned,
            loading: false, // 迁移时重置 loading 状态

            attachedItems: item.attachedItems,
            attachedChars: item.attachedChars,
        };

        nodes[itemId] = v2Node;
        worldLine.push(itemId);

        // 4. 建立父子关联
        if (prevId && nodes[prevId]) {
            nodes[prevId].children.push(itemId);
        }

        prevId = itemId;
    }

    return {
        schema: 2,
        type: 'history',
        id: v1.id,
        title: v1.title,
        timestamp: v1.timestamp,
        updated: v1.updated,
        tags: v1.tags,
        sysPrompt: v1.sysPrompt,
        customOptions: v1.customOptions,
        modelBareId: undefined,
        nodes,
        rootId: worldLine[0] ?? null,
        worldLine,
        bookmarks: [],
    };
}

// ============================================================================
// 辅助函数
// ============================================================================

function generateId(): string {
    return window.Lute.NewNodeID();
}
