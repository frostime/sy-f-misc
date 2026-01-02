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
 * 删除操作结果
 */
export interface IDeleteResult {
    success: boolean;
    reason?: 'NODE_NOT_FOUND' | 'ROOT_HAS_BRANCHES' | 'BRANCH_COMPRESSION' | 'NOT_ON_WORLDLINE' | 'NOT_CONTINUOUS' | 'MIDDLE_HAS_BRANCH' | 'EMPTY';
}

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
    // getBookmarks: () => ItemID[];
    getBookmarks: () => Record<ItemID, string>;

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
    /** 删除节点（安全删除，返回操作结果） */
    deleteNode: (id: ItemID) => IDeleteResult;
    /** 批量删除（必须连续且中间无分支） */
    deleteNodes: (ids: ItemID[]) => IDeleteResult;

    // ========== 分支操作 ==========
    /** 在指定节点处截断 worldLine，准备创建分支 */
    forkAt: (atId: ItemID) => ItemID | null;
    /** 获取节点的分支数（children 数量） */
    getBranchCount: (id: ItemID) => number;
    /** 判断节点是否有多个分支 */
    hasMultipleBranches: (id: ItemID) => boolean;
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
    // const bookmarks = useStoreRef<ItemID[]>([]);
    const bookmarks = useStoreRef<Record<ItemID, string>>({});

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
     */
    const updatePayload = (id: ItemID, updates: Partial<IMessagePayload>) => {
        const node = nodes()[id];
        if (!node || !node.currentVersionId) return;

        // 替换整个节点，更新特定版本的 payload
        // 要以节点为粒度更新，不然无法触发 version 的响应式
        nodes.update(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                versions: {
                    ...prev[id].versions,
                    [node.currentVersionId]: {
                        ...prev[id].versions[node.currentVersionId],
                        ...updates,
                    },
                },
            }
        }));
    };
