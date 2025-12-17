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

import { extractContentText, MessageBuilder, splitPromptFromContext, updateContentText } from '../../chat-utils';

import { useGptCommunication as useGptCommunicationNew } from './use-openai-communication';
import { useContextAndAttachments } from './use-attachment-input';

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
        newID,
        appendUserMsg,
        // updateUserMsgContext,
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
 * GPT 通信相关的 hook - 支持工具调用
 */

// const useGptCommunication = (params: {
//     model: Accessor<IRuntimeLLM>;
//     config: IStoreRef<IChatSessionConfig>;
//     messages: IStoreRef<IChatSessionMsgItem[]>;
//     systemPrompt: ReturnType<typeof useSignalRef<string>>;
//     customOptions: ISignalRef<IChatCompleteOption>;
//     loading: ReturnType<typeof useSignalRef<boolean>>;
//     attachments: ReturnType<typeof useSignalRef<Blob[]>>;
//     contexts: IStoreRef<IProvidedContext[]>;
//     toolExecutor?: ToolExecutor;
//     newID: () => string;
//     getAttachedHistory: (itemNum?: number, fromIndex?: number) => IMessage[];
// }) => {
//     const { model, config, messages, systemPrompt, loading, newID, getAttachedHistory, customOptions } = params;

//     let controller: AbortController;

//     const chatCompletionOption = () => {
//         let option = { ...config().chatOption };

//         // 添加自定义选项，作为最高优先级覆盖所有默认设置
//         if (customOptions()) {
//             try {
//                 const optVal = customOptions() || {};
//                 // option = { ...option, ...customOptions };
//                 option = deepMerge(option, optVal);
//             } catch (error) {
//                 console.error('Failed to parse customOptions:', error);
//                 // 如果解析失败，继续使用默认选项
//             }
//         }

//         if (params.toolExecutor && params.toolExecutor.hasEnabledTools()) {
//             let tools = params.toolExecutor.getEnabledToolDefinitions();
//             if (tools && tools.length > 0) {
//                 option['tools'] = tools;
//                 option['tool_choice'] = 'auto';
//             }
//         }
//         return option;
//     }

//     const currentSystemPrompt = () => {
//         let ptime = `It's: ${new Date().toString()}`;
//         let prompt = systemPrompt().trim() || '';
//         if (params.toolExecutor && params.toolExecutor.hasEnabledTools()) {
//             prompt += params.toolExecutor.toolRules();
//         }
//         return `${ptime}\n\n${prompt}`;
//     }

//     const customComplete = async (messageToSend: IMessage[] | string, options?: {
//         stream?: boolean;
//         model?: IRuntimeLLM;
//         chatOption?: Partial<IChatCompleteOption>;
//     }) => {
//         try {
//             const modelToUse = options?.model ?? model();
//             const baseOption = chatCompletionOption();
//             let opt = options?.chatOption ? { ...baseOption, ...options.chatOption } : baseOption;
//             opt['tool_choice'] = 'none'; // 自定义完成不使用工具
//             const { content } = await gpt.complete(messageToSend, {
//                 model: modelToUse,
//                 option: opt,
//                 stream: options?.stream ?? false,
//             });
//             return content;
//         } catch (error) {
//             console.error('Error:', error);
//         }
//     }

//     const autoGenerateTitle = async () => {
//         let attachedHistory = config().attachedHistory;
//         attachedHistory = Math.max(attachedHistory, 0);
//         attachedHistory = Math.min(attachedHistory, 6);
//         const histories = getAttachedHistory(attachedHistory);
//         if (histories.length == 0) return;
//         let sizeLimit = config().maxInputLenForAutoTitle;
//         let averageLimit = Math.floor(sizeLimit / histories.length);

