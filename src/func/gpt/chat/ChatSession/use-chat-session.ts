// External libraries
import { showMessage } from 'siyuan';
import { Accessor, batch, createMemo } from 'solid-js';
import { IStoreRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

// Local components and utilities
import { createSimpleContext } from '@/libs/simple-context';

// GPT-related imports
import { globalMiscConfigs } from '@/func/gpt/model/store';

import {
    mergeInputWithContext,
    getMeta,
    getPayload
} from '@gpt/chat-utils/msg-item';

import { toolExecutorFactory } from '@gpt/tools';
import { useDeleteHistory } from './DeleteHistory';
import { snapshotSignal } from '../../persistence/json-files';

import { extractContentText, extractMessageContent, MessageBuilder, updateContentText } from '../../chat-utils';

// import { useGptCommunication as useGptCommunicationV1 } from './use-openai-communication';
import { useGptCommunication as useGptCommunicationV2 } from './use-openai-endpoints';

import { useContextAndAttachments } from './use-attachment-input';
import { InlineApprovalAdapter } from '@gpt/tools/approval-ui';
import type { PendingApproval } from '@gpt/tools/types';

// V2 TreeModel
import { useTreeModel } from './use-tree-model';


interface ISimpleContext {
    model: Accessor<IRuntimeLLM>;
    config: IStoreRef<IChatSessionConfig>;
    session: ReturnType<typeof useSession>;
    [key: string]: any
}

const { SimpleProvider, useSimpleContext } = createSimpleContext<ISimpleContext>();

export {
    SimpleProvider,
    useSimpleContext
}

// ============================================================================
// MessageLocator - 参数化访问坐标
// ============================================================================

/**
 * 消息定位符
 * V1: 支持 index 或 ID
 * V2: 将主要使用 ID（从 worldLine 查找）
 */
type MessageLocator = number | { id: string };


/**
 * 主会话 hook
 */
export const useSession = (props: {
    model: Accessor<IRuntimeLLM>;
    config: IStoreRef<IChatSessionConfig>;
    scrollToBottom: (force?: boolean) => void;
}) => {
    let sessionId = useSignalRef<string>(window.Lute.NewNodeID());

    // ========== 新增：待审批队列 ==========
    const pendingApprovals = useStoreRef<PendingApproval[]>([]);

    const newID = () => {
        return window.Lute.NewNodeID();
    }

    // ========== 修改：创建内联适配器并传入 ==========
    const inlineApprovalAdapter = new InlineApprovalAdapter(pendingApprovals, newID);
    const toolExecutor = toolExecutorFactory({
        approvalAdapter: inlineApprovalAdapter
    });

    const systemPrompt = useSignalRef<string>(globalMiscConfigs().defaultSystemPrompt || '');
    // 当前的多模态附件 (使用 OpenAI 标准格式)
    const multiModalAttachments = useSignalRef<TMessageContentPart[]>([]);
    const contexts = useStoreRef<IProvidedContext[]>([]);

    const modelCustomOptions = useSignalRef<Partial<IChatCompleteOption>>({});

    let timestamp = new Date().getTime();
    let updated = timestamp; // Initialize updated time to match creation time
    const title = useSignalRef<string>('新的对话');

    // ========== V2 TreeModel ==========
    const treeModel = useTreeModel();

    // 为了兼容现有代码，创建一个 messages 的派生访问器
    // 注意：这是只读的，写操作通过 treeModel 进行
    const messages = treeModel.messages;

    // ================================================================
    // Session 状态管理
    // ================================================================

    const sessionTags = useStoreRef<string[]>([]);
    const loading = useSignalRef<boolean>(false);
    // const streamingReply = useSignalRef<string>('');

    // 集成删除历史记录功能
    const deleteHistory = useDeleteHistory();

    const renewUpdatedTimestamp = () => {
        updated = new Date().getTime();
    }

    const msgId2Index = createMemo(() => {
        let map = new Map<string, number>();
        messages().forEach((item, index) => {
            map.set(item.id, index);
        });
        return map;
    });

    let hasStarted = false;

    // 获取历史消息的函数
    const getAttachedHistory = (itemNum?: number, fromIndex?: number) => {
        if (itemNum === undefined) {
            itemNum = props.config().attachedHistory;
        }
        // V2: messages 现在是 accessor 而不是 Store
        const history = [...messages()];
        const targetIndex = fromIndex ?? history.length - 1;
        const targetMessage = history[targetIndex];

        const isAttachable = (msg: IChatSessionMsgItemV2) => {
            return getMeta(msg, 'type') === 'message' && !getMeta(msg, 'hidden') && !getMeta(msg, 'loading');
        }

        // 从指定位置向前截取历史消息
        const previousMessages = history.slice(0, targetIndex);

        // 1. 获取滑动窗口内的消息 (Window Messages)
        let attachedMessages: IChatSessionMsgItemV2[] = [];

        if (itemNum > 0) {
            let lastMessages: IChatSessionMsgItemV2[] = previousMessages;

            // 计算需要获取的消息数量，考虑hidden消息
            let visibleCount = 0;
            let startIndex = previousMessages.length - 1;

            while (startIndex >= 0) {
                const msg = previousMessages[startIndex];
                if (isAttachable(msg)) {
                    visibleCount++;
                    if (visibleCount >= itemNum) {
                        break;
                    }
                }
                if (startIndex === 0) break;
                startIndex--;
            }

            lastMessages = previousMessages.slice(startIndex);

            //查找最后一个为 separator 的消息
            let lastSeperatorIndex = -1;
            for (let i = lastMessages.length - 1; i >= 0; i--) {
                const msgType = getMeta(lastMessages[i], 'type');
                //@ts-ignore  V1 版本拼写有错，保险起见做适配
                if (msgType === 'seperator' || msgType === 'separator') {
                    lastSeperatorIndex = i;
                    break;
                }
            }

            if (lastSeperatorIndex === -1) {
                attachedMessages = lastMessages.filter(isAttachable);
            } else {
                attachedMessages = lastMessages.slice(lastSeperatorIndex + 1).filter(isAttachable);
            }
        } else if (itemNum < 0) {
            // 负数表示无限窗口，附加所有历史记录直到遇到分隔符
            let lastMessages: IChatSessionMsgItemV2[] = previousMessages;

            //查找最后一个为 seperator/separator 的消息
            let lastSeperatorIndex = -1;
            for (let i = lastMessages.length - 1; i >= 0; i--) {
                const msgType = getMeta(lastMessages[i], 'type');
                //@ts-ignore  V1 版本拼写有错，保险起见做适配
                if (msgType === 'seperator' || msgType === 'separator') {
                    lastSeperatorIndex = i;
                    break;
                }
            }

            if (lastSeperatorIndex === -1) {
                attachedMessages = lastMessages.filter(isAttachable);
            } else {
                attachedMessages = lastMessages.slice(lastSeperatorIndex + 1).filter(isAttachable);
            }
        }
        // 如果 itemNum === 0，attachedMessages 保持为空（仅固定消息）

        // 2. 获取被固定的消息 (Pinned Messages)
        // 规则：
        // 1. 必须是 message 类型且未隐藏
        // 2. 必须是 pinned 状态
        // 3. 必须不在滑动窗口内 (避免重复)
        const attachedIds = new Set(attachedMessages.map(m => m.id));
        const pinnedMessages = previousMessages.filter(msg =>
            msg.pinned && isAttachable(msg) && !attachedIds.has(msg.id)
        );

        // 3. 合并并保持原有顺序
        // 因为 pinnedMessages 和 attachedMessages 都是 previousMessages 的子集，
        // 我们可以通过 ID 集合再次从 previousMessages 中筛选，从而自然保持顺序
        const finalIds = new Set([...attachedMessages, ...pinnedMessages].map(m => getMeta(m, 'id')));
        const finalContext = previousMessages.filter(m => finalIds.has(getMeta(m, 'id')));

        return [...finalContext, targetMessage].map(item => getPayload(item, 'message')!);
    }

    // ========== V2: 消息管理方法（直接使用 TreeModel）==========

    const appendUserMsgInternal = async (
        msg: string,
        multiModalAttachments?: TMessageContentPart[],
        contexts?: IProvidedContext[]
    ) => {
        const builder = new MessageBuilder();
        let optionalFields: Partial<IChatSessionMsgItemV2> = {};
        let userPromptSlice: [number, number] | undefined;

        // 处理 context
        if (contexts && contexts.length > 0) {
            const result = mergeInputWithContext(msg, contexts);
            msg = result.content;
            userPromptSlice = result.userPromptSlice;
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
        const versionId = newID();

        const newNode: Omit<IChatSessionMsgItemV2, 'parent' | 'children'> = {
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
                    userPromptSlice: userPromptSlice,
                }
            },
            ...optionalFields,
        };

        treeModel.appendNode(newNode);
        return timestamp;
    };

    const toggleSeperator = (index?: number) => {
        const worldLine = treeModel.getWorldLine();
        if (worldLine.length === 0) return;

        if (index !== undefined) {
            const nextIndex = index + 1;
            if (nextIndex < worldLine.length) {
                const nextId = worldLine[nextIndex];
                const nextNode = treeModel.getNodeById(nextId);
                if (nextNode?.type === 'separator') {
                    treeModel.deleteNode(nextId);
                } else {
                    const newSep: Omit<IChatSessionMsgItemV2, 'parent' | 'children'> = {
                        id: newID(),
                        type: 'separator',
                        currentVersionId: '',
                        versions: {},
                        role: ''
                    };
                    treeModel.insertAfter(worldLine[index], newSep);
                }
            } else {
                // 末尾添加
                const newSep: Omit<IChatSessionMsgItemV2, 'parent' | 'children'> = {
                    id: newID(),
                    type: 'separator',
                    currentVersionId: '',
                    versions: {},
                    role: ''
                };
                treeModel.appendNode(newSep);
            }
        } else {
            const lastId = worldLine[worldLine.length - 1];
            const lastNode = treeModel.getNodeById(lastId);
            if (lastNode?.type === 'separator') {
                treeModel.deleteNode(lastId);
            } else {
                const newSep: Omit<IChatSessionMsgItemV2, 'parent' | 'children'> = {
                    id: newID(),
                    type: 'separator',
                    currentVersionId: '',
                    versions: {},
                    role: ''
                };
                treeModel.appendNode(newSep);
            }
        }
    };

    const toggleSeperatorAt = (index: number) => {
        if (index < 0 || index >= treeModel.getWorldLine().length) return;
        toggleSeperator(index);
    };

    const toggleHidden = (index: number, value?: boolean) => {
        const worldLine = treeModel.getWorldLine();
        if (index < 0 || index >= worldLine.length) return;
        const nodeId = worldLine[index];
        const node = treeModel.getNodeById(nodeId);
        if (!node || node.type !== 'message') return;
        treeModel.updateNode(nodeId, { hidden: value ?? !node.hidden });
    };

    const togglePinned = (index: number, value?: boolean) => {
        const worldLine = treeModel.getWorldLine();
        if (index < 0 || index >= worldLine.length) return;
        const nodeId = worldLine[index];
        const node = treeModel.getNodeById(nodeId);
        if (!node || node.type !== 'message') return;
        treeModel.updateNode(nodeId, { pinned: value ?? !node.pinned });
    };

    const addMsgItemVersion = (itemId: string, content: string) => {
        const node = treeModel.getNodeById(itemId) as IChatSessionMsgItemV2;
        if (!node || node.type !== 'message') return;

        const currentPayload = node.versions[node.currentVersionId];
        if (!currentPayload) return;

        const newVersionId = Date.now().toString();
        const newPayload: IMessagePayload = {
            id: newVersionId,
            message: {
                ...currentPayload.message,
                content: content,
            },
            author: 'User',
            timestamp: Date.now(),
        };

        treeModel.addVersion(itemId, newPayload);
    };

    const switchMsgItemVersion = (itemId: string, version: string) => {
        const node = treeModel.getNodeById(itemId) as IChatSessionMsgItemV2;
        if (!node) return;
        if (node.currentVersionId === version) return;
        if (!node.versions || !node.versions[version]) return;

        treeModel.switchVersion(itemId, version);
        return Date.now();
    };

    const delMsgItemVersion = (itemId: string, version: string, autoSwitch = true) => {
        const node = treeModel.getNodeById(itemId) as IChatSessionMsgItemV2;
        if (!node || !node.versions || !node.versions[version]) {
            showMessage('此版本不存在');
            return;
        }

        const versionKeys = Object.keys(node.versions);
        if (versionKeys.length <= 1) {
            showMessage('唯一的消息版本不能删除');
            return;
        }

        let switchFun = () => { };
        let switchedToVersion: string | undefined;

        if (node.currentVersionId === version && autoSwitch) {
            const idx = versionKeys.indexOf(version);
            const newIdx = idx === 0 ? versionKeys.length - 1 : idx - 1;
            switchedToVersion = versionKeys[newIdx];
            switchFun = () => switchMsgItemVersion(itemId, switchedToVersion!);
        }

        let updatedTimestamp;
        batch(() => {
            updatedTimestamp = switchFun();
            treeModel.deleteVersion(itemId, version);
            if (!updatedTimestamp) {
                updatedTimestamp = Date.now();
            }
            showMessage(`已删除版本${version}${switchedToVersion ? `，切换到版本${switchedToVersion}` : ''}`);
        });

        return updatedTimestamp;
    };

    // 使用上下文和附件管理 hook
    const {
        setContext,
        delContext,
        removeAttachment,
        addAttachment
    } = useContextAndAttachments({
        contexts,
        multiModalAttachments
    });

    // ================================================================
    // 测试对比替换
    // ================================================================
    // let communication = useGptCommunicationV1;
    let communication = useGptCommunicationV2;

    // 使用 GPT 通信 hook
    const {
        autoGenerateTitle: autoGenerateTitleInternal,
        reRunMessage: reRunMessageInternal,
        sendMessage: sendMessageInternal,
        abortMessage
    } = communication({
        model: props.model,
        config: props.config,
        treeModel,  // V2: 直接传递 TreeModel
        systemPrompt,
        customOptions: modelCustomOptions,
        loading,
        multiModalAttachments,
        contexts,
        toolExecutor,
        newID,
        getAttachedHistory
    });

    // 包装 appendUserMsg 以更新 updated 时间戳
    const appendUserMsg = async (msg: string, multiModalAttachments?: TMessageContentPart[], contexts?: IProvidedContext[]) => {
        const timestamp = await appendUserMsgInternal(msg, multiModalAttachments, contexts);
        renewUpdatedTimestamp();
        return timestamp;
    }

    // 包装 autoGenerateTitle 以更新标题
    const autoGenerateTitle = async () => {
        const newTitle = await autoGenerateTitleInternal();
        if (newTitle?.trim()) {
            title.update(newTitle.trim());
        }
    }

    // 包装 reRunMessage 以传递 scrollToBottom
    const reRunMessage = async (atIndex: number) => {
        await reRunMessageInternal(atIndex);
        renewUpdatedTimestamp();
    }

    // 包装 sendMessage 以处理用户消息和更新状态
    const sendMessage = async (userMessage: string) => {
        if (!userMessage.trim() && multiModalAttachments().length === 0 && contexts().length === 0) return;

        await appendUserMsg(userMessage, multiModalAttachments(), [...contexts.unwrap()]);

        const result = await sendMessageInternal(
            userMessage,
            multiModalAttachments(),
            [...contexts.unwrap()],
            props.scrollToBottom,
        );

        if (result?.updatedTimestamp) {
            renewUpdatedTimestamp();
        }

        // Clear attachments after sending
        multiModalAttachments.update([]);
        contexts.update([]);

        if (!hasStarted && result?.hasResponse) {
            hasStarted = true;
            if (messages().length <= 2) {
                setTimeout(autoGenerateTitle, 100);
            }
        }
    }

    // 定义 hooks 对象中需要的函数
    const toggleNewThread = () => {
        toggleSeperator();
        props.scrollToBottom();
    }

    const checkAttachedContext = (index?: number) => {
        if (index === undefined || index < 0 || index >= messages().length) {
            // V2: 临时插入虚假消息来计算附加上下文
            const tempId = newID();
            const tempNode: IChatSessionMsgItemV2 = {
                id: tempId,
                type: 'message',
                role: 'user',
                currentVersionId: '',
                versions: {},
                parent: null,
                children: [],
            };
            treeModel.appendNode(tempNode);
            const attached = getAttachedHistory(props.config().attachedHistory);
            treeModel.deleteNode(tempId);
            return attached;
        }
        return getAttachedHistory(props.config().attachedHistory, index);
    }

    // ========== V2: sessionHistory 输出 V2 格式 ==========
    const sessionHistory = (): IChatSessionHistoryV2 => {
        return treeModel.toHistory({
            id: sessionId(),
            timestamp,
            updated,
            title: title(),
            tags: sessionTags(),
            sysPrompt: systemPrompt(),
            customOptions: modelCustomOptions()
        });
    }

    // ========== V2: applyHistory 支持 V2 格式 ==========
    const applyHistory = (history: Partial<IChatSessionHistoryV2>) => {
        batch(() => {
            history.id && (sessionId.value = history.id);
            history.title && (title.update(history.title));
            history.timestamp && (timestamp = history.timestamp);
            history.updated && (updated = history.updated);
            history.sysPrompt && (systemPrompt.update(history.sysPrompt));
            history.tags && (sessionTags.update(history.tags));
            history.customOptions && (modelCustomOptions.value = history.customOptions);

            // V2: 加载树结构
            if (history.nodes !== undefined) {
                treeModel.fromHistory(history as IChatSessionHistoryV2);
            }
        });

        // 清空删除历史（加载新历史记录时）
        deleteHistory.clearRecords();
    }

    // 定义 newSession 函数
    const newSession = () => {
        sessionId.value = window.Lute.NewNodeID();
        systemPrompt.value = globalMiscConfigs().defaultSystemPrompt || '';
        timestamp = new Date().getTime();
        updated = timestamp + 1;
        title.update('新的对话');

        // V2: 清空树模型
        treeModel.clear();

        sessionTags.update([]);
        loading.update(false);
        hasStarted = false;
        modelCustomOptions.value = {};

        // 清空删除历史（新建会话时）
        deleteHistory.clearRecords();
    }

    const hooks = {
        sessionId,
        systemPrompt,

        // ========== 消息访问 (V2 TreeModel) ==========
        getNode$: (id: ItemID): Readonly<IChatSessionMsgItemV2> => {
            return treeModel.getNode({ id: id });
        },

        // 数量和存在性检查
        getMessageCount: () => treeModel.count(),
        hasMessages: () => treeModel.hasMessages(),

        // 获取活动消息（用于显示）
        getActiveMessages: () => messages(), // 只读访问

        // 参数化访问
        getMessageAt: (at: MessageLocator) => {
            if (typeof at === 'number') {
                return treeModel.getNodeAt(at);
            }
            return treeModel.getNodeById(at.id);
        },
        getMessageIndex: (at: MessageLocator) => {
            if (typeof at === 'number') return at;
            return treeModel.indexOf(at.id);
        },
        getMessagesBefore: (at: MessageLocator, inclusive = true) => {
            const index = hooks.getMessageIndex(at);
            if (index === -1) return [];
            const endIndex = inclusive ? index + 1 : index;
            return messages().slice(0, endIndex);
        },
        getMessagesAfter: (at: MessageLocator, inclusive = true) => {
            const index = hooks.getMessageIndex(at);
            if (index === -1) return [];
            const startIndex = inclusive ? index : index + 1;
            return messages().slice(startIndex);
        },
        getMessagesByIds: (ids: string[]) => {
            return ids.map(id => treeModel.getNodeById(id)).filter(Boolean) as IChatSessionMsgItemV2[];
        },

        // Item 字段访问
        getMessageContent: (at: MessageLocator) => {
            const item = hooks.getMessageAt(at) as IChatSessionMsgItemV2;
            if (!item || item.type !== 'message') return '';
            const payload = item.versions[item.currentVersionId];
            if (!payload?.message?.content) return '';
            const { text } = extractMessageContent(payload.message.content);
            return text;
        },
        getMessageRole: (at: MessageLocator) => {
            const item = hooks.getMessageAt(at);
            return item?.role;
        },
        isMessageHidden: (at: MessageLocator) => {
            const item = hooks.getMessageAt(at);
            return item?.hidden ?? false;
        },
        isMessagePinned: (at: MessageLocator) => {
            const item = hooks.getMessageAt(at);
            return item?.pinned ?? false;
        },
        getMessageVersionInfo: (at: MessageLocator) => {
            const item = hooks.getMessageAt(at) as IChatSessionMsgItemV2;
            if (!item || item.type !== 'message') return null;
            return {
                currentVersion: item.currentVersionId,
                versions: Object.keys(item.versions || {}),
                hasMultipleVersions: Object.keys(item.versions || {}).length > 1
            };
        },

        // 写入操作
        deleteMessages: (locators: MessageLocator[]) => {
            if (loading()) return;

            // 记录每条被删除的消息到历史
            locators.forEach(loc => {
                const item = hooks.getMessageAt(loc) as IChatSessionMsgItemV2;
                if (!item || item.type !== 'message') return;

                // get raw clone node
                const msgItem = treeModel.getRawNode({ id: item.id }, true);

                // V2: 从 versions 获取当前版本数据
                const currentPayload = item.versions[item.currentVersionId];
                const content = extractContentText(currentPayload?.message?.content);

                deleteHistory.addRecord({
                    type: 'message',
                    sessionId: sessionId(),
                    sessionTitle: title(),
                    content: content,
                    timestamp: currentPayload?.timestamp || Date.now(),
                    author: currentPayload?.author,
                    totalVersions: item.versions ? Object.keys(item.versions).length : 1,
                    // V2: originalItem 存储完整的 V2 节点 (使用 any 类型避免类型冲突)
                    originalItem: msgItem,
                    extra: {
                        messageId: item.id,
                        author: currentPayload?.author
                    }
                });
            });

            // V2: 执行批量删除
            const idsToDelete = locators.map(loc => {
                if (typeof loc === 'number') {
                    return treeModel.getWorldLine()[loc];
                }
                return loc.id;
            }).filter(Boolean) as string[];

            const show = (result: ReturnType<typeof treeModel.deleteNode>) => {
                if (!result.success) {
                    showMessage(`删除消息失败：${result.reason}`, 6000, 'error');
                }
            }

            // idsToDelete.forEach(id => treeModel.deleteNode(id));
            if (idsToDelete.length === 1) {
                let result = treeModel.deleteNode(idsToDelete[0]);
                show(result);
            } else if (idsToDelete.length > 1) {
                let result = treeModel.deleteNodes(idsToDelete);
                show(result);
            }

            renewUpdatedTimestamp();
        },
        insertMessageAfter: (after: MessageLocator, item: IChatSessionMsgItemV2) => {
            const afterId = typeof after === 'number'
                ? treeModel.getWorldLine()[after]
                : after.id;
            if (!afterId) return;
            treeModel.insertAfter(afterId, item);
            renewUpdatedTimestamp();
        },
        insertBlankMessage: (after: MessageLocator, role: 'user' | 'assistant') => {
            const id = newID();
            const timestamp = Date.now();
            const versionId = `v_${id}`;

            const builder = new MessageBuilder();
            builder.addText('');

            let message: IUserMessage | IAssistantMessage;
            if (role === 'user') {
                message = builder.buildUser();
            } else {
                message = { role: 'assistant', content: '' };
            }

            const newNode: Omit<IChatSessionMsgItemV2, 'parent' | 'children'> = {
                id,
                type: 'message',
                role,
                currentVersionId: versionId,
                versions: {
                    [versionId]: {
                        id: versionId,
                        message,
                        author: role === 'user' ? 'user' : 'Bot',
                        timestamp,
                    }
                },
            };

            const afterId = typeof after === 'number'
                ? treeModel.getWorldLine()[after]
                : after.id;
            if (!afterId) return '';

            treeModel.insertAfter(afterId, newNode);
            renewUpdatedTimestamp();
            return id;
        },

        /**
         * 在指定消息处创建分支
         * @param at 消息定位符
         * @returns 分支起点 ID，失败返回 null
         */
        createBranch: (at: MessageLocator) => {
            const item = hooks.getMessageAt(at);
            if (!item) return null;

            const branchId = treeModel.forkAt(item.id);
            if (!branchId) return null;

            renewUpdatedTimestamp();

            // 返回分支起点 ID，UI 可以据此做后续处理
            return branchId;
        },

        // ========== 其他状态 ==========
        modelCustomOptions: modelCustomOptions,
        loading,
        title,
        multiModalAttachments,
        contexts,
        toolExecutor,
        sessionTags,
        treeModel, // 暴露 treeModel 供组件使用

        // ========== 审批相关 ==========
        pendingApprovals,
        resolvePendingApproval: (id: string, decision: { approved: boolean; rejectReason?: string }) => {
            const approval = pendingApprovals().find(a => a.id === id);
            if (approval) {
                approval.resolve(decision);
                pendingApprovals.update(prev => prev.filter(a => a.id !== id));
            }
        },

        // ========== 会话管理 ==========
        hasUpdated: () => {
            const persisted = snapshotSignal();
            const found = persisted?.sessions.find(session => session.id === sessionId());
            if (found) {
                return updated > timestamp;
            } else {
                return true;  //说明是一个新的
            }
        },
        msgId2Index,

        // ========== 附件和上下文 ==========
        addAttachment,
        removeAttachment,
        setContext,
        delContext,

        // ========== 通信和操作 ==========
        autoGenerateTitle,
        reRunMessage,
        sendMessage,
        abortMessage,

        // ========== Toggle 操作（保留兼容）==========
        toggleHidden,
        togglePinned,
        toggleSeperatorAt,
        toggleNewThread,
        checkAttachedContext,

        // ========== 会话历史 ==========
        sessionHistory,
        applyHistory,
        newSession,

        // ========== 元数据更新（特殊用途）==========
        updateMessageMetadata: (at: MessageLocator, metadata: Partial<IChatSessionMsgItemV2>) => {
            const id = typeof at === 'number' ? treeModel.getWorldLine()[at] : at.id;
            if (!id) return;
            treeModel.updateNode(id, metadata);
            renewUpdatedTimestamp();
        },

        // ========== 版本管理==========
        addMsgItemVersion: (itemId: string, content: string) => {
            addMsgItemVersion(itemId, content);
            renewUpdatedTimestamp();
        },
        switchMsgItemVersion: (itemId: string, version: string) => {
            switchMsgItemVersion(itemId, version);
            renewUpdatedTimestamp();
        },
        delMsgItemVersion: (itemId: string, version: string, autoSwitch = true) => {
            // V2: 直接通过 ID 获取节点
            const msgItem_ = treeModel.getNodeById(itemId) as IChatSessionMsgItemV2;
            if (!msgItem_ || msgItem_.type !== 'message') return;
            // get raw clone node
            const msgItem = treeModel.getRawNode({ id: msgItem_.id }, true);

            // 记录版本删除到历史 (V2: versions 结构)
            if (msgItem.versions?.[version]) {
                const versionPayload = msgItem.versions[version];
                const textContent = extractContentText(versionPayload.message?.content);

                deleteHistory.addRecord({
                    type: 'version',
                    sessionId: sessionId(),
                    sessionTitle: title(),
                    content: textContent.trim() || '多媒体内容',
                    timestamp: versionPayload.timestamp || Date.now(),
                    author: versionPayload.author,
                    versionId: version,
                    // V2: originalItem 存储完整的 V2 节点 (使用 any 类型避免类型冲突)
                    originalItem: msgItem, // clone 过了
                    extra: {
                        messageId: itemId,
                        versionId: version,
                        author: versionPayload.author
                    }
                });
            }

            delMsgItemVersion(itemId, version, autoSwitch);
            renewUpdatedTimestamp();
        },

        // 消息更新函数（使用 TreeModel）
        updateMessage: (index: number, newContent: string) => {
            const worldLine = treeModel.getWorldLine();
            const nodeId = worldLine[index];
            if (!nodeId) return;

            const item = treeModel.getNodeById(nodeId) as IChatSessionMsgItemV2;
            if (!item || item.type !== 'message') return;

            // V2: 从当前版本获取上下文
            const payload = item.versions[item.currentVersionId];
            if (!payload) return;

            const contentText = extractContentText(payload.message?.content);
            let contextPrompt = '';
            if (payload.userPromptSlice) {
                contextPrompt = contentText.slice(0, payload.userPromptSlice[0]);
            }

            const newText = contextPrompt + newContent;

            // V2: 更新当前版本的 message content
            treeModel.updatePayload(nodeId, {
                message: {
                    ...payload.message,
                    content: newText,
                },
                userPromptSlice: contextPrompt.length > 0
                    ? [contextPrompt.length, contextPrompt.length + newContent.length]
                    : undefined,
            });

            renewUpdatedTimestamp();
        },

        // 消息删除函数（复用批量删除逻辑）
        deleteMessage: (index: number) => {
            // 复用封装好的批量删除方法（已包含历史记录）
            hooks.deleteMessages([index]);
        },

        // 暴露删除历史功能
        deleteHistory
    }
    return hooks;
}