/**
### 单节点删除 (`deleteNode`)

| 情况                | 条件      | 行为                          | 验证 |
| ----------------- | ------- | --------------------------- | -- |
| ¬A ∧ ¬B           | 无兄弟，无分支 | 删除，children 重连              | ✅  |
| ¬A ∧ B            | 无兄弟，有分支 | 删除，多 children 全部重连到 parent  | ✅  |
| A ∧ ¬B            | 有兄弟，无分支 | 删除，child 并入 parent.children | ✅  |
| A ∧ B             | 有兄弟，有分支 | 禁止（BRANCH_COMPRESSION）      | ✅  |
| Root + 多 children | —       | 禁止（ROOT_HAS_BRANCHES）       | ✅  |
| Root + 单 child    | —       | 删除，child 成为新 root           | ✅  |
| Root + 无 child    | —       | 删除，rootId = null            | ✅  |

### 批量删除 (`deleteNodes`)

校验链完整：

1. `NOT_ON_WORLDLINE` — 所有 ID 必须在当前世界线上
2. `NOT_CONTINUOUS` — 必须连续
3. `MIDDLE_HAS_BRANCH` — 中间节点不能有分支
4. 从后往前逐个调用 `deleteNode`

## 一个小观察

`validateBatchDelete` 中的 "中间节点不能有分支" 检查（`MIDDLE_HAS_BRANCH`）实际上是一个**保守策略**。

从纯粹的树操作角度，即使中间节点有分支（但这些分支不在当前 worldLine 上），删除操作也是安全的——分支会被正确重连。但禁止这种情况可以：

1. 避免用户误删导致意外的拓扑变化
2. 让用户明确意识到存在分支
 */

    /**
     * 安全删除单个节点
     * 规则：
     * - Root 有多个 children 时禁止删除
     * - A ∧ B（有兄弟且有分支）时禁止删除，避免分支压缩
     * - 其他情况：删除节点，children 重连到 parent
     */
    const deleteNode = (id: ItemID): IDeleteResult => {
        const node = nodes()[id];
        if (!node) return { success: false, reason: 'NODE_NOT_FOUND' };

        const isRoot = node.parent === null;
        const hasMultipleChildren = node.children.length > 1;  // B
        const hasSiblings = node.parent
            ? nodes()[node.parent].children.length > 1
            : false;  // A

        // Root 特殊处理：有多个 children 时禁止删除
        if (isRoot && hasMultipleChildren) {
            return { success: false, reason: 'ROOT_HAS_BRANCHES' };
        }

        // A ∧ B: 危险操作，禁止分支压缩
        if (hasSiblings && hasMultipleChildren) {
            return { success: false, reason: 'BRANCH_COMPRESSION' };
        }

        // 执行删除（¬A∧¬B, ¬A∧B, A∧¬B 三种情况统一处理）
        batch(() => {
            const parentId = node.parent;

            // 1. 从父节点移除自己
            if (parentId) {
                nodes.update(parentId, 'children', (prev: ItemID[]) =>
                    prev.filter(c => c !== id)
                );
            }

            // 2. 子节点重连到父节点
            node.children.forEach(childId => {
                nodes.update(childId, 'parent', parentId);
                if (parentId) {
                    nodes.update(parentId, 'children', (prev: ItemID[]) =>
                        [...prev, childId]
                    );
                }
            });

            // 3. 删除节点本身
            nodes.update(prev => {
                const { [id]: _, ...rest } = prev;
                return rest;
            });

            // 4. 更新 worldLine
            worldLine.update(prev => prev.filter(wid => wid !== id));

            // 5. 更新 rootId（如果删除的是 root 且只有一个 child）
            if (isRoot && node.children.length === 1) {
                rootId.value = node.children[0];
            } else if (isRoot && node.children.length === 0) {
                rootId.value = null;
            }

            // 6. 更新 bookmarks
            bookmarks.update(prev => {
                const { [id]: _, ...rest } = prev;
                return rest;
            });
        });

        return { success: true };
    };

    /**
     * 批量删除前置校验
     * 规则：
     * 1. 必须都在 worldLine 上
     * 2. 必须连续
     * 3. 中间节点不能有分支
     */
    const validateBatchDelete = (ids: ItemID[]): IDeleteResult => {
        if (ids.length === 0) return { success: false, reason: 'EMPTY' };
        if (ids.length === 1) return { success: true };

        const wl = worldLine();
        const indices = ids.map(id => wl.indexOf(id)).filter(i => i !== -1);

        // 条件 1: 必须都在 worldLine 上
        if (indices.length !== ids.length) {
            return { success: false, reason: 'NOT_ON_WORLDLINE' };
        }

        // 条件 2: 必须连续
        indices.sort((a, b) => a - b);
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] !== indices[i - 1] + 1) {
                return { success: false, reason: 'NOT_CONTINUOUS' };
            }
        }

        // 条件 3: 中间节点不能有分支
        const head = indices[0];
        const tail = indices[indices.length - 1];
        for (let i = head + 1; i < tail; i++) {
            const node = nodes()[wl[i]];
            if (node && node.children.length > 1) {
                return { success: false, reason: 'MIDDLE_HAS_BRANCH' };
            }
        }

        return { success: true };
    };

    /**
     * 批量删除节点
     * 先校验连续性和分支，通过后从后往前逐个删除
     */
    const deleteNodes = (ids: ItemID[]): IDeleteResult => {
        const validation = validateBatchDelete(ids);
        if (!validation.success) {
            return validation;
        }

        // 按 worldLine 顺序排序，从后往前删除更安全
        const wl = worldLine();
        const sortedIds = [...ids].sort((a, b) => wl.indexOf(b) - wl.indexOf(a));

        batch(() => {
            for (const id of sortedIds) {
                const result = deleteNode(id);
                if (!result.success) {
                    // 理论上不应该失败，因为已经校验过
                    console.warn(`Failed to delete node ${id}:`, result.reason);
                }
            }
        });

        return { success: true };
    };

    // ========== 分支操作 ==========

    /**
     * 在指定节点处创建分支（截断 worldLine）
     * @param atId 分支起点节点 ID
     * @returns 分支起点 ID，失败返回 null
     */
    const forkAt = (atId: ItemID): ItemID | null => {
        const atNode = nodes()[atId];
        if (!atNode) return null;

        const atIndex = worldLine().indexOf(atId);
        if (atIndex === -1) return null;

        // 截断 worldLine 到 atId（包含 atId）
        worldLine.update(prev => prev.slice(0, atIndex + 1));

        return atId;
    };

    /**
     * 获取节点的分支数
     */
    const getBranchCount = (id: ItemID): number => {
        const node = nodes()[id];
        if (!node) return 0;
        return node.children.length;
    };

    /**
     * 判断节点是否有多个分支
     */
    const hasMultipleBranches = (id: ItemID): boolean => {
        return getBranchCount(id) > 1;
    };

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

        // 替换整个节点
        nodes.update(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                versions: {
                    ...prev[id].versions,
                    [payload.id]: payload,
                },
                currentVersionId: payload.id,
            }
        }));
    };

    const switchVersion = (id: ItemID, versionId: string) => {
        const node = nodes()[id];
        if (!node || !node.versions[versionId]) return;

        // 替换整个节点
        nodes.update(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                currentVersionId: versionId,
            }
        }));
    };

    const deleteVersion = (id: ItemID, versionId: string) => {
        const node = nodes()[id];
        if (!node || !node.versions[versionId]) return;

        const versionKeys = Object.keys(node.versions);
        if (versionKeys.length <= 1) return; // 不能删除最后一个版本

        // 构建新的 versions 对象
        const newVersions = { ...node.versions };
        delete newVersions[versionId];

        // 确定新的 currentVersionId
        const newCurrentVersionId = node.currentVersionId === versionId
            ? versionKeys.find(k => k !== versionId)!
            : node.currentVersionId;

        // 关键：替换整个节点，而不是路径更新
        // 这会创建新的对象引用，让 <For> 检测到变化
        nodes.update(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                versions: newVersions,
                currentVersionId: newCurrentVersionId,
            }
        }));
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
        let nodesData: Record<ItemID, IChatSessionMsgItemV2> = {};
        try {
            nodesData = structuredClone(nodes.unwrap());
        } catch (e) {
            console.error('Failed to clone nodes for history export:', e);
            return null;
        }
        const history = {
            schema: 2,
            type: 'history',
            ...meta,
            nodes: nodesData,
            worldLine: [...worldLine.unwrap()],
            bookmarks: { ...bookmarks.unwrap() },
            rootId: rootId(),
        } satisfies IChatSessionHistoryV2;
        return history;
    };

    const fromHistory = (history: IChatSessionHistoryV2) => {
        batch(() => {
            rootId.value = history.rootId ?? null;
            // nodes.update(history.nodes || {});
            // worldLine.update(history.worldLine || []);
            // bookmarks.update(history.bookmarks || []);
            nodes.update(structuredClone(history.nodes || {}));
            worldLine.update([...(history.worldLine || [])]);
            // bookmarks.update([...(history.bookmarks || {})]);
            bookmarks.update(structuredClone(history.bookmarks || {}));
        });
    };

    const clear = () => {
        batch(() => {
            nodes.update({});
            rootId.value = null;
            worldLine.update([]);
            // bookmarks.update([]);
            bookmarks.update({});
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
        forkAt,
        getBranchCount,
        hasMultipleBranches,
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