//         let inputContent = histories.map(item => {
//             const { text } = extractMessageContent(item.content);
//             let clippedContent = text.substring(0, averageLimit);
//             if (clippedContent.length < text.length) {
//                 clippedContent += '...(clipped as too long)'
//             }
//             return `<${item.role}>:\n${clippedContent}`;
//         }).join('\n\n');
//         const messageToSend = `
// 请根据以下对话生成唯一一个最合适的对话主题标题，字数控制在 15 字之内; 除了标题之外不要回复任何别的信息
// ---
// ${inputContent}
// `.trim();
//         let autoTitleModel = config().utilityModelId;
//         let modelToUse = null;
//         if (autoTitleModel) {
//             modelToUse = useModel(autoTitleModel);
//         }
//         const newTitle = await customComplete(messageToSend, {
//             model: modelToUse,
//             stream: false,
//             chatOption: {
//                 'max_tokens': 128,
//                 'temperature': 0.7,
//                 'frequency_penalty': null,
//                 'presence_penalty': null,
//                 'top_p': null
//             }
//         });
//         return newTitle?.trim();
//     }

//     /**
//      * 处理工具调用链
//      * @param initialResponse 初始GPT响应（可能包含工具调用）
//      * @param contextMessages 上下文消息
//      * @param targetIndex 目标消息索引
//      * @param scrollToBottom 滚动函数
//      */
//     const handleToolChain = async (
//         initialResponse: ICompletionResult,
//         contextMessages: IMessage[],
//         targetIndex: number,
//         scrollToBottom?: (force?: boolean) => void
//     ): Promise<ICompletionResult & { hintSize?: number; toolChainData?: IChatSessionMsgItem['toolChainResult'] }> => {
//         if (!params.toolExecutor || !initialResponse.tool_calls?.length) {
//             return initialResponse;
//         }

//         try {
//             // 执行工具调用链
//             const toolChainResult = await executeToolChain(params.toolExecutor, initialResponse, {
//                 contextMessages,
//                 maxRounds: config().toolCallMaxRounds,
//                 abortController: controller,
//                 model: model(),
//                 systemPrompt: currentSystemPrompt(),
//                 chatOption: chatCompletionOption(),
//                 checkToolResults: true,
//                 callbacks: {
//                     onToolCallStart: (toolName, args, callId) => {
//                         console.log(`Tool call started: ${toolName}`, { args, callId });
//                     },

//                     onToolCallComplete: (result, callId) => {
//                         console.log(`Tool call completed:`, { result, callId });
//                     },

//                     onLLMResponseUpdate: (content, toolCalls) => {
//                         // 更新目标消息内容（流式）
//                         messages.update(targetIndex, 'message', 'content', content);
//                         scrollToBottom && scrollToBottom(false);
//                     },

//                     onLLMResponseComplete: (response) => {
//                         console.log('LLM response completed:', response);
//                     },

//                     onError: (error, phase) => {
//                         console.error(`Tool chain error in ${phase}:`, error);
//                         showMessage(`工具调用出错 (${phase}): ${error.message}`);
//                     }
//                 }
//             });

//             return processToolChainResult(toolChainResult, initialResponse);
//         } catch (error) {
//             console.error('Tool chain execution failed:', error);
//             showMessage(`工具调用失败: ${error.message}`);
//             return initialResponse;
//         }
//     };

//     /**
//      * 处理工具调用链结果
//      * @param toolChainResult 工具调用链结果
//      * @param initialResponse 初始响应
//      * @returns 处理后的响应
//      */
//     const processToolChainResult = (toolChainResult: ToolChainResult, initialResponse: ICompletionResult): ICompletionResult & {
//         hintSize?: number;
//         toolChainData?: IChatSessionMsgItem['toolChainResult'];
//     } => {
//         // #NOTE: 目前的方案，只会保留最后的一个结果，不会被大量工具调用存放在 history 中
//         if (toolChainResult.status === 'completed') {
//             return {
//                 content: toolChainResult.toolChainContent + toolChainResult.responseContent,
//                 usage: toolChainResult.usage,
//                 reasoning_content: initialResponse.reasoning_content,
//                 time: initialResponse.time,
//                 hintSize: toolChainResult.toolChainContent.length,
//                 // 附加工具调用数据
//                 toolChainData: {
//                     toolCallHistory: toolChainResult.toolCallHistory,
//                     stats: toolChainResult.stats,
//                     status: toolChainResult.status,
//                     error: toolChainResult.error
//                 }
//             } as ICompletionResult & {
//                 hintSize?: number;
//                 toolChainData?: IChatSessionMsgItem['toolChainResult'];
//             };
//         } else {
//             // 工具调用链失败，返回原始响应
//             console.warn('Tool chain failed:', toolChainResult.error);
//             return initialResponse;
//         }
//     };