/**
 * 解析定位符为索引
 * V1: 直接返回 number 或查找 ID
 * V2: 从 worldLine 查找 ID 位置
 */
// const resolveLocator = (
//     locator: MessageLocator,
//     messages: IChatSessionMsgItem[]
// ): number => {
//     if (typeof locator === 'number') {
//         return locator;
//     }
//     return messages.findIndex(item => item.id === locator.id);
// };

// ============================================================================
// [DEPRECATED] V1 消息管理 Hook - 保留供参考，已被 useTreeModel 替代
// ============================================================================

/*
 * 以下 useMessageManagement 代码已废弃，保留供调试参考
 * 新版本使用 use-tree-model.ts 中的 useTreeModel
 */

// #region DEPRECATED_useMessageManagement
// THIS OLD HOOK is moved to tmp/archive-useMesssageManagement.ts
// const useMessageManagement = (params: {
//     messages: IStoreRef<IChatSessionMsgItem[]>;
// }) => {
//     // OMIT: Deprecated code moved to tmp/archive-useMesssageManagement.ts
//     return {
//         // ID 生成
//         newID,

//         // ========== 读取访问 ==========
//         // 数量和存在性检查
//         count,
//         hasMessages,

//         // 参数化定位获取
//         getAt,
//         indexOf,
//         getBefore,
//         getAfter,
//         getByIds,

//         // Item 字段访问
//         getContent,
//         getRole,
//         isHidden,
//         isPinned,
//         getVersionInfo,

//         // ========== 写入操作 ==========
//         // 基本写入
//         appendUserMsg,
//         deleteMessages,
//         insertAfter,
//         insertBlank,
//         createBranch,

//         // Toggle 操作（保留旧接口兼容）
//         toggleSeperator,
//         toggleSeperatorAt,
//         toggleHidden,
//         togglePinned,

//         // 版本管理
//         addMsgItemVersion,
//         switchMsgItemVersion,
//         delMsgItemVersion
//     };
// };
// #endregion DEPRECATED_useMessageManagement