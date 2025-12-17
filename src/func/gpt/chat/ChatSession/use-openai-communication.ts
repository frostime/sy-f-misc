/**
 * ChatSession.helper.ts - 重构版本
 *
 * 核心设计：
 * 1. createCompletionRunner: 通用执行框架，处理 loading/占位符/更新等样板逻辑
 * 2. Executor: 可注入的请求执行函数，返回 ICompletionResult
 * 3. 所有模态（chat/image/audio）共用同一套框架
 */

import { batch, Accessor } from 'solid-js';
import { showMessage } from 'siyuan';

// 假设这些导入存在
import * as gpt from '@gpt/openai/complete';
import {
    transcribeAudio,
    textToSpeech,
    transcriptionResultToCompletion,
    ttsResultToCompletion,
    type IAudioTranscriptionOptions,
    type ITextToSpeechOptions
} from '@gpt/openai/audio';
import {
    generateImage,
    editImage,
    imageResultToCompletion,
    type IImageGenerationOptions,
    type IImageEditOptions
} from '@gpt/openai/images';
import { ISignalRef, IStoreRef, useSignalRef } from '@frostime/solid-signal-ref';
import { stageMsgItemVersion } from '@gpt/chat-utils/msg-item';
import { ToolExecutor } from '@gpt/tools';
import { executeToolChain } from '@gpt/tools/toolchain';
import { extractContentText, extractMessageContent } from '@gpt/chat-utils';
// import { useModel } from '@gpt/model';
import { deepMerge } from '@frostime/siyuan-plugin-kits';
import { quickComplete } from '../../openai/tiny-agent';
import { FormatConverter, DataURL, Base64String } from '@gpt/chat-utils/msg-modal';
// ============================================================================
// 类型定义
// ============================================================================

/** 执行器上下文 - 传递给实际请求函数的参数 */
interface ExecutorContext {
    targetIndex: number;
    modelToUse: IRuntimeLLM;
    controller: AbortController;
    /** 流式更新（仅 chat 使用） */
    updateStream: (msg: string, toolCalls?: IToolCallResponse[]) => void;
    /** 历史消息（仅 chat 使用） */
    msgToSend: IMessage[];
    /**
     * runtimeOption: 针对当前模型 endpoint 的选项
     * - chat: IChatCompleteOption
     * - image/audio: 各自 endpoint 的 options
     */
    runtimeOption: Record<string, any>;
    systemPrompt: string;
}

/** 消息准备模式 */
type PrepareMode =
    | 'append'
    | { updateAt: number }
    | { insertAt: number };

/** 执行选项 */
interface RunOptions {
    prepareMode: PrepareMode;
    clearAttachments: boolean;
    getMsgToSend: () => IMessage[];
    scrollToBottom?: (force?: boolean) => void;
    supportsToolChain?: boolean;
}

/** 执行结果 */
interface RunResult {
    updatedTimestamp: number;
    hasResponse: boolean;
}

/** 扩展的完成结果 */
type ExtendedCompletionResult = ICompletionResult & {
    hintSize?: number;
    toolChainData?: IChatSessionMsgItem['toolChainResult'];
};

/** 执行器函数类型 */
type Executor = (ctx: ExecutorContext) => Promise<ICompletionResult>;

// ============================================================================
// useGptCommunication
// ============================================================================