//     /**
//      * 重新运行消息（支持工具调用）
//      */
//     const reRunMessage = async (atIndex: number) => {
//         if (atIndex < 0 || atIndex >= messages().length) return;
//         const targetMsg = messages()[atIndex];
//         if (targetMsg.type !== 'message' || targetMsg.hidden) {
//             if (targetMsg.hidden) showMessage('无法重新生成此消息：已隐藏');
//             return;
//         }

//         // 如果是 assistant 消息，检查上一条是否为 user 消息
//         if (targetMsg.message.role === 'assistant') {
//             if (atIndex === 0 || messages()[atIndex - 1].message?.role !== 'user' || messages()[atIndex - 1].hidden) {
//                 showMessage('无法重新生成此消息：需要用户输入作为前文');
//                 return;
//             }
//             atIndex = atIndex - 1; // 将焦点移到上一条 user 消息
//         }

//         loading.update(true);

//         try {
//             controller = new AbortController();
//             const msgToSend = getAttachedHistory(config().attachedHistory, atIndex);
//             let modelToUse = model();
//             let option = chatCompletionOption();
//             // 更新或插入 assistant 消息
//             const nextIndex = atIndex + 1;
//             // const nextMsg = messages()[nextIndex];

//             // 准备或更新目标消息; 如果下一条消息是普通的 assistant 消消息，则更新它
//             if (messages()[nextIndex]?.message?.role === 'assistant' && !messages()[nextIndex].hidden) {
//                 messages.update(prev => {
//                     const updated = [...prev];
//                     // const item = structuredClone(updated[nextIndex]);
//                     // item['loading'] = true;
//                     // stageMsgItemVersion(item);
//                     // updated[nextIndex] = item;
//                     // return updated;
//                     const newItem = {
//                         ...stageMsgItemVersion(updated[nextIndex]),
//                         loading: true  // 避免 inplace 操作, 尽量保持 immutable
//                     };
//                     updated[nextIndex] = newItem;

//                     return updated;
//                 });
//             } else {
//                 // 插入新的 assistant 消息
//                 const timestamp = new Date().getTime();
//                 messages.update(prev => {
//                     const updated = [...prev];
//                     updated.splice(nextIndex, 0, {
//                         type: 'message',
//                         id: newID(),
//                         timestamp: timestamp,
//                         author: modelToUse.model,
//                         loading: true,
//                         message: {
//                             role: 'assistant',
//                             content: ''
//                         },
//                         currentVersion: timestamp.toString(),
//                         versions: {}
//                     });
//                     return updated;
//                 });
//             }

//             params.attachments.update([]);
//             params.contexts.update([]);

//             // 获取初始响应
//             const initialResponse = await gpt.complete(msgToSend, {
//                 model: modelToUse,
//                 systemPrompt: currentSystemPrompt(),
//                 stream: option.stream ?? true,
//                 streamInterval: 2,
//                 streamMsg(msg) {
//                     messages.update(nextIndex, 'message', 'content', msg);
//                 },
//                 abortControler: controller,
//                 option: option,
//             });

//             // 处理工具调用链
//             const finalResponse = await handleToolChain(
//                 initialResponse,
//                 msgToSend,
//                 nextIndex
//             );

//             // 更新最终内容
//             const vid = new Date().getTime().toString();
//             messages.update(nextIndex, (msgItem: IChatSessionMsgItem) => {
//                 const newMessageContent: IMessage = {
//                     role: 'assistant',
//                     content: finalResponse.content,
//                 };
//                 if (finalResponse.reasoning_content) {
//                     newMessageContent['reasoning_content'] = finalResponse.reasoning_content;
//                 }

