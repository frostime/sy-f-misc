/**
 * V2 TreeModel 适配层
 * 
 * 将 ITreeModel 的接口适配为旧的消息管理接口
 * 用于平滑过渡，保持外部 API 兼容
 */

import { batch } from 'solid-js';
import { showMessage } from 'siyuan';
import { ITreeModel } from './use-tree-model';
import { 
    mergeInputWithContext,
    getMeta,
    getPayload
} from '@gpt/chat-utils/msg-item';
import { 
    extractMessageContent, 
    MessageBuilder, 
    updateContentText 
} from '../../chat-utils';

type MessageLocator = number | { id: string };

/**
 * 解析定位符为 ID
 */
const resolveLocatorToId = (
    locator: MessageLocator,
    worldLine: string[]
): string | null => {
    if (typeof locator === 'number') {
        return worldLine[locator] ?? null;
    }
    return locator.id;
};

/**
 * 创建 TreeModel 适配器
 * 提供与旧 useMessageManagement 兼容的接口
 */
export const createTreeModelAdapter = (
    treeModel: ITreeModel,
    newID: () => string
) => {
    // ========================================
    // 读取访问
    // ========================================

    const count = () => treeModel.count();
    const hasMessages = () => treeModel.hasMessages();

    const getAt = (at: MessageLocator): IChatSessionMsgItemV2 | undefined => {
        if (typeof at === 'number') {
            return treeModel.getNodeAt(at);
        }
        return treeModel.getNodeById(at.id);
    };

    const indexOf = (at: MessageLocator): number => {
        if (typeof at === 'number') return at;
        return treeModel.indexOf(at.id);
    };

    const getBefore = (at: MessageLocator, inclusive = true): IChatSessionMsgItemV2[] => {
        const index = indexOf(at);
        if (index === -1) return [];
        const endIndex = inclusive ? index + 1 : index;
        return treeModel.messages().slice(0, endIndex);
    };

    const getAfter = (at: MessageLocator, inclusive = true): IChatSessionMsgItemV2[] => {
        const index = indexOf(at);
        if (index === -1) return [];
        const startIndex = inclusive ? index : index + 1;
        return treeModel.messages().slice(startIndex);
    };

    const getByIds = (ids: string[]): IChatSessionMsgItemV2[] => {
        return ids.map(id => treeModel.getNodeById(id)).filter(Boolean) as IChatSessionMsgItemV2[];
    };

    // ========================================
    // Item 字段访问
    // ========================================

    const getContent = (at: MessageLocator): string => {
        const item = getAt(at);
        if (!item || item.type !== 'message') return '';

        const payload = item.versions[item.currentVersionId];
        if (!payload?.message?.content) return '';

        const { text } = extractMessageContent(payload.message.content);
        return text;
    };

    const getRole = (at: MessageLocator): 'user' | 'assistant' | 'system' | 'tool' | undefined => {
        const item = getAt(at);
        return item?.role;
    };

    const isHidden = (at: MessageLocator): boolean => {
        const item = getAt(at);
        return item?.hidden ?? false;
    };

    const isPinned = (at: MessageLocator): boolean => {
        const item = getAt(at);
        return item?.pinned ?? false;
    };

    const getVersionInfo = (at: MessageLocator) => {
        const item = getAt(at);
        if (!item || item.type !== 'message') return null;

        return {
            currentVersion: item.currentVersionId,
            versions: Object.keys(item.versions || {}),
            hasMultipleVersions: Object.keys(item.versions || {}).length > 1
        };
    };

    // ========================================
    // 写入操作
    // ========================================

    const deleteMessages = (locators: MessageLocator[]) => {
        const ids = locators
            .map(loc => typeof loc === 'number' ? treeModel.getWorldLine()[loc] : loc.id)
            .filter(Boolean) as string[];

        if (ids.length === 0) return;
        treeModel.deleteNodes(ids);
    };

    const insertAfter = (after: MessageLocator, item: IChatSessionMsgItemV2) => {
        const afterId = typeof after === 'number' 
            ? treeModel.getWorldLine()[after] 
            : after.id;

        if (!afterId) {
            treeModel.appendNode(item);
            return;
        }

        treeModel.insertAfter(afterId, item);
    };

    const insertBlank = (after: MessageLocator, role: 'user' | 'assistant'): string => {
        const id = newID();
        const timestamp = Date.now();
        const versionId = `v_${id}`;

        const newNode: IChatSessionMsgItemV2 = {
            id,
            type: 'message',
            role,
            currentVersionId: versionId,
            versions: {
                [versionId]: {
                    id: versionId,
                    message: { role, content: '' },
                    author: role === 'user' ? 'user' : 'Bot',
                    timestamp,
                }
            },
            parent: null,
            children: [],
        };

        const afterId = typeof after === 'number'
            ? treeModel.getWorldLine()[after]
            : after.id;

        if (afterId) {
            treeModel.insertAfter(afterId, newNode);
        } else {
            treeModel.appendNode(newNode);
        }

        return id;
    };

    /**
     * 追加用户消息
     */
    const appendUserMsg = async (
        msg: string,
        multiModalAttachments?: TMessageContentPart[],
        contexts?: IProvidedContext[]
    ): Promise<number> => {
        const builder = new MessageBuilder();
        let optionalFields: Partial<IChatSessionMsgItemV2> = {};

        // 附加 context
        if (contexts && contexts.length > 0) {
            const result = mergeInputWithContext(msg, contexts);
            msg = result.content;
            optionalFields.context = contexts;
        }

        // 添加多模态附件
        if (multiModalAttachments && multiModalAttachments.length > 0) {
            builder.addParts(multiModalAttachments);
            optionalFields.multiModalAttachments = multiModalAttachments;
        }

        builder.addText(msg);
        const userMessage: IUserMessage = builder.buildUser();

        const id = newID();
        const timestamp = Date.now();
        const versionId = `v_${id}`;

        // 构建 userPromptSlice
        let userPromptSlice: [number, number] | undefined;
        if (contexts && contexts.length > 0) {
            const result = mergeInputWithContext(msg, contexts);
            userPromptSlice = result.userPromptSlice;
        }

        const newNode: IChatSessionMsgItemV2 = {
            id,
            type: 'message',
            role: 'user',
            currentVersionId: versionId,
            versions: {
                [versionId]: {
                    id: versionId,
                    message: userMessage,
                    author: 'user',
                    timestamp,
                    userPromptSlice,
                }
            },
            parent: null,
            children: [],
            ...optionalFields,
        };

        treeModel.appendNode(newNode);
        return timestamp;
    };

    // ========================================
    // Toggle 操作
    // ========================================

    const toggleSeperator = (index?: number) => {
        const worldLine = treeModel.getWorldLine();
        if (worldLine.length === 0) return;

        if (index !== undefined) {
            const nextIndex = index + 1;
            if (nextIndex < worldLine.length) {
                const nextNode = treeModel.getNodeAt(nextIndex);
                if (nextNode?.type === 'separator') {
                    treeModel.deleteNode(nextNode.id);
                } else {
                    // 插入分隔符
                    const separatorId = newID();
                    const separator: IChatSessionMsgItemV2 = {
                        id: separatorId,
                        type: 'separator',
                        currentVersionId: '',
                        versions: {},
                        parent: null,
                        children: [],
                    };
                    treeModel.insertAfter(worldLine[index], separator);
                }
            } else {
                // 末尾添加
                const separatorId = newID();
                const separator: IChatSessionMsgItemV2 = {
                    id: separatorId,
                    type: 'separator',
                    currentVersionId: '',
                    versions: {},
                    parent: null,
                    children: [],
                };
                treeModel.appendNode(separator);
            }
        } else {
            const lastNode = treeModel.getNodeAt(worldLine.length - 1);
            if (lastNode?.type === 'separator') {
                treeModel.deleteNode(lastNode.id);
            } else {
                const separatorId = newID();
                const separator: IChatSessionMsgItemV2 = {
                    id: separatorId,
                    type: 'separator',
                    currentVersionId: '',
                    versions: {},
                    parent: null,
                    children: [],
                };
                treeModel.appendNode(separator);
            }
        }
    };

    const toggleSeperatorAt = (index: number) => {
        if (index < 0 || index >= treeModel.count()) return;
        toggleSeperator(index);
    };

    const toggleHidden = (index: number, value?: boolean) => {
        const node = treeModel.getNodeAt(index);
        if (!node || node.type !== 'message') return;
        treeModel.updateNode(node.id, { hidden: value ?? !node.hidden });
    };

    const togglePinned = (index: number, value?: boolean) => {
        const node = treeModel.getNodeAt(index);
        if (!node || node.type !== 'message') return;
        treeModel.updateNode(node.id, { pinned: value ?? !node.pinned });
    };

    // ========================================
    // 版本管理
    // ========================================

    const addMsgItemVersion = (itemId: string, content: string) => {
        const node = treeModel.getNodeById(itemId);
        if (!node || node.type !== 'message') return;

        const newVersionId = Date.now().toString();
        const currentPayload = node.versions[node.currentVersionId];

        const newPayload: IMessagePayload = {
            id: newVersionId,
            message: {
                ...currentPayload?.message,
                content: content,
            } as IMessageLoose,
            author: 'User',
            timestamp: Date.now(),
        };

        treeModel.addVersion(itemId, newPayload);
    };

    const switchMsgItemVersion = (itemId: string, version: string) => {
        const node = treeModel.getNodeById(itemId);
        if (!node) return;
        if (node.currentVersionId === version) return;
        if (!node.versions[version]) return;

        treeModel.switchVersion(itemId, version);
        return Date.now();
    };

    const delMsgItemVersion = (itemId: string, version: string, autoSwitch = true) => {
        const node = treeModel.getNodeById(itemId);
        if (!node) return;

        if (!node.versions || node.versions[version] === undefined) {
            showMessage('此版本不存在');
            return;
        }

        const versionKeys = Object.keys(node.versions);
        if (versionKeys.length <= 1) {
            showMessage('当前版本不能删除');
            return;
        }

        let updatedTimestamp: number | undefined;

        batch(() => {
            if (node.currentVersionId === version && autoSwitch) {
                const idx = versionKeys.indexOf(version);
                const newIdx = idx === 0 ? versionKeys.length - 1 : idx - 1;
                const newVersion = versionKeys[newIdx];
                treeModel.switchVersion(itemId, newVersion);
                updatedTimestamp = Date.now();
            }

            treeModel.deleteVersion(itemId, version);

            if (!updatedTimestamp) {
                updatedTimestamp = Date.now();
            }
        });

        return updatedTimestamp;
    };

    // ========================================
    // 分支操作（V2 新增）
    // ========================================

    const createBranch = (
        at: MessageLocator,
        options: { branchContent?: string; keepAfter?: boolean } = {}
    ): string => {
        const atId = typeof at === 'number'
            ? treeModel.getWorldLine()[at]
            : at.id;

        if (!atId) return '';

        const node = treeModel.getNodeById(atId);
        if (!node || node.type !== 'message') return '';

        // 在 V2 中，创建分支是在树上添加新子节点
        const newId = treeModel.createBranch(atId);
        return newId || '';
    };

    return {
        // 读取访问
        count,
        hasMessages,
        getAt,
        indexOf,
        getBefore,
        getAfter,
        getByIds,

        // Item 字段访问
        getContent,
        getRole,
        isHidden,
        isPinned,
        getVersionInfo,

        // 写入操作
        appendUserMsg,
        deleteMessages,
        insertAfter,
        insertBlank,
        createBranch,

        // Toggle 操作
        toggleSeperator,
        toggleSeperatorAt,
        toggleHidden,
        togglePinned,

        // 版本管理
        addMsgItemVersion,
        switchMsgItemVersion,
        delMsgItemVersion,

        // V2 独有
        treeModel,
    };
};