const useGptCommunication = (params: {
    model: Accessor<IRuntimeLLM>;
    config: IStoreRef<IChatSessionConfig>;
    messages: IStoreRef<IChatSessionMsgItem[]>;
    systemPrompt: ReturnType<typeof useSignalRef<string>>;
    customOptions: ISignalRef<IChatCompleteOption>;
    loading: ReturnType<typeof useSignalRef<boolean>>;
    multiModalAttachments: ReturnType<typeof useSignalRef<TMessageContentPart[]>>;
    contexts: IStoreRef<IProvidedContext[]>;
    toolExecutor?: ToolExecutor;
    newID: () => string;
    getAttachedHistory: (itemNum?: number, fromIndex?: number) => IMessage[];
}) => {
    const {
        model, config, messages, systemPrompt, loading, newID,
        getAttachedHistory, customOptions
    } = params;

    // 当前的 AbortController（在闭包中维护）
    let controller: AbortController | null = null;

    // ========================================================================
    // 配置函数
    // ========================================================================

    /**
     * 构建不同 endpoint 的 runtime option
     * NOTE:
     * - customOptions() 始终参与 merge（供外部用户覆盖/调整）
     * - 非 chat endpoint: stream 始终为 false（或不设置）
     */
    const getRuntimeOption = (serviceType: LLMServiceType): Record<string, any> => {
        let option: Record<string, any> = {};

        // chat 选项：以 config.chatOption 为基础
        if (serviceType === 'chat') {
            option = { ...config().chatOption };
        }

        // customOptions 永远应用（最高优先级）
        if (customOptions()) {
            option = deepMerge(option, (customOptions() as any) || {});
        }

        // chat: 自动注入 tools
        if (serviceType === 'chat' && params.toolExecutor?.hasEnabledTools()) {
            const tools = params.toolExecutor.getEnabledToolDefinitions();
            if (tools?.length) {
                option.tools = tools;
                option.tool_choice = 'auto';
            }
        }

        // 非 chat：强制关闭 stream（或移除）
        if (serviceType !== 'chat') {
            // 既避免用户误设 stream，也避免某些 endpoint 报错
            if ('stream' in option) delete option.stream;
            if ('stream_options' in option) delete option.stream_options;
        }

        // 删掉为 null 或者 undefined 的字段
        Object.keys(option).forEach(key => {
            if (option[key] === null || option[key] === undefined) {
                delete option[key];
            }
        });

        return option;
    };

    // const chatCompletionOption = (): IChatCompleteOption => {
    //     let option = { ...config().chatOption };

    //     if (customOptions()) {
    //         option = deepMerge(option, customOptions() || {});
    //     }

    //     if (params.toolExecutor?.hasEnabledTools()) {
    //         const tools = params.toolExecutor.getEnabledToolDefinitions();
    //         if (tools?.length) {
    //             option.tools = tools;
    //             option.tool_choice = 'auto';
    //         }
    //     }
    //     return option;
    // };

    const currentSystemPrompt = (): string => {
        const ptime = `It's: ${new Date().toString()}`;
        let prompt = systemPrompt().trim() || '';
        if (params.toolExecutor?.hasEnabledTools()) {
            prompt += params.toolExecutor.toolRules();
        }
        return `${ptime}\n\n${prompt}`;
    };

    // ========================================================================
    // 工具调用链处理
    // ========================================================================

    const handleToolChain = async (
        initialResponse: ICompletionResult,
        contextMessages: IMessage[],
        targetIndex: number,
        scrollToBottom?: (force?: boolean) => void
    ): Promise<ExtendedCompletionResult> => {
        if (!params.toolExecutor || !initialResponse.tool_calls?.length) {
            return initialResponse;
        }

        try {
            const toolChainResult = await executeToolChain(params.toolExecutor, initialResponse, {
                contextMessages,
                maxRounds: config().toolCallMaxRounds,
                abortController: controller!,  // 使用闭包中的 controller
                model: model(),
                systemPrompt: currentSystemPrompt(),
                chatOption: getRuntimeOption('chat'),
                checkToolResults: true,
                callbacks: {
                    onToolCallStart: (toolName, args, callId) => {
                        console.log(`Tool call started: ${toolName}`, { args, callId });
                    },
                    onToolCallComplete: (result, callId) => {
                        console.log(`Tool call completed:`, { result, callId });
                    },
                    onLLMResponseUpdate: (content) => {
                        messages.update(targetIndex, 'message', 'content', content);
                        scrollToBottom?.(false);
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

            if (toolChainResult.status === 'completed') {
                return {
                    content: toolChainResult.toolChainContent + toolChainResult.responseContent,
                    usage: toolChainResult.usage,
                    reasoning_content: initialResponse.reasoning_content,
                    time: initialResponse.time,
                    hintSize: toolChainResult.toolChainContent.length,
                    toolChainData: {
                        toolCallHistory: toolChainResult.toolCallHistory,
                        stats: toolChainResult.stats,
                        status: toolChainResult.status,
                        error: toolChainResult.error
                    }
                };
            }
            console.warn('Tool chain failed:', toolChainResult.error);
            return initialResponse;
        } catch (error) {
            console.error('Tool chain execution failed:', error);
            showMessage(`工具调用失败: ${error.message}`);
            return initialResponse;
        }
    };

    // ========================================================================
    // 核心：通用执行框架
    // ========================================================================

    /**
     * 准备 assistant 消息占位符
     */
    const prepareAssistantMessage = (mode: PrepareMode): number => {
        const modelToUse = model();
        const timestamp = new Date().getTime();

        if (mode === 'append') {
            const assistantMsg: IChatSessionMsgItem = {
                type: 'message',
                id: newID(),
                token: null,
                time: null,
                message: { role: 'assistant', content: 'thinking...' },
                author: modelToUse.model,
                timestamp,
                loading: true,
                versions: {}
            };
            messages.update(prev => [...prev, assistantMsg]);
            return messages().length - 1;
        }

        if ('updateAt' in mode) {
            messages.update(prev => {
                const updated = [...prev];
                updated[mode.updateAt] = {
                    ...stageMsgItemVersion(updated[mode.updateAt]),
                    loading: true
                };
                return updated;
            });
            return mode.updateAt;
        }

        // insertAt
        messages.update(prev => {
            const updated = [...prev];
            updated.splice(mode.insertAt, 0, {
                type: 'message',
                id: newID(),
                timestamp,
                author: modelToUse.model,
                loading: true,
                message: { role: 'assistant', content: '' },
                currentVersion: timestamp.toString(),
                versions: {}
            });
            return updated;
        });
        return mode.insertAt;
    };

    /**
     * 完成 assistant 消息更新
     */
    const finalizeAssistantMessage = (
        targetIndex: number,
        result: ExtendedCompletionResult,
        msgToSend: IMessage[]
    ) => {
        const modelToUse = model();
        const vid = new Date().getTime().toString();

        messages.update(targetIndex, (msgItem: IChatSessionMsgItem) => {
            const newMessageContent: IMessage = {
                role: 'assistant',
                content: result.content,
            };
            if (result.reasoning_content) {
                newMessageContent['reasoning_content'] = result.reasoning_content;
            }

            let updated: IChatSessionMsgItem = {
                ...msgItem,
                loading: false,
                usage: result.usage,
                time: result.time,
                message: newMessageContent,
                author: modelToUse.model,
                timestamp: new Date().getTime(),
                attachedItems: msgToSend.length,
                attachedChars: msgToSend.reduce((sum, m) => {
                    const len = extractContentText(m.content).length;
                    return sum + len;
                }, 0),
            };

            if (result.usage?.completion_tokens) {
                updated.token = result.usage.completion_tokens;
            }
            if (result.hintSize) {
                updated.userPromptSlice = [result.hintSize, result.content.length];
            }
            if (result.toolChainData) {
                updated.toolChainResult = result.toolChainData;
            }

            return stageMsgItemVersion(updated, vid);
        });

        // 更新上一条消息的 prompt token
        if (result.usage && targetIndex > 0) {
            batch(() => {
                messages.update(targetIndex, 'token', result.usage?.completion_tokens);
                messages.update(targetIndex - 1, 'token', result.usage?.prompt_tokens);
            });
        }
    };

    /**
     * 通用执行函数
     * @param executor - 实际执行请求的函数
     * @param options - 执行选项
     */
    const runCompletion = async (
        executor: Executor,
        options: RunOptions
    ): Promise<RunResult> => {
        loading.update(true);
        controller = new AbortController();

        const msgToSend = options.getMsgToSend();
        const targetIndex = prepareAssistantMessage(options.prepareMode);
        const modelToUse = model();

        if (options.clearAttachments !== false) {
            params.multiModalAttachments.update([]);
            params.contexts.update([]);
        }

        try {
            const serviceType = (modelToUse?.type || 'chat') as LLMServiceType;
            const ctx: ExecutorContext = {
                targetIndex,
                modelToUse,
                controller,
                updateStream: (msg: string, _toolCalls?: IToolCallResponse[]) => {
                    messages.update(targetIndex, 'message', 'content', msg);
                    options.scrollToBottom?.(false);
                },
                msgToSend,
                runtimeOption: getRuntimeOption(serviceType) || {},
                systemPrompt: currentSystemPrompt()
            };

            let result = await executor(ctx);

            // 工具调用链处理
            if (options.supportsToolChain && result.tool_calls?.length) {
                result = await handleToolChain(
                    result,
                    msgToSend,
                    targetIndex,
                    options.scrollToBottom
                );
            }

            finalizeAssistantMessage(targetIndex, result as ExtendedCompletionResult, msgToSend);

            return { updatedTimestamp: Date.now(), hasResponse: true };
        } catch (error) {
            console.error('Completion error:', error);
            messages.update(targetIndex, 'loading', false);
            messages.update(targetIndex, 'message', 'content',
                `**[Error]** ${error instanceof Error ? error.message : String(error)}`
            );
            return { updatedTimestamp: Date.now(), hasResponse: false };
        } finally {
            loading.update(false);
            controller = null;
        }
    };

    // ========================================================================
    // 各模态的 Executor 工厂函数
    // ========================================================================

    /** Chat Completion Executor */
    const createChatExecutor = (): Executor => (ctx) => {
        const chatOption = ctx.runtimeOption as IChatCompleteOption;
        return gpt.complete(ctx.msgToSend, {
            model: ctx.modelToUse,
            systemPrompt: ctx.systemPrompt,
            stream: chatOption.stream,
            streamInterval: 2,
            streamMsg: ctx.updateStream,
            abortControler: ctx.controller,
            option: chatOption,
        });
    };

    /** Image Generation Executor */
    const createImageGenerateExecutor = (
        prompt: string,
        options?: Partial<Omit<IImageGenerationOptions, 'prompt'>> & {
            showRevisedPrompt?: boolean;
            imageTitle?: string;
        }
    ): Executor => async (ctx) => {
        const runtimeOption = ctx.runtimeOption as Partial<IImageGenerationOptions>;
        // customOptions() 最高优先级：运行时 option 覆盖 options
        const mergedOptions = deepMerge({ ...(options || {}) }, runtimeOption);
        const result = await generateImage(ctx.modelToUse, { prompt, ...(mergedOptions as any) });
        return imageResultToCompletion(result, {
            showRevisedPrompt: options?.showRevisedPrompt ?? true,
            imageTitle: options?.imageTitle
        });
    };

    /** Image Edit Executor */
    const createImageEditExecutor = (
        image: File | Blob,
        prompt: string,
        options?: Partial<Omit<IImageEditOptions, 'image' | 'prompt'>> & {
            imageTitle?: string;
        }
    ): Executor => async (ctx) => {
        const runtimeOption = ctx.runtimeOption as Partial<IImageEditOptions>;
        const mergedOptions = deepMerge({ ...(options || {}) }, runtimeOption);
        const result = await editImage(ctx.modelToUse, { image, prompt, ...(mergedOptions as any) });
        return imageResultToCompletion(result, {
            showRevisedPrompt: false,
            imageTitle: options?.imageTitle ?? '编辑后的图像'
        });
    };

    /** Audio Transcribe Executor */
    const createAudioTranscribeExecutor = (
        audioSource: File | Blob,
        options?: Partial<Omit<IAudioTranscriptionOptions, 'file'>> & {
            showTimestamps?: boolean;
            showSegments?: boolean;
        }
    ): Executor => async (ctx) => {
        const runtimeOption = ctx.runtimeOption as Partial<IAudioTranscriptionOptions>;
        const mergedOptions = deepMerge({ ...(options || {}) }, runtimeOption);
        const result = await transcribeAudio(ctx.modelToUse, { file: audioSource, ...(mergedOptions as any) });
        return transcriptionResultToCompletion(result, {
            showTimestamps: options?.showTimestamps,
            showSegments: options?.showSegments
        });
    };

    /** Audio Speak Executor */
    const createAudioSpeakExecutor = (
        text: string,
        options: Omit<ITextToSpeechOptions, 'input'> & { showInputText?: boolean }
    ): Executor => async (ctx) => {
        const runtimeOption = ctx.runtimeOption as Partial<ITextToSpeechOptions>;
        // 默认 voice 允许被 customOptions 覆盖
        const mergedOptions = deepMerge({ ...(options || {}) }, runtimeOption);
        const result = await textToSpeech(ctx.modelToUse, { input: text, ...(mergedOptions as any) });
        return ttsResultToCompletion(result, {
            showInputText: options?.showInputText ?? true,
            inputText: text
        });
    };

    // ========================================================================
    // 根据模型类型选择 Executor
    // ========================================================================

    // const getExecutorForServiceType = (
    //     serviceType: LLMServiceType,
    //     userText: string
    // ): { executor: Executor; supportsToolChain: boolean } | null => {
    //     switch (serviceType) {
    //         case 'image-gen':
    //             return { executor: createImageGenerateExecutor(userText), supportsToolChain: false };
    //         case 'audio-tts':
    //             return { executor: createAudioSpeakExecutor(userText, { voice: 'nova' }), supportsToolChain: false };
    //         case 'audio-stt':
    //             showMessage('音频转录不支持此操作');
    //             return null;
    //         case 'chat':
    //         default:
    //             return { executor: createChatExecutor(), supportsToolChain: true };
    //     }
    // };
    const getExecutorForServiceType = (
        serviceType: string | undefined,
        userText: string,
        multiModalAttachments?: TMessageContentPart[]
    ): { executor: Executor; supportsToolChain: boolean; needsHistory: boolean } | null => {
        switch (serviceType) {
            case 'image-gen':
                return { executor: createImageGenerateExecutor(userText), supportsToolChain: false, needsHistory: false };
            case 'image-edit':
                // 从 multiModalAttachments 中提取第一个图片
                const imageAttachment = multiModalAttachments?.find(part => part.type === 'image_url') as IImageContentPart | undefined;
                if (!imageAttachment) {
                    showMessage('图像编辑需要上传图片');
                    return null;
                }
                // 将 DataURL 转回 Blob
                const imageBlob = FormatConverter.dataURLToBlob(imageAttachment.image_url.url as DataURL);
                return { 
                    executor: createImageEditExecutor(imageBlob, userText), 
                    supportsToolChain: false, 
                    needsHistory: false 
                };
            case 'audio-tts':
                return { executor: createAudioSpeakExecutor(userText, { voice: 'nova' }), supportsToolChain: false, needsHistory: false };
            case 'audio-stt':
                // 从 multiModalAttachments 中提取第一个音频
                const audioAttachment = multiModalAttachments?.find(part => part.type === 'input_audio') as IAudioContentPart | undefined;
                if (!audioAttachment) {
                    showMessage('音频转录需要音频文件');
                    return null;
                }
                // 将 Base64 转回 Blob，根据 format 确定 MIME 类型
                const audioFormat = audioAttachment.input_audio.format || 'wav';
                const audioMimeType = audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
                const audioBlob = FormatConverter.base64ToBlob(
                    audioAttachment.input_audio.data as Base64String,
                    audioMimeType
                );
                return { 
                    executor: createAudioTranscribeExecutor(audioBlob), 
                    supportsToolChain: false, 
                    needsHistory: false 
                };
            case 'chat':
            default:
                return { executor: createChatExecutor(), supportsToolChain: true, needsHistory: true };
        }
    };

    // ========================================================================
    // 公开 API
    // ========================================================================

    const sendMessage = async (
        userMessage: string,
        multiModalAttachments: TMessageContentPart[],
        contexts: IProvidedContext[],
        scrollToBottom?: (force?: boolean) => void
    ): Promise<RunResult | undefined> => {
        // const llm = model();
        // const modelType = llm.config?.type; //思源内置模型可能没有 config 属性
        // switch (modelType) {
        //     case 'image-gen':
        //         return await imageGenerate(userMessage);
        //     case 'audio-tts':
        //         return await audioSpeak(userMessage, { voice: 'nova' });
        //     case 'audio-stt':
        //         return await audioTranscribe(attachments[0]);
        //     case 'chat':
        //     default:
        //         return await chatCompletion(userMessage, attachments, contexts, scrollToBottom);
        // }

        if (!userMessage.trim() && multiModalAttachments.length === 0 && contexts.length === 0) {
            return;
        }

        // 使用 IRuntimeLLM.type 而非 config.type，因为 config.type 可能是数组
        const modelType = model()?.type;
        const executorInfo = getExecutorForServiceType(modelType, userMessage, multiModalAttachments);
        if (!executorInfo) return;

        return runCompletion(executorInfo.executor, {
            prepareMode: 'append',
            getMsgToSend: () => executorInfo.needsHistory ? getAttachedHistory() : [],
            scrollToBottom,
            supportsToolChain: executorInfo.supportsToolChain,
            clearAttachments: true
        });
    };

    const reRunMessage = async (
        atIndex: number,
        scrollToBottom?: (force?: boolean) => void
    ): Promise<RunResult | undefined> => {
        if (atIndex < 0 || atIndex >= messages().length) return;

        const targetMsg = messages()[atIndex];
        if (targetMsg.type !== 'message' || targetMsg.hidden) {
            if (targetMsg.hidden) showMessage('无法重新生成此消息：已隐藏');
            return;
        }

        // 定位 user 消息
        let userIndex = atIndex;
        if (targetMsg.message.role === 'assistant') {
            if (atIndex === 0 ||
                messages()[atIndex - 1].message?.role !== 'user' ||
                messages()[atIndex - 1].hidden) {
                showMessage('无法重新生成此消息：需要用户输入作为前文');
                return;
            }
            userIndex = atIndex - 1;
        }

        // 提取用户输入
        const userContent = messages()[userIndex]?.message?.content;
        const userText = typeof userContent === 'string'
            ? userContent
            : extractMessageContent(userContent).text;

        // 获取 executor - 使用 IRuntimeLLM.type 而非 config.type
        const modelType = model()?.type;
        const executorInfo = getExecutorForServiceType(modelType, userText);
        if (!executorInfo) return;

        // 确定 prepareMode
        const nextIndex = userIndex + 1;
        const nextMsg = messages()[nextIndex];
        const prepareMode: PrepareMode =
            nextMsg?.message?.role === 'assistant' && !nextMsg.hidden
                ? { updateAt: nextIndex }
                : { insertAt: nextIndex };

        return runCompletion(executorInfo.executor, {
            prepareMode,
            getMsgToSend: () => executorInfo.needsHistory
                ? getAttachedHistory(config().attachedHistory, userIndex)
                : [],
            scrollToBottom,
            supportsToolChain: executorInfo.supportsToolChain,
            clearAttachments: true
        });
    };

    // const reRunMessage = async (
    //     atIndex: number,
    //     scrollToBottom?: (force?: boolean) => void
    // ): Promise<RunResult | undefined> => {
    //     if (atIndex < 0 || atIndex >= messages().length) return;

    //     const targetMsg = messages()[atIndex];
    //     if (targetMsg.type !== 'message' || targetMsg.hidden) {
    //         if (targetMsg.hidden) showMessage('无法重新生成此消息：已隐藏');
    //         return;
    //     }

    //     // 定位 user 消息
    //     let userIndex = atIndex;
    //     if (targetMsg.message.role === 'assistant') {
    //         if (atIndex === 0 ||
    //             messages()[atIndex - 1].message?.role !== 'user' ||
    //             messages()[atIndex - 1].hidden) {
    //             showMessage('无法重新生成此消息：需要用户输入作为前文');
    //             return;
    //         }
    //         userIndex = atIndex - 1;
    //     }

    //     const nextIndex = userIndex + 1;
    //     const nextMsg = messages()[nextIndex];

    //     // 确定准备模式
    //     const prepareMode: PrepareMode =
    //         nextMsg?.message?.role === 'assistant' && !nextMsg.hidden
    //             ? { updateAt: nextIndex }
    //             : { insertAt: nextIndex };

    //     // 根据模型类型选择 Executor
    //     const serviceType = model().config?.type || 'chat';
    //     const userContent = messages()[userIndex]?.message?.content;
    //     const userText = typeof userContent === 'string'
    //         ? userContent
    //         : extractMessageContent(userContent).text;

    //     const executorInfo = getExecutorForServiceType(serviceType, userText);
    //     if (!executorInfo) return;

    //     return runCompletion(executorInfo.executor, {
    //         prepareMode,
    //         getMsgToSend: () => getAttachedHistory(config().attachedHistory, userIndex),
    //         scrollToBottom,
    //         supportsToolChain: executorInfo.supportsToolChain,
    //         clearAttachments: true
    //     });
    // };

    // ================================================================
    // 封装的抽象方法
    // ================================================================

    // const chatCompletion = async (
    //     userMessage: string,
    //     attachments: Blob[],
    //     contexts: IProvidedContext[],
    //     scrollToBottom?: (force?: boolean) => void
    // ): Promise<RunResult | undefined> => {
    //     if (!userMessage.trim() && attachments.length === 0 && contexts.length === 0) {
    //         return;
    //     }

    //     return runCompletion(createChatExecutor(), {
    //         prepareMode: 'append',
    //         getMsgToSend: () => getAttachedHistory(),
    //         scrollToBottom,
    //         supportsToolChain: true,
    //         clearAttachments: true
    //     });
    // };

    // const imageGenerate = async (
    //     prompt: string,
    //     options?: Partial<Omit<IImageGenerationOptions, 'prompt'>> & {
    //         showRevisedPrompt?: boolean;
    //         imageTitle?: string;
    //     },
    //     scrollToBottom?: (force?: boolean) => void
    // ): Promise<RunResult> => {
    //     return runCompletion(createImageGenerateExecutor(prompt, options), {
    //         prepareMode: 'append',
    //         getMsgToSend: () => [],
    //         scrollToBottom,
    //         supportsToolChain: false,
    //         clearAttachments: true
    //     });
    // };

    // const imageEdit = async (
    //     image: File | Blob,
    //     prompt: string,
    //     options?: Partial<Omit<IImageEditOptions, 'image' | 'prompt'>> & {
    //         imageTitle?: string;
    //     },
    //     scrollToBottom?: (force?: boolean) => void
    // ): Promise<RunResult> => {
    //     return runCompletion(createImageEditExecutor(image, prompt, options), {
    //         prepareMode: 'append',
    //         getMsgToSend: () => [],
    //         scrollToBottom,
    //         supportsToolChain: false,
    //         clearAttachments: true
    //     });
    // };

    // const audioTranscribe = async (
    //     audioSource: File | Blob,
    //     options?: Partial<Omit<IAudioTranscriptionOptions, 'file'>> & {
    //         showTimestamps?: boolean;
    //         showSegments?: boolean;
    //     },
    //     scrollToBottom?: (force?: boolean) => void
    // ): Promise<RunResult> => {
    //     return runCompletion(createAudioTranscribeExecutor(audioSource, options), {
    //         prepareMode: 'append',
    //         getMsgToSend: () => [],
    //         scrollToBottom,
    //         supportsToolChain: false,
    //         clearAttachments: true
    //     });
    // };

    // const audioSpeak = async (
    //     text: string,
    //     options: Omit<ITextToSpeechOptions, 'input'> & { showInputText?: boolean },
    //     scrollToBottom?: (force?: boolean) => void
    // ): Promise<RunResult> => {
    //     return runCompletion(createAudioSpeakExecutor(text, options), {
    //         prepareMode: 'append',
    //         getMsgToSend: () => [],
    //         scrollToBottom,
    //         supportsToolChain: false,
    //         clearAttachments: true
    //     });
    // };

    const abortMessage = () => {
        if (loading()) {
            controller?.abort();
        }
    };

    const autoGenerateTitle = async () => {
        let attachedHistory = Math.max(0, Math.min(6, config().attachedHistory));
        const histories = getAttachedHistory(attachedHistory);
        if (histories.length === 0) return;

        const sizeLimit = config().maxInputLenForAutoTitle;
        const averageLimit = Math.floor(sizeLimit / histories.length);

        const inputContent = histories.map(item => {
            const { text } = extractMessageContent(item.content);
            let clipped = text.substring(0, averageLimit);
            if (clipped.length < text.length) clipped += '...(clipped)';
            return `<${item.role}>:\n${clipped}`;
        }).join('\n\n');

        const prompt = `请根据以下对话生成一个对话主题标题，15字以内，只输出标题:\n---\n${inputContent}`;
        const autoTitleModel = config().utilityModelId;

        const result = await quickComplete({
            model: autoTitleModel,
            systemPrompt: '你是一个专业的对话标题生成器，请根据用户提供的对话内容生成一个简洁的标题。',
            userPrompt: prompt,
            completionOptions: {
                max_tokens: 128,
                temperature: 0.7,
                stream: false
            }
        })
        return result.ok ? result.content : '标题生成失败，请手动输入';
    };

    return {
        // chatCompletionOption,
        autoGenerateTitle,
        sendMessage,
        reRunMessage,
        abortMessage,
    };
};

export { useGptCommunication };