//                 msgItem = {
//                     ...msgItem,
//                     loading: false,
//                     usage: finalResponse.usage,
//                     time: finalResponse.time,
//                     message: newMessageContent,
//                     author: modelToUse.model,
//                     timestamp: new Date().getTime(),
//                     attachedItems: msgToSend.length,
//                     attachedChars: msgToSend.map(i => i.content.length).reduce((a, b) => a + b, 0)
//                 };

//                 if (finalResponse.usage && finalResponse.usage.completion_tokens) {
//                     msgItem['token'] = finalResponse.usage.completion_tokens;
//                 }

//                 if (finalResponse.hintSize) {
//                     msgItem.userPromptSlice = [finalResponse.hintSize, finalResponse.content.length];
//                 }

//                 // 保存工具调用数据
//                 if (finalResponse.toolChainData) {
//                     msgItem.toolChainResult = finalResponse.toolChainData;
//                 }

//                 msgItem = stageMsgItemVersion(msgItem, vid);
//                 return msgItem;
//             });

//             // #BUG 这个貌似是多余的吧？需要测试研究一下怎么回事。
//             messages.update(nextIndex, (item: IChatSessionMsgItem) => {
//                 let newItem = structuredClone(item);
//                 return stageMsgItemVersion(newItem);
//             });

//             if (finalResponse.usage) {
//                 batch(() => {
//                     messages.update(nextIndex, 'token', finalResponse.usage?.completion_tokens);
//                     messages.update(atIndex, 'token', finalResponse.usage?.prompt_tokens);
//                 });
//             }

//         } catch (error) {
//             console.error('Error:', error);
//         } finally {
//             loading.update(false);
//             controller = null;
//         }
//     };

//     /**
//      * 发送用户消息（支持工具调用）
//      */
//     const sendMessage = async (
//         userMessage: string,
//         attachments: Blob[],
//         contexts: IProvidedContext[],
//         scrollToBottom?: (force?: boolean) => void,
//         options?: {
//             tavily?: boolean;
//         }
//     ) => {
//         if (!userMessage.trim() && attachments.length === 0 && contexts.length === 0) return;

//         loading.update(true);

//         try {
//             controller = new AbortController();
//             const msgToSend = getAttachedHistory();
//             let modelToUse = model();
//             let option = chatCompletionOption();

//             // 添加助手消息占位
//             const assistantMsg: IChatSessionMsgItem = {
//                 type: 'message',
//                 id: newID(),
//                 token: null,
//                 time: null,
//                 message: { role: 'assistant', content: '' },
//                 author: modelToUse.model,
//                 timestamp: new Date().getTime(),
//                 loading: true,
//                 versions: {}
//             };
//             messages.update(prev => [...prev, assistantMsg]);
//             const updatedTimestamp = new Date().getTime();

//             params.attachments.update([]);
//             params.contexts.update([]);
//             const lastIdx = messages().length - 1;

//             // 获取初始响应
//             const initialResponse = await gpt.complete(msgToSend, {
//                 model: modelToUse,
//                 systemPrompt: currentSystemPrompt(),
//                 stream: option.stream ?? true,
//                 streamInterval: 2,
//                 streamMsg(msg) {
//                     messages.update(lastIdx, 'message', 'content', msg);
//                     scrollToBottom && scrollToBottom(false);
//                 },
//                 abortControler: controller,
//                 option: option,
//             });

//             // 处理工具调用链
//             const finalResponse = await handleToolChain(
//                 initialResponse,
//                 msgToSend,
//                 lastIdx,
//                 scrollToBottom
//             );

//             const vid = new Date().getTime().toString();
//             const newMessageContent: IMessage = {
//                 role: 'assistant',
//                 content: finalResponse.content
//             }
//             if (finalResponse.reasoning_content) {
//                 newMessageContent['reasoning_content'] = finalResponse.reasoning_content;
//             }