export type TreeModelAdapter = ReturnType<typeof createTreeModelAdapter>;

/**
 * 创建 IStoreRef 兼容的消息存储包装器
 * 用于兼容期望 IStoreRef<IChatSessionMsgItem[]> 的代码
 * 
 * 注意：这是一个过渡方案，内部使用 TreeModel 但对外保持 IStoreRef 接口
 * 
 * @warning update 操作的语义与原 Store 略有不同：
 *   - 使用索引更新时，实际操作的是 worldLine 中的对应节点
 *   - 这种模式应该逐步被废弃，代码应该迁移到直接使用 TreeModel
 */
export const createStoreRefAdapter = (
    treeModel: ITreeModel
): IStoreRef<IChatSessionMsgItem[]> => {
    // 主 accessor - 返回当前 worldLine 上的消息
    const accessor = () => treeModel.messages() as IChatSessionMsgItem[];

    // value getter（等同于调用 accessor）
    Object.defineProperty(accessor, 'value', {
        get: () => treeModel.messages() as IChatSessionMsgItem[],
        enumerable: true
    });

    // store getter（返回 accessor 本身，因为 solid store 语义在这里不完全适用）
    Object.defineProperty(accessor, 'store', {
        get: () => treeModel.messages() as IChatSessionMsgItem[],
        enumerable: true
    });

    // raw getter（返回原始数组）
    Object.defineProperty(accessor, 'raw', {
        get: () => treeModel.messages() as IChatSessionMsgItem[],
        enumerable: true
    });

    // unwrap - 返回可变副本
    (accessor as any).unwrap = () => {
        return [...treeModel.messages()] as IChatSessionMsgItem[];
    };

    // set - 替换整个消息列表（危险操作，应该避免）
    (accessor as any).set = (value: IChatSessionMsgItem[] | ((prev: IChatSessionMsgItem[]) => IChatSessionMsgItem[])) => {
        console.warn('[StoreRefAdapter] set() called - this is a compatibility shim, consider migrating to TreeModel API');
        
        const newValue = typeof value === 'function' 
            ? value(treeModel.messages() as IChatSessionMsgItem[])
            : value;
        
        // 重建 TreeModel
        // 这里简单地清空并重新添加，可能需要更复杂的逻辑
        treeModel.clear();
        newValue.forEach((item: any) => {
            treeModel.appendNode(item);
        });
    };

    /**
     * update - 复杂的更新操作
     * 支持多种调用签名：
     *   - update(fn) - 整体更新
     *   - update(index, value) - 替换指定位置
     *   - update(index, prop, value) - 设置指定位置的属性
     *   - update(index, prop, subprop, value) - 设置嵌套属性
     */
    (accessor as any).update = (...args: any[]) => {
        if (args.length === 1 && typeof args[0] === 'function') {
            // update(fn) - 整体更新
            const fn = args[0];
            const current = treeModel.messages() as IChatSessionMsgItem[];
            const newValue = fn(current);
            (accessor as any).set(newValue);
            return;
        }

        if (typeof args[0] === 'number') {
            const index = args[0];
            const worldLine = treeModel.getWorldLine();
            const nodeId = worldLine[index];
            if (!nodeId) {
                console.warn(`[StoreRefAdapter] update() - invalid index ${index}`);
                return;
            }

            if (args.length === 2) {
                // update(index, value | fn) - 替换整个节点
                const valueOrFn = args[1];
                if (typeof valueOrFn === 'function') {
                    const current = treeModel.getNodeById(nodeId);
                    if (current) {
                        const updated = valueOrFn(current);
                        // 用更新后的数据替换节点
                        treeModel.updateNode(nodeId, updated);
                    }
                } else {
                    treeModel.updateNode(nodeId, valueOrFn);
                }
                return;
            }

            // update(index, prop, ...) - 设置属性
            // 这里我们需要处理 solid store 的路径更新语义
            const current = treeModel.getNodeById(nodeId);
            if (!current) return;

            // 构建更新对象
            let updateObj: any = {};
            let target = updateObj;
            
            for (let i = 1; i < args.length - 1; i++) {
                const key = args[i];
                if (i === args.length - 2) {
                    // 最后一个 key 之前，设置值
                    target[key] = args[args.length - 1];
                } else {
                    // 中间路径，创建嵌套对象
                    target[key] = {};
                    target = target[key];
                }
            }

            // 执行深度合并更新
            treeModel.updatePayload(nodeId, updateObj);
        }
    };

    return accessor as unknown as IStoreRef<IChatSessionMsgItem[]>;
};
