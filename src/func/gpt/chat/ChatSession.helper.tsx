// External libraries
import { showMessage } from 'siyuan';
import { Accessor, batch, createMemo } from 'solid-js';
import { IStoreRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

// Local components and utilities
import Form from '@/libs/components/Form';
import { createSimpleContext } from '@/libs/simple-context';

// GPT-related imports
import * as gpt from '@gpt/openai';
import { ChatSetting } from '@gpt/setting';
import { UIConfig, globalMiscConfigs, promptTemplates, useModel } from '@gpt/setting/store';
import {
    adaptIMessageContent,
    mergeInputWithContext,
    applyMsgItemVersion,
    stageMsgItemVersion
} from '@gpt/data-utils';
import { assembleContext2Prompt } from '@gpt/context-provider';

interface ISimpleContext {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    session: ReturnType<typeof useSession>;
    [key: string]: any
}

const { SimpleProvider, useSimpleContext } = createSimpleContext<ISimpleContext>();

export {
    SimpleProvider,
    useSimpleContext
}

/**
 * 消息管理相关的 hook
 */
const useMessageManagement = (params: {
    messages: IStoreRef<IChatSessionMsgItem[]>;
    contexts: IStoreRef<IProvidedContext[]>;
}) => {
    const { messages, contexts } = params;

    const newID = () => {
        return window.Lute.NewNodeID();
    }

    const appendUserMsg = async (msg: string, images?: Blob[], contexts?: IProvidedContext[]) => {
        let content: IMessageContent[];

        let optionalFields: Partial<IChatSessionMsgItem> = {};
        if (contexts && contexts?.length > 0) {
            const result = mergeInputWithContext(msg, contexts);
            msg = result.content;
            optionalFields['context'] = contexts;
            optionalFields['userPromptSlice'] = result.userPromptSlice;
        }

        if (images && images?.length > 0) {

            content = [{
                type: "text",
                text: msg
            }];

            // 添加所有图片
            await Promise.all(images.map(async (image) => {
                const base64data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const result = reader.result as string;
                        // 只获取 base64 部分（移除 data:image/jpeg;base64, 前缀）
                        resolve(result.split(',')[1]);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(image);
                });
                content.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${base64data}`
                    }
                });
            }));
        }
        const timestamp = new Date().getTime();
        messages.update(prev => [...prev, {
            type: 'message',
            id: newID(),
            timestamp: timestamp,
            author: 'user',
            message: {
                role: 'user',
                content: content ?? msg
            },
            currentVersion: timestamp.toString(),
            versions: {},
            ...optionalFields
        }]);
        return timestamp;
    }

    /**
     * 在已经 appendUserMsg 的情况下，重新更新 context 内容
     */
    const updateUserMsgContext = () => {
        // Get the latest messages
        const currentMessages = messages();
        if (currentMessages.length === 0) return;

        // Find the latest user message
        let lastUserMsgIndex = -1;
        for (let i = currentMessages.length - 1; i >= 0; i--) {
            if (currentMessages[i].type === 'message' && currentMessages[i].author === 'user') {
                lastUserMsgIndex = i;
                break;
            }
        }

        if (lastUserMsgIndex === -1) return; // No user message found

        const lastUserMsg = currentMessages[lastUserMsgIndex];

        // Get the current contexts
        const currentContexts = contexts();
        if (!currentContexts || currentContexts.length === 0) return;

        // Get the original user prompt (without context)
        let userPrompt = '';
        let content = lastUserMsg.message?.content;

        if (typeof content === 'string') {
            // If content is string, use userPromptSlice if available, otherwise use the whole content
            userPrompt = lastUserMsg.userPromptSlice
                ? content.slice(lastUserMsg.userPromptSlice[0], lastUserMsg.userPromptSlice[1])
                : content;
        } else if (Array.isArray(content) && content.length > 0 && content[0].type === 'text') {
            // If content is an array (with images), get the text part
            userPrompt = lastUserMsg.userPromptSlice
                ? content[0].text.slice(lastUserMsg.userPromptSlice[0], lastUserMsg.userPromptSlice[1])
                : content[0].text;
        } else {
            return; // Unsupported content format
        }

        // Assemble new context prompts
        const contextPrompts = assembleContext2Prompt(currentContexts);

        messages.update(lastUserMsgIndex, prev => {
            // Create a new message object with updated content
            const updatedMsg = { ...prev };

            // Update context and userPromptSlice
            updatedMsg.context = currentContexts;
            const finalContent = contextPrompts ? `${contextPrompts}\n\n${userPrompt}` : userPrompt;

            // Update userPromptSlice to point to the user input portion after context
            const contextLength = contextPrompts ? contextPrompts.length + 2 : 0; // +2 for \n\n
            updatedMsg.userPromptSlice = [contextLength, contextLength + userPrompt.length];

            // Update the content based on its type
            if (typeof updatedMsg.message.content === 'string') {
                updatedMsg.message = {
                    ...updatedMsg.message,
                    content: finalContent
                };
            } else if (Array.isArray(updatedMsg.message.content) && updatedMsg.message.content.length > 0) {
                // For content with images, update only the text part
                const newContent = [...updatedMsg.message.content];
                newContent[0] = {
                    ...newContent[0],
                    text: finalContent
                };

                updatedMsg.message = {
                    ...updatedMsg.message,
                    content: newContent
                };
            }

            return updatedMsg;
        });
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
            const copied = structuredClone(prev);
            return applyMsgItemVersion(copied, version);
        });
        return new Date().getTime(); // Return updated timestamp
    }

    const delMsgItemVersion = (itemId: string, version: string, autoSwitch = true) => {
        const index = messages().findIndex(item => item.id === itemId);
        if (index === -1) return;
        const msgItem = messages()[index];
        let switchFun = () => { };
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
                switchFun = () => switchMsgItemVersion(itemId, versionLists[newIdx]);
            }
        }

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
        newID,
        appendUserMsg,
        updateUserMsgContext,
        toggleSeperator,
        toggleSeperatorAt,
        toggleHidden,
        switchMsgItemVersion,
        delMsgItemVersion
    };
};

/**
 * 上下文和附件管理相关的 hook
 */
const useContextAndAttachments = (params: {
    contexts: IStoreRef<IProvidedContext[]>;
    attachments: ReturnType<typeof useSignalRef<Blob[]>>;
}) => {
    const { contexts, attachments } = params;

    const setContext = (context: IProvidedContext) => {
        const currentIds = contexts().map(c => c.id);
        if (currentIds.includes(context.id)) {
            const index = currentIds.indexOf(context.id);
            contexts.update(index, context);
        } else {
            contexts.update(prev => [...prev, context]);
        }
    }

    const delContext = (id: IProvidedContext['id']) => {
        contexts.update(prev => prev.filter(c => c.id !== id));
    }

    const removeAttachment = (attachment: Blob) => {
        attachments.update((prev: Blob[]) => prev.filter((a: Blob) => a !== attachment));
    }

    const addAttachment = (blob: Blob) => {
        attachments.update((prev: Blob[]) => [...prev, blob]);
    }

    return {
        setContext,
        delContext,
        removeAttachment,
        addAttachment
    };
};

/**
 * GPT 通信相关的 hook
 */
const useGptCommunication = (params: {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    messages: IStoreRef<IChatSessionMsgItem[]>;
    systemPrompt: ReturnType<typeof useSignalRef<string>>;
    loading: ReturnType<typeof useSignalRef<boolean>>;
    newID: () => string;
    getAttachedHistory: (itemNum?: number, fromIndex?: number) => IMessage[];
}) => {
    const { model, config, messages, systemPrompt, loading, newID, getAttachedHistory } = params;

    let controller: AbortController;

    // src/func/gpt/components/ChatSession.tsx
    const gptOption = () => {
        let option = { ...config().chatOption };
        return option;
    }

    const customComplete = async (messageToSend: IMessage[] | string, options?: {
        stream?: boolean;
        model?: IGPTModel;
        chatOption?: Partial<IChatOption>;
    }) => {
        try {
            const modelToUse = options?.model ?? model();
            const baseOption = gptOption();
            const { content } = await gpt.complete(messageToSend, {
                model: modelToUse,
                option: options?.chatOption ? { ...baseOption, ...options.chatOption } : baseOption,
                stream: options?.stream ?? false,
            });
            return content;
        } catch (error) {
            console.error('Error:', error);
        }
    }

    const autoGenerateTitle = async () => {
        let attachedHistory = config().attachedHistory;
        attachedHistory = Math.max(attachedHistory, 0);
        attachedHistory = Math.min(attachedHistory, 6);
        const histories = getAttachedHistory(attachedHistory);
        if (histories.length == 0) return;
        let sizeLimit = config().maxInputLenForAutoTitle;
        let averageLimit = Math.floor(sizeLimit / histories.length);

        let inputContent = histories.map(item => {
            let { text } = adaptIMessageContent(item.content);
            let clippedContent = text.substring(0, averageLimit);
            if (clippedContent.length < text.length) {
                clippedContent += '...(clipped as too long)'
            }
            return `<${item.role}>:\n${clippedContent}`;
        }).join('\n\n');
        const messageToSend = `
请根据以下对话生成唯一一个最合适的对话主题标题，字数控制在 15 字之内; 除了标题之外不要回复任何别的信息
---
${inputContent}
`.trim();
        let autoTitleModel = config().autoTitleModelId;
        let modelToUse = null;
        if (autoTitleModel) {
            modelToUse = useModel(autoTitleModel);
        }
        const newTitle = await customComplete(messageToSend, {
            model: modelToUse,
            stream: false,
            chatOption: {
                'max_tokens': 128,
                'temperature': 0.7,
                'frequency_penalty': null,
                'presence_penalty': null,
                'top_p': null
            }
        });
        return newTitle?.trim();
    }

    /**
     * 首先检查 index 是否在合法范围内
     * 确认无误
     * 如果为 user 信息，则同 sendMessage 逻辑一样，把 user 消息当作最新的输入，获得的 gpt 结果
     *  - 如果下一条本来就是 assistant 信息，则直接替换
     *  - 如果下一条是 user 信息，则插入一条新的 assistant 信息
     * 如果为 assistant 信息
     *  - 如果他的上一条为 user 信息，则等价于上面的情况，也就是最后会更新他自己
     *  - 如果他的上一条为 assistant 信息，则拒绝执行 rerun，并showMessage 报错
     */
    const reRunMessage = async (atIndex: number) => {
        if (atIndex < 0 || atIndex >= messages().length) return;
        const targetMsg = messages()[atIndex];
        if (targetMsg.type !== 'message' || targetMsg.hidden) {
            if (targetMsg.hidden) showMessage('无法重新生成此消息：已隐藏');
            return;
        }

        // 如果是 assistant 消息，检查上一条是否为 user 消息
        if (targetMsg.message.role === 'assistant') {
            if (atIndex === 0 || messages()[atIndex - 1].message?.role !== 'user' || messages()[atIndex - 1].hidden) {
                showMessage('无法重新生成此消息：需要用户输入作为前文');
                return;
            }
            atIndex = atIndex - 1; // 将焦点移到上一条 user 消息
        }

        loading.update(true);
        // scrollToBottom(); //不要滚动到最底部

        try {
            controller = new AbortController();
            const msgToSend = getAttachedHistory(config().attachedHistory, atIndex);
            let modelToUse = model();
            let option = gptOption();
            // 更新或插入 assistant 消息
            const nextIndex = atIndex + 1;
            // const nextMsg = messages()[nextIndex];

            // 准备或更新目标消息; 如果下一条消息是普通的 assistant 消息，则更新它
            if (messages()[nextIndex]?.message?.role === 'assistant' && !messages()[nextIndex].hidden) {
                messages.update(prev => {
                    const updated = [...prev];
                    const item = structuredClone(updated[nextIndex]);
                    item['loading'] = true;
                    stageMsgItemVersion(item);
                    updated[nextIndex] = item;
                    return updated;
                });
            } else {
                // 插入新的 assistant 消息
                const timestamp = new Date().getTime();
                messages.update(prev => {
                    const updated = [...prev];
                    updated.splice(nextIndex, 0, {
                        type: 'message',
                        id: newID(),
                        timestamp: timestamp,
                        author: modelToUse.model,
                        loading: true,
                        message: {
                            role: 'assistant',
                            content: ''
                        },
                        currentVersion: timestamp.toString(),
                        versions: {}
                    });
                    return updated;
                });
            }

            const { content, usage, reasoning_content } = await gpt.complete(msgToSend, {
                model: modelToUse,
                systemPrompt: systemPrompt().trim() || undefined,
                stream: option.stream ?? true,
                streamInterval: 2,
                streamMsg(msg) {
                    messages.update(nextIndex, 'message', 'content', msg);
                    // scrollToBottom();
                },
                abortControler: controller,
                option: option,
            });

            // 更新最终内容
            const vid = new Date().getTime().toString();
            messages.update(nextIndex, (msgItem: IChatSessionMsgItem) => {
                const newMessageContent: IMessage = {
                    role: 'assistant',
                    content: content,
                };
                if (reasoning_content) {
                    newMessageContent['reasoning_content'] = reasoning_content;
                }
                // 记录最新版本的消息
                msgItem = {
                    ...msgItem,
                    loading: false,
                    message: newMessageContent,
                    author: modelToUse.model,
                    timestamp: new Date().getTime(),
                    attachedItems: msgToSend.length,
                    attachedChars: msgToSend.map(i => i.content.length).reduce((a, b) => a + b, 0)
                };
                if (usage && usage.completion_tokens) {
                    msgItem['token'] = usage.completion_tokens;
                }
                // delete msgItem['loading'];
                msgItem = stageMsgItemVersion(msgItem, vid);
                return msgItem;
            });

            messages.update(nextIndex, (item: IChatSessionMsgItem) => {
                let newItem = structuredClone(item);
                return stageMsgItemVersion(newItem);
            });

            if (usage) {
                batch(() => {
                    messages.update(nextIndex, 'token', usage?.completion_tokens);
                    messages.update(atIndex, 'token', usage?.prompt_tokens);
                });
            }

            // scrollToBottom(); rerun, 不需要滚动到底部
        } catch (error) {
            console.error('Error:', error);
        } finally {
            loading.update(false);
            controller = null;
        }
    };

    /**
     * 发送用户消息
     * @param userMessage 用户消息
     * @param options 选项
     * @param options.tavily 是否启用 Tavily 网络搜索
     */
    const sendMessage = async (
        userMessage: string,
        attachments: Blob[],
        contexts: IProvidedContext[],
        scrollToBottom?: (force?: boolean) => void,
        options?: {
            tavily?: boolean;
        }
    ) => {
        if (!userMessage.trim() && attachments.length === 0 && contexts.length === 0) return;

        let sysPrompt = systemPrompt().trim() || '';

        // 这里不再调用 appendUserMsg，而是由外部调用
        loading.update(true);

        try {
            controller = new AbortController();
            const msgToSend = getAttachedHistory();
            let modelToUse = model();
            let option = gptOption();

            // 添加助手消息占位
            const assistantMsg: IChatSessionMsgItem = {
                type: 'message',
                id: newID(),
                token: null,
                message: { role: 'assistant', content: '' },
                author: modelToUse.model,
                timestamp: new Date().getTime(),
                loading: true,
                versions: {}
            };
            messages.update(prev => [...prev, assistantMsg]);
            const updatedTimestamp = new Date().getTime(); // Update the updated time when adding a message

            // scrollToBottom();

            const lastIdx = messages().length - 1;
            const { content, usage, reasoning_content } = await gpt.complete(msgToSend, {
                model: modelToUse,
                systemPrompt: sysPrompt || undefined,
                stream: option.stream ?? true,
                streamInterval: 2,
                streamMsg(msg) {
                    messages.update(lastIdx, 'message', 'content', msg);
                    scrollToBottom && scrollToBottom(false);  // 不强制滚动，尊重用户的滚动位置
                },
                abortControler: controller,
                option: option,
            });

            const vid = new Date().getTime().toString();
            const newMessageContent: IMessage = {
                role: 'assistant',
                content: content
            }
            if (reasoning_content) {
                newMessageContent['reasoning_content'] = reasoning_content;
            }
            // 更新最终内容
            messages.update(prev => {
                const lastIdx = prev.length - 1;
                const updated = [...prev];
                updated[lastIdx] = {
                    ...updated[lastIdx],
                    loading: false,
                    message: newMessageContent,
                    author: modelToUse.model,
                    timestamp: new Date().getTime(),
                    attachedItems: msgToSend.length,
                    attachedChars: msgToSend.map(i => i.content.length).reduce((a, b) => a + b, 0),
                    currentVersion: vid,
                    versions: {}  // 新消息只有一个版本，就暂时不需要存放多 versions, 空着就行
                };
                delete updated[lastIdx]['loading'];
                // updated[lastIdx] = stageMsgItemVersion(updated[lastIdx]);
                return updated;
            });

            if (usage) {
                batch(() => {
                    const lastIdx = messages().length - 1;
                    if (lastIdx < 1) return;
                    messages.update(lastIdx, 'token', usage?.completion_tokens);
                    messages.update(lastIdx - 1, 'token', usage?.prompt_tokens);
                });
            }

            // scrollToBottom(false);

            return { updatedTimestamp, hasResponse: true };
        } catch (error) {
            console.error('Error:', error);
            return { updatedTimestamp: new Date().getTime(), hasResponse: false };
        } finally {
            loading.update(false);
            controller = null;
        }
    }

    const abortMessage = () => {
        if (loading()) {
            controller && controller.abort();
        }
    }

    return {
        gptOption,
        customComplete,
        autoGenerateTitle,
        reRunMessage,
        sendMessage,
        abortMessage
    };
};

/**
 * 主会话 hook
 */
export const useSession = (props: {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    scrollToBottom: (force?: boolean) => void;
}) => {
    let sessionId = useSignalRef<string>(window.Lute.NewNodeID());

    const systemPrompt = useSignalRef<string>(globalMiscConfigs().defaultSystemPrompt || '');
    // 当前的 attachments
    const attachments = useSignalRef<Blob[]>([]);
    const contexts = useStoreRef<IProvidedContext[]>([]);

    let timestamp = new Date().getTime();
    let updated = timestamp; // Initialize updated time to match creation time
    const title = useSignalRef<string>('新的对话');
    const messages = useStoreRef<IChatSessionMsgItem[]>([]);
    const sessionTags = useStoreRef<string[]>([]);
    const loading = useSignalRef<boolean>(false);
    // const streamingReply = useSignalRef<string>('');

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

    const newID = () => {
        return window.Lute.NewNodeID();
    }

    // 获取历史消息的函数
    const getAttachedHistory = (itemNum?: number, fromIndex?: number) => {
        if (itemNum === undefined) {
            itemNum = props.config().attachedHistory;
        }
        const history = [...messages.unwrap()];
        const targetIndex = fromIndex ?? history.length - 1;
        const targetMessage = history[targetIndex];

        if (itemNum === 0) {
            return [targetMessage.message!];
        }

        const isAttachable = (msg: IChatSessionMsgItem) => {
            return msg.type === 'message' && !msg.hidden;
        }

        // 从指定位置向前截取历史消息
        const previousMessages = history.slice(0, targetIndex);
        let lastMessages: IChatSessionMsgItem[] = previousMessages;
        if (itemNum > 0) {
            // 计算需要获取的消息数量，考虑hidden消息
            let visibleCount = 0;
            let startIndex = previousMessages.length - 1;

            while (startIndex >= 0) {
                const msg = previousMessages[startIndex];
                if (msg.type === 'message' && !msg.hidden) {
                    visibleCount++;
                    if (visibleCount >= itemNum) {
                        // startIndex = i;
                        break;
                    }
                }
                if (startIndex === 0) break;
                startIndex--;
            }

            lastMessages = previousMessages.slice(startIndex);
        }

        //查找最后一个为 seperator 的消息
        let lastSeperatorIndex = -1;
        for (let i = lastMessages.length - 1; i >= 0; i--) {
            if (lastMessages[i].type === 'seperator') {
                lastSeperatorIndex = i;
                break;
            }
        }

        let attachedMessages: IChatSessionMsgItem[] = [];
        if (lastSeperatorIndex === -1) {
            attachedMessages = lastMessages.filter(isAttachable);
        } else {
            attachedMessages = lastMessages.slice(lastSeperatorIndex + 1).filter(isAttachable);
        }

        return [...attachedMessages, targetMessage].map(item => item.message!);
    }

    // 使用消息管理 hook
    const {
        appendUserMsg: appendUserMsgInternal,
        // updateUserMsgContext,
        toggleSeperator,
        toggleSeperatorAt,
        toggleHidden,
        switchMsgItemVersion,
        delMsgItemVersion
    } = useMessageManagement({
        messages,
        contexts
    });

    // 使用上下文和附件管理 hook
    const {
        setContext,
        delContext,
        removeAttachment,
        addAttachment
    } = useContextAndAttachments({
        contexts,
        attachments
    });

    // 使用 GPT 通信 hook
    const {
        // gptOption,
        // customComplete,
        autoGenerateTitle: autoGenerateTitleInternal,
        reRunMessage: reRunMessageInternal,
        sendMessage: sendMessageInternal,
        abortMessage
    } = useGptCommunication({
        model: props.model,
        config: props.config,
        messages,
        systemPrompt,
        loading,
        newID,
        getAttachedHistory
    });

    // 包装 appendUserMsg 以更新 updated 时间戳
    const appendUserMsg = async (msg: string, images?: Blob[], contexts?: IProvidedContext[]) => {
        const timestamp = await appendUserMsgInternal(msg, images, contexts);
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
    const sendMessage = async (userMessage: string, options?: {
        tavily?: boolean;
    }) => {
        if (!userMessage.trim() && attachments().length === 0 && contexts().length === 0) return;

        await appendUserMsg(userMessage, attachments(), [...contexts.unwrap()]);

        const result = await sendMessageInternal(
            userMessage,
            attachments(),
            [...contexts.unwrap()],
            props.scrollToBottom,
            options
        );

        if (result?.updatedTimestamp) {
            renewUpdatedTimestamp();
        }

        // Clear attachments after sending
        attachments.update([]);
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
            tags: sessionTags()
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
    }

    // 定义 newSession 函数
    const newSession = () => {
        sessionId.value = window.Lute.NewNodeID();
        // systemPrompt.update('');
        systemPrompt.value = globalMiscConfigs().defaultSystemPrompt || '';
        timestamp = new Date().getTime();
        updated = timestamp; // Reset updated time to match creation time
        title.update('新的对话');
        messages.update([]);
        sessionTags.update([]);
        loading.update(false);
        hasStarted = false;
    }

    const hooks = {
        sessionId,
        systemPrompt,
        messages,
        loading,
        title,
        attachments,
        contexts,
        sessionTags,
        hasUpdated: () => {
            return updated > timestamp;
        },
        msgId2Index,
        addAttachment,
        removeAttachment,
        setContext,
        delContext,
        autoGenerateTitle,
        reRunMessage,
        sendMessage,
        abortMessage,
        toggleHidden,
        toggleSeperatorAt,
        toggleNewThread,
        checkAttachedContext,
        sessionHistory,
        applyHistory,
        newSession,
        switchMsgItemVersion: (itemId: string, version: string) => {
            switchMsgItemVersion(itemId, version);
            renewUpdatedTimestamp();
        },
        delMsgItemVersion: (itemId: string, version: string, autoSwitch = true) => {
            delMsgItemVersion(itemId, version, autoSwitch);
            renewUpdatedTimestamp();
        }
    }
    return hooks;
}


export const useSessionSetting = () => {
    let context = useSimpleContext();
    let { config, session } = context;

    const availableSystemPrompts = (): Record<string, string> => {
        const systemPrompts = promptTemplates().filter(item => item.type === 'system');
        return systemPrompts.reduce((acc, cur) => {
            acc[cur.content] = cur.name;
            return acc;
        }, { '': 'No Prompt' });
    }

    return (
        <div class="fn__flex-1">
            <Form.Wrap
                title="System Prompt"
                description="附带的系统级提示消息"
                direction="row"
                action={
                    <Form.Input
                        type="select"
                        value={""}
                        changed={(v) => {
                            v = v.trim();
                            if (v) {
                                session.systemPrompt(v);
                            }
                        }}
                        options={availableSystemPrompts()}
                    />
                }
            >
                <Form.Input
                    type="textarea"
                    value={session.systemPrompt()}
                    changed={(v) => {
                        session.systemPrompt(v);
                    }}
                    style={{
                        height: '7em',
                        "font-size": UIConfig().inputFontsize + "px",
                        "line-height": "1.35"
                    }}
                />
            </Form.Wrap>
            <ChatSetting config={config} />
        </div>
    )

}