//             // 更新最终内容
//             messages.update(prev => {
//                 const lastIdx = prev.length - 1;
//                 const updated = [...prev];
//                 updated[lastIdx] = {
//                     ...updated[lastIdx],
//                     usage: finalResponse.usage,
//                     time: finalResponse.time,
//                     loading: false,
//                     message: newMessageContent,
//                     author: modelToUse.model,
//                     timestamp: new Date().getTime(),
//                     attachedItems: msgToSend.length,
//                     attachedChars: msgToSend.map(i => i.content.length).reduce((a, b) => a + b, 0),
//                     currentVersion: vid,
//                     versions: {}
//                 };
//                 if (finalResponse.hintSize) {
//                     updated[lastIdx].userPromptSlice = [finalResponse.hintSize, finalResponse.content.length];
//                 }
//                 // 保存工具调用数据
//                 if (finalResponse.toolChainData) {
//                     updated[lastIdx].toolChainResult = finalResponse.toolChainData;
//                 }
//                 delete updated[lastIdx]['loading'];
//                 return updated;
//             });

//             if (finalResponse.usage) {
//                 batch(() => {
//                     const lastIdx = messages().length - 1;
//                     if (lastIdx < 1) return;
//                     messages.update(lastIdx, 'token', finalResponse.usage?.completion_tokens);
//                     messages.update(lastIdx - 1, 'token', finalResponse.usage?.prompt_tokens);
//                 });
//             }

//             return { updatedTimestamp, hasResponse: true };
//         } catch (error) {
//             console.error('Error:', error);
//             return { updatedTimestamp: new Date().getTime(), hasResponse: false };
//         } finally {
//             loading.update(false);
//             controller = null;
//         }
//     }

//     const abortMessage = () => {
//         if (loading()) {
//             controller && controller.abort();
//         }
//     }

//     return {
//         chatCompletionOption,
//         customComplete,
//         autoGenerateTitle,
//         reRunMessage,
//         sendMessage,
//         abortMessage
//     };
// };


/**
 * 主会话 hook
 */
export const useSession = (props: {
    model: Accessor<IRuntimeLLM>;
    config: IStoreRef<IChatSessionConfig>;
    scrollToBottom: (force?: boolean) => void;
}) => {
    let sessionId = useSignalRef<string>(window.Lute.NewNodeID());

    const toolExecutor = toolExecutorFactory({});

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
        multiModalAttachments
    });

    // ================================================================
    // 测试对比替换
    // ================================================================
    // let communication = useGptCommunication;
    let communication = useGptCommunicationNew;

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
        messages,
        modelCustomOptions: modelCustomOptions,
        loading,
        title,
        multiModalAttachments,
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
                const textContent = extractContentText(versionContent.content);
                // const content = typeof versionContent.content === 'string'
                //     ? versionContent.content
                //     : versionContent.content[0]?.text || '多媒体内容';

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

        // 消息更新函数
        updateMessage: (index: number, newContent: string) => {
            if (index < 0 || index >= messages().length) return;
            const item = messages()[index];
            if (item.type !== 'message') return;

            const content = item.message.content;
            // let { text } = adaptIMessageContentGetter(content);
            // let text = extractContentText(content);
            // let contextText = '';

            // // 处理上下文切片
            // if (item.userPromptSlice) {
            //     const [beg] = item.userPromptSlice;
            //     contextText = text.slice(0, beg);
            // }

            const { contextPrompt } = splitPromptFromContext(item);

            const newText = contextPrompt + newContent;

            batch(() => {
                // if (Array.isArray(content)) {
                //     // 处理数组类型内容（包含图片等）
                //     const idx = content.findIndex(item => item.type === 'text');
                //     if (idx !== -1) {
                //         const updatedContent = [...content];
                //         updatedContent[idx] = { ...updatedContent[idx], text: newText };
                //         messages.update(index, 'message', 'content', updatedContent);
                //     }
                // } else if (typeof content === 'string') {
                //     // 处理字符串类型内容
                //     messages.update(index, 'message', 'content', newText);
                // }
                const updatedContent = updateContentText(content, newText);
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

        // 消息删除函数
        deleteMessage: (index: number) => {
            if (index < 0 || index >= messages().length) return;
            if (loading()) return;

            const item = messages()[index];
            if (item.type !== 'message') return;

            // 记录消息删除到历史
            // const content = typeof item.message.content === 'string'
            //     ? item.message.content
            //     : item.message.content[0]?.text || '多媒体消息';
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
