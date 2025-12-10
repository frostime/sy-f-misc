// External libraries
import { showMessage } from 'siyuan';
import { Accessor, batch, createMemo } from 'solid-js';
import { IStoreRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';
import { ToolChainResult } from '@gpt/tools/toolchain';

// Local components and utilities
import { createSimpleContext } from '@/libs/simple-context';

// GPT-related imports
import * as gpt from '@gpt/openai';
import { globalMiscConfigs, useModel } from '@/func/gpt/model/store';
import {
    adaptIMessageContentGetter,
    mergeInputWithContext,
    applyMsgItemVersion,
    stageMsgItemVersion,
    convertImgsToBase64Url,
    adaptIMessageContentSetter,
    isMsgItemWithMultiVersion
} from '@gpt/data-utils';
import { assembleContext2Prompt } from '@gpt/context-provider';
import { ToolExecutor, toolExecutorFactory } from '@gpt/tools';
import { executeToolChain } from '@gpt/tools/toolchain';
import { useDeleteHistory } from './DeleteHistory';
import { snapshotSignal } from '../../persistence/json-files';

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
            const img_urls = await convertImgsToBase64Url(images);
            content.push(...img_urls);
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

    const togglePinned = (index: number, value?: boolean) => {
        if (index < 0 || index >= messages().length) return;
        const targetMsg = messages()[index];
        if (targetMsg.type !== 'message') return;
        messages.update(index, 'pinned', value ?? !targetMsg.pinned);
    }

    const addMsgItemVersion = (itemId: string, content: string) => {
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
            stagedItem.message.content = adaptIMessageContentSetter(stagedItem.message.content, content);
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
        newID,
        appendUserMsg,
        updateUserMsgContext,
        toggleSeperator,
        toggleSeperatorAt,
        toggleHidden,
        togglePinned,
        addMsgItemVersion,
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
 * GPT 通信相关的 hook - 支持工具调用
 */
const useGptCommunication = (params: {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    messages: IStoreRef<IChatSessionMsgItem[]>;
    systemPrompt: ReturnType<typeof useSignalRef<string>>;
    loading: ReturnType<typeof useSignalRef<boolean>>;
    attachments: ReturnType<typeof useSignalRef<Blob[]>>;
    contexts: IStoreRef<IProvidedContext[]>;
    toolExecutor?: ToolExecutor;
    newID: () => string;
    getAttachedHistory: (itemNum?: number, fromIndex?: number) => IMessage[];
}) => {
    const { model, config, messages, systemPrompt, loading, newID, getAttachedHistory } = params;

    let controller: AbortController;

    const gptOption = () => {
        let option = { ...config().chatOption };
        if (params.toolExecutor && params.toolExecutor.hasEnabledTools()) {
            let tools = params.toolExecutor.getEnabledToolDefinitions();
            if (tools && tools.length > 0) {
                option['tools'] = tools;
                option['tool_choice'] = 'auto';
            }
        }
        return option;
    }

    const currentSystemPrompt = () => {
        let ptime = `It's: ${new Date().toString()}`;
        let prompt = systemPrompt().trim() || '';
        if (params.toolExecutor && params.toolExecutor.hasEnabledTools()) {
            prompt += params.toolExecutor.toolRules();
        }
        return `${ptime}\n\n${prompt}`;
    }

    const customComplete = async (messageToSend: IMessage[] | string, options?: {
        stream?: boolean;
        model?: IGPTModel;
        chatOption?: Partial<IChatOption>;
    }) => {
        try {
            const modelToUse = options?.model ?? model();
            const baseOption = gptOption();
            let opt = options?.chatOption ? { ...baseOption, ...options.chatOption } : baseOption;
            opt['tool_choice'] = 'none'; // 自定义完成不使用工具
            const { content } = await gpt.complete(messageToSend, {
                model: modelToUse,
                option: opt,
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
            let { text } = adaptIMessageContentGetter(item.content);
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
        let autoTitleModel = config().utilityModelId;
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
     * 处理工具调用链
     * @param initialResponse 初始GPT响应（可能包含工具调用）
     * @param contextMessages 上下文消息
     * @param targetIndex 目标消息索引
     * @param scrollToBottom 滚动函数
     */
    const handleToolChain = async (
        initialResponse: CompletionResponse,
        contextMessages: IMessage[],
        targetIndex: number,
        scrollToBottom?: (force?: boolean) => void
    ): Promise<CompletionResponse & { hintSize?: number; toolChainData?: IChatSessionMsgItem['toolChainResult'] }> => {
        if (!params.toolExecutor || !initialResponse.tool_calls?.length) {
            return initialResponse;
        }

        try {
            // 执行工具调用链
            const toolChainResult = await executeToolChain(params.toolExecutor, initialResponse, {
                contextMessages,
                maxRounds: config().toolCallMaxRounds,
                abortController: controller,
                model: model(),
                systemPrompt: currentSystemPrompt(),
                chatOption: gptOption(),
                checkToolResults: true,
                callbacks: {
                    onToolCallStart: (toolName, args, callId) => {
                        console.log(`Tool call started: ${toolName}`, { args, callId });
                    },

                    onToolCallComplete: (result, callId) => {
                        console.log(`Tool call completed:`, { result, callId });
                    },

                    onLLMResponseUpdate: (content, toolCalls) => {
                        // 更新目标消息内容（流式）
                        messages.update(targetIndex, 'message', 'content', content);
                        scrollToBottom && scrollToBottom(false);
                    },

                    onLLMResponseComplete: (response) => {
                        console.log('LLM response completed:', response);
                    },

                    onError: (error, phase) => {
                        console.error(`Tool chain error in ${phase}:`, error);
                        showMessage(`工具调用出错 (${phase}): ${error.message}`);
                    }
                }
            });

            return processToolChainResult(toolChainResult, initialResponse);
        } catch (error) {
            console.error('Tool chain execution failed:', error);
            showMessage(`工具调用失败: ${error.message}`);
            return initialResponse;
        }
    };

    /**
     * 处理工具调用链结果
     * @param toolChainResult 工具调用链结果
     * @param initialResponse 初始响应
     * @returns 处理后的响应
     */
    const processToolChainResult = (toolChainResult: ToolChainResult, initialResponse: CompletionResponse): CompletionResponse & {
        hintSize?: number;
        toolChainData?: IChatSessionMsgItem['toolChainResult'];
    } => {
        // #NOTE: 目前的方案，只会保留最后的一个结果，不会被大量工具调用存放在 history 中
        if (toolChainResult.status === 'completed') {
            return {
                content: toolChainResult.toolChainContent + toolChainResult.responseContent,
                usage: toolChainResult.usage,
                reasoning_content: initialResponse.reasoning_content,
                time: initialResponse.time,
                hintSize: toolChainResult.toolChainContent.length,
                // 附加工具调用数据
                toolChainData: {
                    toolCallHistory: toolChainResult.toolCallHistory,
                    stats: toolChainResult.stats,
                    status: toolChainResult.status,
                    error: toolChainResult.error
                }
            } as CompletionResponse & {
                hintSize?: number;
                toolChainData?: IChatSessionMsgItem['toolChainResult'];
            };
        } else {
            // 工具调用链失败，返回原始响应
            console.warn('Tool chain failed:', toolChainResult.error);
            return initialResponse;
        }
    };

    /**
     * 重新运行消息（支持工具调用）
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

        try {
            controller = new AbortController();
            const msgToSend = getAttachedHistory(config().attachedHistory, atIndex);
            let modelToUse = model();
            let option = gptOption();
            // 更新或插入 assistant 消息
            const nextIndex = atIndex + 1;
            // const nextMsg = messages()[nextIndex];

            // 准备或更新目标消息; 如果下一条消息是普通的 assistant 消消息，则更新它
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

            params.attachments.update([]);
            params.contexts.update([]);

            // 获取初始响应
            const initialResponse = await gpt.complete(msgToSend, {
                model: modelToUse,
                systemPrompt: currentSystemPrompt(),
                stream: option.stream ?? true,
                streamInterval: 2,
                streamMsg(msg) {
                    messages.update(nextIndex, 'message', 'content', msg);
                },
                abortControler: controller,
                option: option,
            });

            // 处理工具调用链
            const finalResponse = await handleToolChain(
                initialResponse,
                msgToSend,
                nextIndex
            );

            // 更新最终内容
            const vid = new Date().getTime().toString();
            messages.update(nextIndex, (msgItem: IChatSessionMsgItem) => {
                const newMessageContent: IMessage = {
                    role: 'assistant',
                    content: finalResponse.content,
                };
                if (finalResponse.reasoning_content) {
                    newMessageContent['reasoning_content'] = finalResponse.reasoning_content;
                }

                msgItem = {
                    ...msgItem,
                    loading: false,
                    usage: finalResponse.usage,
                    time: finalResponse.time,
                    message: newMessageContent,
                    author: modelToUse.model,
                    timestamp: new Date().getTime(),
                    attachedItems: msgToSend.length,
                    attachedChars: msgToSend.map(i => i.content.length).reduce((a, b) => a + b, 0)
                };

                if (finalResponse.usage && finalResponse.usage.completion_tokens) {
                    msgItem['token'] = finalResponse.usage.completion_tokens;
                }

                if (finalResponse.hintSize) {
                    msgItem.userPromptSlice = [finalResponse.hintSize, finalResponse.content.length];
                }

                // 保存工具调用数据
                if (finalResponse.toolChainData) {
                    msgItem.toolChainResult = finalResponse.toolChainData;
                }

                msgItem = stageMsgItemVersion(msgItem, vid);
                return msgItem;
            });

            messages.update(nextIndex, (item: IChatSessionMsgItem) => {
                let newItem = structuredClone(item);
                return stageMsgItemVersion(newItem);
            });

            if (finalResponse.usage) {
                batch(() => {
                    messages.update(nextIndex, 'token', finalResponse.usage?.completion_tokens);
                    messages.update(atIndex, 'token', finalResponse.usage?.prompt_tokens);
                });
            }

        } catch (error) {
            console.error('Error:', error);
        } finally {
            loading.update(false);
            controller = null;
        }
    };

    /**
     * 发送用户消息（支持工具调用）
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
                time: null,
                message: { role: 'assistant', content: '' },
                author: modelToUse.model,
                timestamp: new Date().getTime(),
                loading: true,
                versions: {}
            };
            messages.update(prev => [...prev, assistantMsg]);
            const updatedTimestamp = new Date().getTime();

            params.attachments.update([]);
            params.contexts.update([]);
            const lastIdx = messages().length - 1;

            // 获取初始响应
            const initialResponse = await gpt.complete(msgToSend, {
                model: modelToUse,
                systemPrompt: currentSystemPrompt(),
                stream: option.stream ?? true,
                streamInterval: 2,
                streamMsg(msg) {
                    messages.update(lastIdx, 'message', 'content', msg);
                    scrollToBottom && scrollToBottom(false);
                },
                abortControler: controller,
                option: option,
            });

            // 处理工具调用链
            const finalResponse = await handleToolChain(
                initialResponse,
                msgToSend,
                lastIdx,
                scrollToBottom
            );

            const vid = new Date().getTime().toString();
            const newMessageContent: IMessage = {
                role: 'assistant',
                content: finalResponse.content
            }
            if (finalResponse.reasoning_content) {
                newMessageContent['reasoning_content'] = finalResponse.reasoning_content;
            }

            // 更新最终内容
            messages.update(prev => {
                const lastIdx = prev.length - 1;
                const updated = [...prev];
                updated[lastIdx] = {
                    ...updated[lastIdx],
                    usage: finalResponse.usage,
                    time: finalResponse.time,
                    loading: false,
                    message: newMessageContent,
                    author: modelToUse.model,
                    timestamp: new Date().getTime(),
                    attachedItems: msgToSend.length,
                    attachedChars: msgToSend.map(i => i.content.length).reduce((a, b) => a + b, 0),
                    currentVersion: vid,
                    versions: {}
                };
                if (finalResponse.hintSize) {
                    updated[lastIdx].userPromptSlice = [finalResponse.hintSize, finalResponse.content.length];
                }
                // 保存工具调用数据
                if (finalResponse.toolChainData) {
                    updated[lastIdx].toolChainResult = finalResponse.toolChainData;
                }
                delete updated[lastIdx]['loading'];
                return updated;
            });

            if (finalResponse.usage) {
                batch(() => {
                    const lastIdx = messages().length - 1;
                    if (lastIdx < 1) return;
                    messages.update(lastIdx, 'token', finalResponse.usage?.completion_tokens);
                    messages.update(lastIdx - 1, 'token', finalResponse.usage?.prompt_tokens);
                });
            }

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

    const toolExecutor = toolExecutorFactory({});

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

        const isAttachable = (msg: IChatSessionMsgItem) => {
            return msg.type === 'message' && !msg.hidden;
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
        }

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
        const finalIds = new Set([...attachedMessages, ...pinnedMessages].map(m => m.id));
        const finalContext = previousMessages.filter(m => finalIds.has(m.id));

        return [...finalContext, targetMessage].map(item => item.message!);
    }

    // 使用消息管理 hook
    const {
        appendUserMsg: appendUserMsgInternal,
        // updateUserMsgContext,
        toggleSeperator,
        toggleSeperatorAt,
        toggleHidden,
        togglePinned,
        addMsgItemVersion,
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
        attachments,
        contexts,
        toolExecutor,
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

        // 清空删除历史（新建会话时）
        deleteHistory.clearRecords();
    }

    const hooks = {
        sessionId,
        systemPrompt,
        messages,
        loading,
        title,
        attachments,
        contexts,
        toolExecutor,
        sessionTags,
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
        addAttachment,
        removeAttachment,
        setContext,
        delContext,
        autoGenerateTitle,
        reRunMessage,
        sendMessage,
        abortMessage,
        toggleHidden,
        togglePinned,
        toggleSeperatorAt,
        toggleNewThread,
        checkAttachedContext,
        sessionHistory,
        applyHistory,
        newSession,
        addMsgItemVersion: (itemId: string, content: string) => {
            addMsgItemVersion(itemId, content);
            renewUpdatedTimestamp();
        },
        switchMsgItemVersion: (itemId: string, version: string) => {
            switchMsgItemVersion(itemId, version);
            renewUpdatedTimestamp();
        },
        delMsgItemVersion: (itemId: string, version: string, autoSwitch = true) => {
            const index = messages().findIndex(item => item.id === itemId);
            if (index === -1) return;
            const msgItem = messages()[index];

            // 记录版本删除到历史
            if (msgItem.versions?.[version]) {
                const versionContent = msgItem.versions[version];
                const content = typeof versionContent.content === 'string'
                    ? versionContent.content
                    : versionContent.content[0]?.text || '多媒体内容';

                deleteHistory.addRecord({
                    type: 'version',
                    sessionId: sessionId(),
                    sessionTitle: title(),
                    content: content,
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

        // 消息更新函数
        updateMessage: (index: number, newContent: string) => {
            if (index < 0 || index >= messages().length) return;
            const item = messages()[index];
            if (item.type !== 'message') return;

            const content = item.message.content;
            let { text } = adaptIMessageContentGetter(content);
            let contextText = '';

            // 处理上下文切片
            if (item.userPromptSlice) {
                const [beg] = item.userPromptSlice;
                contextText = text.slice(0, beg);
            }

            const newText = contextText + newContent;

            batch(() => {
                if (Array.isArray(content)) {
                    // 处理数组类型内容（包含图片等）
                    const idx = content.findIndex(item => item.type === 'text');
                    if (idx !== -1) {
                        const updatedContent = [...content];
                        updatedContent[idx] = { ...updatedContent[idx], text: newText };
                        messages.update(index, 'message', 'content', updatedContent);
                    }
                } else if (typeof content === 'string') {
                    // 处理字符串类型内容
                    messages.update(index, 'message', 'content', newText);
                }

                // 更新 userPromptSlice
                if (contextText && contextText.length > 0) {
                    const contextLength = contextText.length;
                    messages.update(index, 'userPromptSlice', [contextLength, contextLength + newContent.length]);
                }

                // 如果是多版本消息，同时更新当前版本
                if (isMsgItemWithMultiVersion(item)) {
                    messages.update(index, 'versions', item.currentVersion, 'content', newText);
                }
            });

            renewUpdatedTimestamp();
        },

        // 消息删除函数
        deleteMessage: (index: number) => {
            if (index < 0 || index >= messages().length) return;
            if (loading()) return;

            const item = messages()[index];
            if (item.type !== 'message') return;

            // 记录消息删除到历史
            const content = typeof item.message.content === 'string'
                ? item.message.content
                : item.message.content[0]?.text || '多媒体消息';

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

            // 执行删除操作
            messages.update((oldList: IChatSessionMsgItem[]) => {
                return oldList.filter((i) => i.id !== item.id);
            });

            renewUpdatedTimestamp();
        },

        // 暴露删除历史功能
        deleteHistory
    }
    return hooks;
}
