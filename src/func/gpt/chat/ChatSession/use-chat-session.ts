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
    applyMsgItemVersion,
    stageMsgItemVersion,
    isMsgItemWithMultiVersion
} from '@gpt/chat-utils/msg-item';

import { toolExecutorFactory } from '@gpt/tools';
import { useDeleteHistory } from './DeleteHistory';
import { snapshotSignal } from '../../persistence/json-files';

import { extractContentText, extractMessageContent, MessageBuilder, splitPromptFromContext, updateContentText } from '../../chat-utils';

// import { useGptCommunication as useGptCommunicationV1 } from './use-openai-communication';
import { useGptCommunication as useGptCommunicationV2 } from './use-openai-endpoints';

import { useContextAndAttachments } from './use-attachment-input';
import { InlineApprovalAdapter } from '@gpt/tools/approval-ui';
import type { PendingApproval } from '@gpt/tools/types';


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
 * 解析定位符为索引
 * V1: 直接返回 number 或查找 ID
 * V2: 从 worldLine 查找 ID 位置
 */
const resolveLocator = (
    locator: MessageLocator,
    messages: IChatSessionMsgItem[]
): number => {
    if (typeof locator === 'number') {
        return locator;
    }
    return messages.findIndex(item => item.id === locator.id);
};

// ============================================================================
// 消息管理相关的 hook（增强版）
// ============================================================================

/**
 * 消息管理相关的 hook
 * 负责所有消息的读取和写入操作
 */
