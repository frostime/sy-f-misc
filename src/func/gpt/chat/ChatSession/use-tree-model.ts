/**
 * V2 树形消息模型 Hook
 * 
 * 设计原则：
 * 1. 内部维护 nodes + worldLine 树结构
 * 2. 对外暴露 messages() 只读 Accessor，兼容现有 UI
 * 3. 所有写操作通过专门方法，自动维护树的一致性
 */

import { Accessor, batch, createMemo } from 'solid-js';
import { useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

// ============================================================================
// 类型定义
// ============================================================================

type ItemID = string;

/**
 * TreeModel 对外接口
 */
export interface ITreeModel {
    // ========== 只读访问 ==========
    /** 当前世界线的消息列表（只读，用于 UI 渲染） */
    messages: Accessor<IChatSessionMsgItemV2[]>;
    /** 消息数量 */
    count: Accessor<number>;
    /** 是否有消息 */
    hasMessages: Accessor<boolean>;
    /** 获取所有节点 */
    getNodes: () => Record<ItemID, IChatSessionMsgItemV2>;
    /** 获取世界线 */
    getWorldLine: () => ItemID[];
    /** 获取根节点 ID */
    getRootId: () => ItemID | null;
    /** 获取书签 */
    getBookmarks: () => ItemID[];

    // ========== 节点访问 ==========
    /** 按 ID 获取节点 */
    getNodeById: (id: ItemID) => IChatSessionMsgItemV2 | undefined;
    /** 按索引获取节点（worldLine 中的位置） */
    getNodeAt: (index: number) => IChatSessionMsgItemV2 | undefined;
    /** 获取节点在 worldLine 中的索引 */
    indexOf: (id: ItemID) => number;

    getNode: (get: { index: number } | { id: ItemID }) => IChatSessionMsgItemV2 | undefined;
    getRawNode: (get: { index: number } | { id: ItemID }, clone?: boolean) => IChatSessionMsgItemV2 | undefined;

    // ========== 写操作 ==========
    /** 在末尾追加节点 */
    appendNode: (node: Omit<IChatSessionMsgItemV2, 'parent' | 'children'>) => void;
    /** 在指定位置后插入节点 */
    insertAfter: (afterId: ItemID, node: Omit<IChatSessionMsgItemV2, 'parent' | 'children'>) => void;
    /** 更新节点 */
    updateNode: (id: ItemID, updates: Partial<IChatSessionMsgItemV2>) => void;
    /** 更新节点的 Payload（当前版本） */
    updatePayload: (id: ItemID, updates: Partial<IMessagePayload>) => void;
    /** 删除节点（及其后续） */
    deleteNode: (id: ItemID, keepChildren?: boolean) => void;
    /** 批量删除 */
    deleteNodes: (ids: ItemID[]) => void;

    // ========== 分支操作 ==========
    /** 在指定节点创建新分支 */
    createBranch: (atId: ItemID, newChildContent?: Partial<IChatSessionMsgItemV2>) => ItemID | null;
    /** 切换到另一条世界线（通过指定叶子节点） */
    switchWorldLine: (targetLeafId: ItemID) => void;
    /** 获取节点的所有分支（子节点） */
    getBranches: (id: ItemID) => IChatSessionMsgItemV2[];

    // ========== 版本管理 ==========
    /** 添加新版本到节点 */
    addVersion: (id: ItemID, payload: IMessagePayload) => void;
    /** 切换节点的当前版本 */
    switchVersion: (id: ItemID, versionId: string) => void;
    /** 删除版本 */
    deleteVersion: (id: ItemID, versionId: string) => void;

    // ========== 序列化 ==========
    /** 导出为 V2 History 格式 */
    toHistory: (meta: {
        id: string;
        title: string;
        timestamp: number;
        updated: number;
        tags?: string[];
        sysPrompt?: string;
        customOptions?: Record<string, any>;
    }) => IChatSessionHistoryV2;
    /** 从 V2 History 加载 */
    fromHistory: (history: IChatSessionHistoryV2) => void;
    /** 清空 */
    clear: () => void;
}

// ============================================================================
// 辅助函数
// ============================================================================

const generateId = (): string => window.Lute.NewNodeID();

/**
 * 从叶子节点向上追溯到根，返回完整路径
 */
const traceToRoot = (
    nodes: Record<ItemID, IChatSessionMsgItemV2>,
    leafId: ItemID
): ItemID[] => {
    const path: ItemID[] = [];
    let currentId: ItemID | null = leafId;

    while (currentId) {
        path.unshift(currentId);
        currentId = nodes[currentId]?.parent ?? null;
    }

    return path;
};

// ============================================================================
// Hook 实现
// ============================================================================

export const useTreeModel = (): ITreeModel => {
    // 内部状态
    const nodes = useStoreRef<Record<ItemID, IChatSessionMsgItemV2>>({});
    const rootId = useSignalRef<ItemID | null>(null);
    const worldLine = useStoreRef<ItemID[]>([]);
    const bookmarks = useStoreRef<ItemID[]>([]);

    // ========== 派生状态 ==========

    /**
     * messages: 当前世界线的有序消息列表
     * 这是核心的只读接口，UI 组件应该使用这个
     */
    const messages = createMemo(() => {
        return worldLine().map(id => nodes()[id]).filter(Boolean);
    });

    const count = createMemo(() => worldLine().length);
    const hasMessages = createMemo(() => worldLine().length > 0);

    // ========== 读取方法 ==========

    const getNodes = () => nodes();
    const getWorldLine = () => worldLine();
    const getRootId = () => rootId();
    const getBookmarks = () => bookmarks();

    const getNodeById = (id: ItemID) => nodes()[id];
    const getNodeAt = (index: number) => {
        const id = worldLine()[index];
        return id ? nodes()[id] : undefined;
    };
    const indexOf = (id: ItemID) => worldLine().indexOf(id);

    const getNode = (get: { index: number } | { id: ItemID }) => {
        let node = ('id' in get) ? getNodeById(get.id) : getNodeAt(get.index);
        if (!node) return node;
        return node
    }
    const getRawNode = (get: { index: number } | { id: ItemID }, clone?: boolean) => {
        let id = ('id' in get) ? get.id : worldLine()[get.index];
        if (!id) return undefined;
        const raw = nodes.unwrap()[id];
        if (!raw) return undefined;
        // return raw;
        if (clone === true) {
            return structuredClone(raw);
        }
        return raw;
    }

    // ========== 写入方法 ==========

    const appendNode = (nodeData: Omit<IChatSessionMsgItemV2, 'parent' | 'children'>) => {
        const currentWorldLine = worldLine();
        const parentId = currentWorldLine.length > 0 ? currentWorldLine[currentWorldLine.length - 1] : null;

        const node: IChatSessionMsgItemV2 = {
            ...nodeData,
            parent: parentId,
            children: [],
        };

        batch(() => {
            // 添加节点
            nodes.update(prev => ({ ...prev, [node.id]: node }));

            // 更新父节点的 children
            if (parentId) {
                nodes.update(parentId, 'children', (prev: ItemID[]) => [...prev, node.id]);
            }

            // 更新 rootId（如果是第一个节点）
            if (!rootId()) {
                rootId.value = node.id;
            }

            // 更新 worldLine
            worldLine.update(prev => [...prev, node.id]);
        });
    };

    const insertAfter = (afterId: ItemID, nodeData: Omit<IChatSessionMsgItemV2, 'parent' | 'children'>) => {
        const afterIndex = worldLine().indexOf(afterId);
        if (afterIndex === -1) {
            // 找不到则追加到末尾
            appendNode(nodeData);
            return;
        }

        const node: IChatSessionMsgItemV2 = {
            ...nodeData,
            parent: afterId,
            children: [],
        };

        batch(() => {
            // 获取 afterNode 的原有子节点（在 worldLine 中的后续）
            const afterNode = nodes()[afterId];
            const nextInWorldLine = worldLine()[afterIndex + 1];

            // 如果后续节点是 afterNode 的子节点，需要重新链接
            if (nextInWorldLine && afterNode.children.includes(nextInWorldLine)) {
                // 新节点成为中间节点
                node.children = [nextInWorldLine];
                nodes.update(nextInWorldLine, 'parent', node.id);
                nodes.update(afterId, 'children', (prev: ItemID[]) =>
                    prev.map(c => c === nextInWorldLine ? node.id : c)
                );
            } else {
                // 新节点添加为 afterNode 的子节点
                nodes.update(afterId, 'children', (prev: ItemID[]) => [...prev, node.id]);
            }

            // 添加节点
            nodes.update(prev => ({ ...prev, [node.id]: node }));

            // 更新 worldLine
            worldLine.update(prev => {
                const newWorldLine = [...prev];
                newWorldLine.splice(afterIndex + 1, 0, node.id);
                return newWorldLine;
            });
        });
    };

    const updateNode = (id: ItemID, updates: Partial<IChatSessionMsgItemV2>) => {
        if (!nodes()[id]) return;
        nodes.update(id, prev => ({ ...prev, ...updates }));
    };

    /**
     * 更新节点的当前版本 Payload
     * 
     * @warning 浅合并！调用方必须传入完整的嵌套对象。
     * 
     * 示例：
     * ```typescript
     * // ✅ 正确：传入完整的嵌套对象
     * updatePayload(id, { 
     *   message: { role: 'user', content: '...' } 
     * })
     * 
     * // ❌ 错误：嵌套对象会被覆盖
     * updatePayload(id, { message: { content: '...' } })
     * // 这会丢失 message.role 等其他字段！
     * ```
     */
    const updatePayload = (id: ItemID, updates: Partial<IMessagePayload>) => {
        const node = nodes()[id];
        if (!node || !node.currentVersionId) return;

        nodes.update(id, 'versions', node.currentVersionId, (prev: IMessagePayload) => ({
            ...prev,
            ...updates,
        }));
    };

    const deleteNode = (id: ItemID, keepChildren = false) => {
        const node = nodes()[id];
        if (!node) return;

        batch(() => {
            const idsToDelete = new Set<ItemID>([id]);

            if (!keepChildren) {
                // 收集所有后代节点
                const collectDescendants = (nodeId: ItemID) => {
                    const n = nodes()[nodeId];
                    if (!n) return;
                    n.children.forEach(childId => {
                        idsToDelete.add(childId);
                        collectDescendants(childId);
                    });
                };
                collectDescendants(id);
            }

            // 更新父节点的 children
            if (node.parent) {
                nodes.update(node.parent, 'children', (prev: ItemID[]) =>
                    prev.filter(c => c !== id)
                );
            }

            // 如果保留子节点，重新链接到父节点
            if (keepChildren && node.children.length > 0) {
                node.children.forEach(childId => {
                    nodes.update(childId, 'parent', node.parent);
                    if (node.parent) {
                        nodes.update(node.parent, 'children', (prev: ItemID[]) => [...prev, childId]);
                    }
                });
            }

            // 删除节点
            // nodes.update(prev => {
            //     const newNodes = { ...prev };
            //     idsToDelete.forEach(delId => delete newNodes[delId]);
            //     return newNodes;
            // });
            nodes.update(prev =>
                Object.fromEntries(
                    Object.entries(prev).filter(([id]) => !idsToDelete.has(id))
                )
            );


            // 更新 worldLine
            worldLine.update(prev => prev.filter(wid => !idsToDelete.has(wid)));

            // 更新 rootId
            if (idsToDelete.has(rootId()!)) {
                const newWorldLine = worldLine();
                rootId.value = newWorldLine[0] ?? null;
            }

            // 更新 bookmarks
            bookmarks.update(prev => prev.filter(bid => !idsToDelete.has(bid)));
        });
    };

    const deleteNodes = (ids: ItemID[]) => {
        batch(() => {
            ids.forEach(id => deleteNode(id));
        });
    };

    // ========== 分支操作 ==========

    const createBranch = (atId: ItemID, newChildContent?: Partial<IChatSessionMsgItemV2>): ItemID | null => {
        const atNode = nodes()[atId];
        if (!atNode) return null;

        const newId = generateId();
        const timestamp = Date.now();

        // 创建新分支节点
        const newNode: IChatSessionMsgItemV2 = {
            id: newId,
            type: 'message',
            role: 'user',
            currentVersionId: `v_${newId}`,
            versions: {
                [`v_${newId}`]: {
                    id: `v_${newId}`,
                    message: { role: 'user', content: '' },
                    author: 'user',
                    timestamp,
                },
            },
            parent: atId,
            children: [],
            ...newChildContent,
        };

        batch(() => {
            // 添加新节点
            nodes.update(prev => ({ ...prev, [newId]: newNode }));

            // 更新父节点的 children
            nodes.update(atId, 'children', (prev: ItemID[]) => [...prev, newId]);

            // 切换 worldLine 到新分支
            const atIndex = worldLine().indexOf(atId);
            if (atIndex !== -1) {
                worldLine.update(prev => [...prev.slice(0, atIndex + 1), newId]);
            }
        });

        return newId;
    };

    const switchWorldLine = (targetLeafId: ItemID) => {
        const currentNodes = nodes();
        if (!currentNodes[targetLeafId]) return;

        const newPath = traceToRoot(currentNodes, targetLeafId);
        worldLine.update(newPath);
    };

    const getBranches = (id: ItemID): IChatSessionMsgItemV2[] => {
        const node = nodes()[id];
        if (!node) return [];
        return node.children.map(childId => nodes()[childId]).filter(Boolean);
    };

    // ========== 版本管理 ==========

    const addVersion = (id: ItemID, payload: IMessagePayload) => {
        const node = nodes()[id];
        if (!node) return;

        batch(() => {
            nodes.update(id, 'versions', prev => ({
                ...prev,
                [payload.id]: payload,
            }));
            nodes.update(id, 'currentVersionId', payload.id);
        });
    };

    const switchVersion = (id: ItemID, versionId: string) => {
        const node = nodes()[id];
        if (!node || !node.versions[versionId]) return;
        nodes.update(id, 'currentVersionId', versionId);
    };

    const deleteVersion = (id: ItemID, versionId: string) => {
        const node = nodes()[id];
        if (!node || !node.versions[versionId]) return;

        const versionKeys = Object.keys(node.versions);
        if (versionKeys.length <= 1) return; // 不能删除最后一个版本

        batch(() => {
            // 如果删除的是当前版本，切换到另一个
            if (node.currentVersionId === versionId) {
                const newVersionId = versionKeys.find(k => k !== versionId)!;
                nodes.update(id, 'currentVersionId', newVersionId);
            }

            nodes.update(id, 'versions', prev => {
                const newVersions = { ...prev };
                delete newVersions[versionId];
                return newVersions;
            });
        });
    };

    // ========== 序列化 ==========

    const toHistory = (meta: {
        id: string;
        title: string;
        timestamp: number;
        updated: number;
        tags?: string[];
        sysPrompt?: string;
        customOptions?: Record<string, any>;
    }): IChatSessionHistoryV2 => {
        return {
            schema: 2,
            type: 'history',
            ...meta,
            nodes: structuredClone(nodes.unwrap()),
            worldLine: [...worldLine.unwrap()],
            bookmarks: [...bookmarks.unwrap()],
            rootId: rootId(),
        };
    };

    const fromHistory = (history: IChatSessionHistoryV2) => {
        batch(() => {
            rootId.value = history.rootId ?? null;
            // nodes.update(history.nodes || {});
            // worldLine.update(history.worldLine || []);
            // bookmarks.update(history.bookmarks || []);
            nodes.update(structuredClone(history.nodes || {}));
            worldLine.update([...(history.worldLine || [])]);
            bookmarks.update([...(history.bookmarks || [])]);
        });
    };

    const clear = () => {
        batch(() => {
            nodes.update({});
            rootId.value = null;
            worldLine.update([]);
            bookmarks.update([]);
        });
    };

    return {
        // 只读访问
        messages,
        count,
        hasMessages,
        getNodes,
        getWorldLine,
        getRootId,
        getBookmarks,

        // 节点访问
        getNodeById,
        getNodeAt,
        indexOf,
        getNode,
        getRawNode,

        // 写操作
        appendNode,
        insertAfter,
        updateNode,
        updatePayload,
        deleteNode,
        deleteNodes,

        // 分支操作
        createBranch,
        switchWorldLine,
        getBranches,

        // 版本管理
        addVersion,
        switchVersion,
        deleteVersion,

        // 序列化
        toHistory,
        fromHistory,
        clear,
    };
};