const useMessageManagement = (params: {
    messages: IStoreRef<IChatSessionMsgItem[]>;
}) => {
    const { messages } = params;

    const newID = () => {
        return window.Lute.NewNodeID();
    }

    // ========================================
    // 一、读取访问（参数化定位符）
    // ========================================

    /**
     * 获取消息数量
     */
    const count = (): number => {
        return messages().length;
    };

    /**
     * 检查是否有消息
     */
    const hasMessages = (): boolean => {
        return messages().length > 0;
    };

    /**
     * 按定位符获取消息
     * @param at - 索引或 ID
     */
    const getAt = (at: MessageLocator): IChatSessionMsgItem | undefined => {
        const index = resolveLocator(at, messages());
        return index >= 0 ? messages()[index] : undefined;
    };

    /**
     * 获取消息索引
     * @param at - 索引或 ID
     */
    const indexOf = (at: MessageLocator): number => {
        return resolveLocator(at, messages());
    };

    /**
     * 获取指定位置之前的消息
     */
    const getBefore = (at: MessageLocator, inclusive = true): IChatSessionMsgItem[] => {
        const index = resolveLocator(at, messages());
        if (index === -1) return [];
        const endIndex = inclusive ? index + 1 : index;
        return messages().slice(0, endIndex);
    };

    /**
     * 获取指定位置之后的消息
     */
    const getAfter = (at: MessageLocator, inclusive = true): IChatSessionMsgItem[] => {
        const index = resolveLocator(at, messages());
        if (index === -1) return [];
        const startIndex = inclusive ? index : index + 1;
        return messages().slice(startIndex);
    };

    /**
     * 批量获取消息
     */
    const getByIds = (ids: string[]): IChatSessionMsgItem[] => {
        const idSet = new Set(ids);
        return messages().filter((item: IChatSessionMsgItem) => idSet.has(item.id));
    };

    // ========================================
    // 二、Item 字段访问（封装 IChatSessionMsgItem 结构）
    // ========================================

    /**
     * 获取消息内容文本
     * V1: item.message.content（可能是 string 或 array）
     * V2: item.versions[currentVersionId].message.content
     */
    const getContent = (at: MessageLocator): string => {
        const item = getAt(at);
        if (!item || item.type !== 'message') return '';

        const { text } = extractMessageContent(item.message.content);
        return text;
    };

    /**
     * 获取消息角色
     */
    const getRole = (at: MessageLocator): 'user' | 'assistant' | 'system' | 'tool' | undefined => {
        const item = getAt(at);
        return item?.message?.role;
    };

    /**
     * 检查消息是否隐藏
     */
    const isHidden = (at: MessageLocator): boolean => {
        const item = getAt(at);
        return item?.hidden ?? false;
    };

    /**
     * 检查消息是否固定
     */
    const isPinned = (at: MessageLocator): boolean => {
        const item = getAt(at);
        return item?.pinned ?? false;
    };

    /**
     * 获取消息版本信息
     */
    const getVersionInfo = (at: MessageLocator) => {
        const item = getAt(at);
        if (!item || item.type !== 'message') return null;

        return {
            currentVersion: item.currentVersion,
            versions: Object.keys(item.versions || {}),
            hasMultipleVersions: Object.keys(item.versions || {}).length > 1
        };
    };

    // ========================================
    // 三、写入操作
    // ========================================

    /**
     * 批量删除消息
     * @param locators - 要删除的消息定位符数组
     */
    const deleteMessages = (locators: MessageLocator[]) => {
        const indices = locators
            .map(loc => resolveLocator(loc, messages()))
            .filter(idx => idx >= 0)
            .sort((a, b) => b - a); // 从后往前删除，避免索引偏移

        if (indices.length === 0) return;

        messages.update(prev => {
            const newMessages = [...prev];
            indices.forEach(idx => newMessages.splice(idx, 1));
            return newMessages;
        });
    };

    /**
     * 在指定消息之后插入新消息
     * @param after - 插入位置（在此消息之后）
     * @param item - 新消息项
     */
    const insertAfter = (after: MessageLocator, item: IChatSessionMsgItem) => {
        const index = resolveLocator(after, messages());
        if (index === -1) {
            // 如果找不到，添加到末尾
            messages.update(prev => [...prev, item]);
            return;
        }

        messages.update(prev => {
            const newMessages = [...prev];
            newMessages.splice(index + 1, 0, item);
            return newMessages;
        });
    };

    /**
     * 插入空白消息
     * @param after - 插入位置
     * @param role - 消息角色
     */
    const insertBlank = (after: MessageLocator, role: 'user' | 'assistant'): string => {
        const id = newID();
        const timestamp = new Date().getTime();

        const builder = new MessageBuilder();
        builder.addText('');

        let message: IUserMessage | IAssistantMessage;
        if (role === 'user') {
            message = builder.buildUser();
        } else {
            // 手动构建 assistant 消息
            message = {
                role: 'assistant',
                content: ''
            };
        }

        const newItem: IChatSessionMsgItem = {
            type: 'message',
            id,
            timestamp,
            author: role === 'user' ? 'user' : 'Bot',
            message,
            currentVersion: timestamp.toString(),
            versions: {}
        };

        insertAfter(after, newItem);
        return id;
    };

    /**
     * 创建消息分支
     * @param at - 分支起点
     * @param options - 分支选项
     */
    const createBranch = (
        at: MessageLocator,
        options: {
            branchContent?: string;
            keepAfter?: boolean;
        } = {}
    ): string => {
        const index = resolveLocator(at, messages());
        if (index === -1) return '';

        const item = messages()[index];
        if (item.type !== 'message') return '';

        const { branchContent, keepAfter = false } = options;

        // 创建新版本
        const newVersionId = new Date().getTime().toString();
        const content = branchContent ?? getContent(at);

        messages.update(index, (prev: IChatSessionMsgItem) => {
            const copied = structuredClone(prev);
            const stagedItem = stageMsgItemVersion(copied);

            stagedItem.versions = stagedItem.versions || {};
            stagedItem.versions[newVersionId] = {
                content,
                reasoning_content: '',
                author: item.author,
                timestamp: new Date().getTime(),
                token: null,
                time: null
            };

            stagedItem.message.content = updateContentText(stagedItem.message.content, content);
            stagedItem.currentVersion = newVersionId;

            return stagedItem;
        });

        // 如果不保留后续消息，删除之后的所有消息
        if (!keepAfter) {
            const afterMessages = messages().slice(index + 1);
            deleteMessages(afterMessages.map(m => ({ id: m.id })));
        }

        return newVersionId;
    };

    /**
     * 现有的 appendUserMsg 方法（保持不变）
     */
    const appendUserMsg = async (msg: string, multiModalAttachments?: TMessageContentPart[], contexts?: IProvidedContext[]) => {
        const builder = new MessageBuilder();

        // 附加 context
        let optionalFields: Partial<IChatSessionMsgItem> = {};
        if (contexts && contexts?.length > 0) {
            const result = mergeInputWithContext(msg, contexts);
            msg = result.content;
            optionalFields['context'] = contexts;
            optionalFields['userPromptSlice'] = result.userPromptSlice;
        }

        // 添加多模态附件（已经是 TMessageContentPart 格式）
        if (multiModalAttachments && multiModalAttachments.length > 0) {
            builder.addParts(multiModalAttachments);
            optionalFields['multiModalAttachments'] = multiModalAttachments;
        }

        // 添加文本内容（用户输入）
        builder.addText(msg);

        const userMessage: IUserMessage = builder.buildUser();

        const timestamp = new Date().getTime();
        messages.update(prev => [...prev, {
            type: 'message',
            id: newID(),
            timestamp: timestamp,
            author: 'user',
            message: userMessage,
            currentVersion: timestamp.toString(),
            versions: {},
            ...optionalFields
        }]);
        return timestamp;
    }

    const toggleSeperator = (index?: number) => {
        if (messages().length === 0) return;

        if (index !== undefined) {
            // 检查下一条消息
            const nextIndex = index + 1;
            if (nextIndex < messages().length) {
                if (messages()[nextIndex].type === 'seperator') {
                    // 如果下一条是分隔符，删除它
                    messages.update(prev => {
                        const newMessages = [...prev];
                        newMessages.splice(nextIndex, 1);
                        return newMessages;
                    });
                } else {
                    // 如果下一条不是分隔符，添加一个
                    messages.update(prev => {
                        const newMessages = [...prev];
                        newMessages.splice(nextIndex, 0, {
                            type: 'seperator',
                            id: newID()
                        });
                        return newMessages;
                    });
                }
            } else {
                // 如果是最后一条消息，就在后面添加分隔符
                messages.update(prev => [...prev, {
                    type: 'seperator',
                    id: newID()
                }]);
            }
        } else {
            // 原来的末尾添加/删除逻辑
            const last = messages()[messages().length - 1];
            if (last.type === 'seperator') {
                messages.update(prev => prev.slice(0, -1));
            } else {
                messages.update(prev => [...prev, {
                    type: 'seperator',
                    id: newID()
                }]);
            }
        }
    }

    const toggleSeperatorAt = (index: number) => {
        if (index < 0 || index >= messages().length) return;
        toggleSeperator(index);
    }

    const toggleHidden = (index: number, value?: boolean) => {
        if (index < 0 || index >= messages().length) return;
        const targetMsg = messages()[index];
        if (targetMsg.type !== 'message') return;
        messages.update(index, 'hidden', value ?? !targetMsg.hidden);
    }

    const togglePinned = (index: number, value?: boolean) => {
        if (index < 0 || index >= messages().length) return;
        const targetMsg = messages()[index];
        if (targetMsg.type !== 'message') return;
        messages.update(index, 'pinned', value ?? !targetMsg.pinned);
    }

    const addMsgItemVersion = (itemId: string, content: string) => {
        // #BUG 如果是附带了 tool  等；涉及到 prompt sclice 的场景，这里会有 bug
        const index = messages().findIndex(item => item.id === itemId);
        if (index === -1) return;
        messages.update(index, (prev: IChatSessionMsgItem) => {
            const copied = structuredClone(prev);
            // 首先确保当前的 message 已经被保存为一个版本
            const stagedItem = stageMsgItemVersion(copied);
            // 然后为新内容创建一个新版本
            const newVersionId = new Date().getTime().toString();
            // 确保 versions 存在
            stagedItem.versions = stagedItem.versions || {};
            // 添加新版本
            stagedItem.versions[newVersionId] = {
                content: content,
                reasoning_content: '',
                author: 'User',
                timestamp: new Date().getTime(),
                token: null,
                time: null
            };
            // 更新当前消息为新版本
            // stagedItem.message.content = content;
            // stagedItem.message.content = adaptIMessageContentSetter(stagedItem.message.content, content);
            stagedItem.message.content = updateContentText(stagedItem.message.content, content);
            stagedItem.author = 'User';
            stagedItem.timestamp = new Date().getTime();
            stagedItem.currentVersion = newVersionId;

            return stagedItem;
        })
    }

    const switchMsgItemVersion = (itemId: string, version: string) => {
        const index = messages().findIndex(item => item.id === itemId);
        if (index === -1) return;
        const msgItem = messages()[index];
        if (msgItem.currentVersion === version) return;
        if (!msgItem.versions) return;
        if (Object.keys(msgItem.versions).length <= 1) return;
        const msgContent = msgItem.versions[version];
        if (!msgContent) return;
        messages.update(index, (prev: IChatSessionMsgItem) => {
            // const copied = structuredClone(prev);
            // return applyMsgItemVersion(copied, version);
            return applyMsgItemVersion(prev, version);
        });
        return new Date().getTime(); // Return updated timestamp
    }

    const delMsgItemVersion = (itemId: string, version: string, autoSwitch = true) => {
        const index = messages().findIndex(item => item.id === itemId);
        if (index === -1) return;
        const msgItem = messages()[index];
        let switchFun = () => { };
        let switchedToVersion: string | undefined;
        if (!msgItem.versions || msgItem.versions[version] === undefined) {
            showMessage('此版本不存在');
            return;
        }
        if (msgItem.currentVersion === version) {
            const versionLists = Object.keys(msgItem.versions);
            if (versionLists.length <= 1) {
                showMessage('当前版本不能删除');
                return;
            } else if (autoSwitch) {
                const idx = versionLists.indexOf(version);
                const newIdx = idx === 0 ? versionLists.length - 1 : idx - 1;
                switchedToVersion = versionLists[newIdx];
                switchFun = () => switchMsgItemVersion(itemId, switchedToVersion!);
            }
        }

        // TODO: 记录删除操作到撤销栈（稍后在函数重新定义时添加）

        let updatedTimestamp;
        batch(() => {
            updatedTimestamp = switchFun();
            messages.update(index, (item: IChatSessionMsgItem) => {
                if (item.versions?.[version] !== undefined) {
                    delete item.versions[version];
                }
                return item;
            });
            if (!updatedTimestamp) {
                updatedTimestamp = new Date().getTime();
            }
        });

        return updatedTimestamp;
    }

    return {
        // ID 生成
        newID,

        // ========== 读取访问 ==========
        // 数量和存在性检查
        count,
        hasMessages,

        // 参数化定位获取
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

        // ========== 写入操作 ==========
        // 基本写入
        appendUserMsg,
        deleteMessages,
        insertAfter,
        insertBlank,
        createBranch,

        // Toggle 操作（保留旧接口兼容）
        toggleSeperator,
        toggleSeperatorAt,
        toggleHidden,
        togglePinned,

        // 版本管理
        addMsgItemVersion,
        switchMsgItemVersion,
        delMsgItemVersion
    };
};


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
    const messages = useStoreRef<IChatSessionMsgItem[]>([]);
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
        const history = [...messages.unwrap()];
        const targetIndex = fromIndex ?? history.length - 1;
        const targetMessage = history[targetIndex];

        const isAttachable = (msg: IChatSessionMsgItem) => {
            return msg.type === 'message' && !msg.hidden && !msg.loading;
        }

        // 从指定位置向前截取历史消息
        const previousMessages = history.slice(0, targetIndex);

        // 1. 获取滑动窗口内的消息 (Window Messages)
        let attachedMessages: IChatSessionMsgItem[] = [];

        if (itemNum > 0) {
            let lastMessages: IChatSessionMsgItem[] = previousMessages;

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

            //查找最后一个为 seperator 的消息
            let lastSeperatorIndex = -1;
            for (let i = lastMessages.length - 1; i >= 0; i--) {
                if (lastMessages[i].type === 'seperator') {
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
            let lastMessages: IChatSessionMsgItem[] = previousMessages;

            //查找最后一个为 seperator 的消息
            let lastSeperatorIndex = -1;
            for (let i = lastMessages.length - 1; i >= 0; i--) {
                if (lastMessages[i].type === 'seperator') {
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
        const finalIds = new Set([...attachedMessages, ...pinnedMessages].map((m: IChatSessionMsgItem) => m.id));
        const finalContext = previousMessages.filter((m: IChatSessionMsgItem) => finalIds.has(m.id));

        return [...finalContext, targetMessage].map((item: IChatSessionMsgItem) => item.message!);
    }

    // 使用消息管理 hook
    const msgMgr = useMessageManagement({
        messages
    });

    // 解构常用方法（保持向后兼容）
    const {
        appendUserMsg: appendUserMsgInternal,
        toggleSeperator,
        toggleSeperatorAt,
        toggleHidden,
        togglePinned,
        addMsgItemVersion,
        switchMsgItemVersion,
        delMsgItemVersion
    } = msgMgr;

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
        messages,
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
            // 临时插入一个虚假的消息
            let tempId = window.Lute.NewNodeID();
            //@ts-ignore
            messages.update(prev => [...prev, {
                type: '',  // 临时加入的虚假消息
                id: tempId,
                message: { role: 'user', content: '' },
                author: props.model().model,
                timestamp: new Date().getTime(),
                loading: false
            }]);
            let attached = getAttachedHistory(props.config().attachedHistory);
            //删掉临时插入的消息
            messages.update(prev => prev.filter(item => item.id !== tempId));
            return attached;
        }
        return getAttachedHistory(props.config().attachedHistory, index);
    }

    // 定义 sessionHistory 函数
    const sessionHistory = (): IChatSessionHistory => {
        return {
            id: sessionId(),
            timestamp,
            updated,
            title: title(),
            items: messages.unwrap(),
            sysPrompt: systemPrompt(),
            tags: sessionTags(),
            customOptions: modelCustomOptions.unwrap()
        }
    }

    // 定义 applyHistory 函数
    const applyHistory = (history: Partial<IChatSessionHistory>) => {
        history.id && (sessionId.value = history.id);
        history.title && (title.update(history.title));
        history.timestamp && (timestamp = history.timestamp);
        history.updated && (updated = history.updated);
        history.items && (messages.update(history.items));
        history.sysPrompt && (systemPrompt.update(history.sysPrompt));
        history.tags && (sessionTags.update(history.tags));
        history.customOptions && (modelCustomOptions.update(history.customOptions));

        // 清空删除历史（加载新历史记录时）
        deleteHistory.clearRecords();
    }

    // 定义 newSession 函数
    const newSession = () => {
        sessionId.value = window.Lute.NewNodeID();
        // systemPrompt.update('');
        systemPrompt.value = globalMiscConfigs().defaultSystemPrompt || '';
        timestamp = new Date().getTime();
        updated = timestamp + 1;
        title.update('新的对话');
        messages.update([]);
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
        // ========== messages 访问已封装 ==========
        // 移除直接的 messages 暴露，用 msgMgr 代替
        // messages,

        // ========== 消息管理封装接口 ==========
        // 数量和存在性检查
        getMessageCount: msgMgr.count,
        hasMessages: msgMgr.hasMessages,

        // 获取活动消息（用于显示）
        getActiveMessages: () => messages(), // 只读访问

        // 参数化访问
        getMessageAt: msgMgr.getAt,
        getMessageIndex: msgMgr.indexOf,
        getMessagesBefore: msgMgr.getBefore,
        getMessagesAfter: msgMgr.getAfter,
        getMessagesByIds: msgMgr.getByIds,

        // Item 字段访问
        getMessageContent: msgMgr.getContent,
        getMessageRole: msgMgr.getRole,
        isMessageHidden: msgMgr.isHidden,
        isMessagePinned: msgMgr.isPinned,
        getMessageVersionInfo: msgMgr.getVersionInfo,

        // 写入操作
        deleteMessages: (locators: MessageLocator[]) => {
            if (loading()) return;

            // 记录每条被删除的消息到历史
            locators.forEach(loc => {
                const item = msgMgr.getAt(loc);
                if (!item || item.type !== 'message') return;

                const content = extractContentText(item.message.content);
                deleteHistory.addRecord({
                    type: 'message',
                    sessionId: sessionId(),
                    sessionTitle: title(),
                    content: content,
                    timestamp: item.timestamp || Date.now(),
                    author: item.author,
                    totalVersions: item.versions ? Object.keys(item.versions).length : 1,
                    originalItem: {
                        id: item.id,
                        message: item.message,
                        currentVersion: item.currentVersion,
                        versions: item.versions,
                        context: item.context,
                        userPromptSlice: item.userPromptSlice,
                        token: item.token,
                        usage: item.usage,
                        time: item.time,
                        author: item.author,
                        timestamp: item.timestamp,
                        title: item.title,
                        attachedItems: item.attachedItems,
                        attachedChars: item.attachedChars
                    },
                    extra: {
                        messageId: item.id,
                        author: item.author
                    }
                });
            });

            // 执行批量删除
            msgMgr.deleteMessages(locators);
            renewUpdatedTimestamp();
        },
        insertMessageAfter: (after: MessageLocator, item: IChatSessionMsgItem) => {
            msgMgr.insertAfter(after, item);
            renewUpdatedTimestamp();
        },
        insertBlankMessage: (after: MessageLocator, role: 'user' | 'assistant') => {
            const id = msgMgr.insertBlank(after, role);
            renewUpdatedTimestamp();
            return id;
        },
        createMessageBranch: (at: MessageLocator, options?: { branchContent?: string; keepAfter?: boolean }) => {
            const versionId = msgMgr.createBranch(at, options);
            renewUpdatedTimestamp();
            return versionId;
        },

        // ========== 其他状态 ==========
        modelCustomOptions: modelCustomOptions,
        loading,
        title,
        multiModalAttachments,
        contexts,
        toolExecutor,
        sessionTags,

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
        updateMessageMetadata: (at: MessageLocator, metadata: Partial<IChatSessionMsgItem>) => {
            const index = msgMgr.indexOf(at);
            if (index === -1) return;

            messages.update(index, (prev) => ({ ...prev, ...metadata }));
            renewUpdatedTimestamp();
        },

        // ========== 版本管理（委托给 msgMgr）==========
        addMsgItemVersion: (itemId: string, content: string) => {
            addMsgItemVersion(itemId, content);
            renewUpdatedTimestamp();
        },
        switchMsgItemVersion: (itemId: string, version: string) => {
            switchMsgItemVersion(itemId, version);
            renewUpdatedTimestamp();
        },
        delMsgItemVersion: (itemId: string, version: string, autoSwitch = true) => {
            // 使用 msgMgr 访问而不是直接访问 messages()
            const index = msgMgr.indexOf({ id: itemId });
            if (index === -1) return;

            const msgItem = msgMgr.getAt(index);
            if (!msgItem || msgItem.type !== 'message') return;

            // 记录版本删除到历史
            if (msgItem.versions?.[version]) {
                const versionContent = msgItem.versions[version];
                const textContent = extractContentText(versionContent.content);

                deleteHistory.addRecord({
                    type: 'version',
                    sessionId: sessionId(),
                    sessionTitle: title(),
                    content: textContent.trim() || '多媒体内容',
                    timestamp: versionContent.timestamp || Date.now(),
                    author: versionContent.author,
                    versionId: version,
                    originalItem: {
                        id: msgItem.id,
                        message: msgItem.message,
                        currentVersion: msgItem.currentVersion,
                        versions: msgItem.versions,
                        context: msgItem.context,
                        userPromptSlice: msgItem.userPromptSlice,
                        token: msgItem.token,
                        usage: msgItem.usage,
                        time: msgItem.time,
                        author: msgItem.author,
                        timestamp: msgItem.timestamp,
                        title: msgItem.title,
                        attachedItems: msgItem.attachedItems,
                        attachedChars: msgItem.attachedChars
                    },
                    extra: {
                        messageId: itemId,
                        versionId: version,
                        author: versionContent.author
                    }
                });
            }

            delMsgItemVersion(itemId, version, autoSwitch);
            renewUpdatedTimestamp();
        },

        // 消息更新函数（使用 msgMgr 访问）
        updateMessage: (index: number, newContent: string) => {
            const item = msgMgr.getAt(index);
            if (!item || item.type !== 'message') return;

            const { contextPrompt } = splitPromptFromContext(item);
            const newText = contextPrompt + newContent;

            batch(() => {
                const updatedContent = updateContentText(item.message.content, newText);
                messages.update(index, 'message', 'content', updatedContent)

                // 更新 userPromptSlice
                if (contextPrompt && contextPrompt.length > 0) {
                    const contextLength = contextPrompt.length;
                    messages.update(index, 'userPromptSlice', [contextLength, contextLength + newContent.length]);
                }

                // 如果是多版本消息，同时更新当前版本
                if (isMsgItemWithMultiVersion(item)) {
                    messages.update(index, 'versions', item.currentVersion, 'content', newText);
                }
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
