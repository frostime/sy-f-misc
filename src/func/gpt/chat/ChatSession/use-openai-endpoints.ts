/**
 * use-openai-communication.ts - 重构版本
 *
 * ============================================================================
 * 行为一致性说明
 * ============================================================================
 * 
 * 1. 预检查失败时不创建消息占位符
 *    - preValidateModalType / preValidateRerunModalType 在 prepareSlot 之前执行
 *    - 检查失败时直接 return undefined，不调用 prepareSlot
 * 
 * 2. reRunMessage 对 image-edit / audio-stt 的错误消息
 *    - 原代码：调用 getExecutorForServiceType(modelType, userText) 不传 attachments
 *    - 导致 find() 返回 undefined，触发 "需要上传图片/音频文件" 的消息
 *    - 重构代码保持相同的错误消息，以确保行为一致
 * 
 * 3. 返回值
 *    - 预检查失败时返回 undefined（而非 { hasResponse: false }）
 *    - 与原代码的调用方兼容
 * 
 * ============================================================================
 * 后续改进建议（在确认行为一致后可考虑）
 * ============================================================================
 * 
 * 1. 错误消息语义优化
 *    - reRunMessage 中 image-edit/audio-stt 的错误消息可改为更准确的：
 *      "图像编辑不支持重新生成" / "音频转录不支持重新生成"
 *    - 需要与调用方确认是否依赖具体的错误消息文本
 * 
 * 2. 返回值规范化
 *    - 考虑统一返回 { success: boolean; error?: string } 结构
 *    - 便于调用方处理不同的失败场景
 * 
 * 3. 类型进一步收紧
 *    - ImageHandler/AudioHandler 的 buildRuntimeOption 仍返回 Record<string, any>
 *    - 可以定义更精确的 IImageRuntimeOption / IAudioRuntimeOption 接口
 * 
 * 4. 错误处理增强
 *    - 当前 markError 只显示错误消息文本
 *    - 可以增加错误类型区分（网络错误、API 错误、用户取消等）
 */

import { batch, Accessor } from 'solid-js';
import { showMessage } from 'siyuan';

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
import { deepMerge } from '@frostime/siyuan-plugin-kits';
import { quickComplete } from '../../openai/tiny-agent';
import { FormatConverter, DataURL, Base64String } from '@gpt/chat-utils/msg-modal';

// ============================================================================
// 类型定义
// ============================================================================

/** 消息准备模式 */
type PrepareMode =
    | 'append'
    | { updateAt: number }
    | { insertAt: number };

/** 执行结果 */
interface RunResult {
    updatedTimestamp: number;
    hasResponse: boolean;
}

/** 扩展的完成结果（包含工具链数据） */
interface ExtendedCompletionResult extends ICompletionResult {
    hintSize?: number;
    toolChainData?: IChatSessionMsgItem['toolChainResult'];
}

/** 消息完成时的元数据 */
interface FinalizeMeta {
    msgToSend: IMessage[];
    modelName: string;
}

// ============================================================================
// 1. MessageLifecycle - 消息生命周期管理
// ============================================================================

interface IMessageLifecycle {
    /** 创建占位符，返回目标索引 */
    prepareSlot(mode: PrepareMode): number;
    /** 流式更新内容 */
    updateContent(index: number, content: string): void;
    /** 完成并保存结果 */
    finalize(index: number, result: ExtendedCompletionResult, meta: FinalizeMeta): void;
    /** 标记错误 */
    markError(index: number, error: Error | string): void;
}

const createMessageLifecycle = (
    messages: IStoreRef<IChatSessionMsgItem[]>,
    model: Accessor<IRuntimeLLM>,
    newID: () => string
): IMessageLifecycle => {

    const prepareSlot = (mode: PrepareMode): number => {
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

    const updateContent = (index: number, content: string): void => {
        messages.update(index, 'message', 'content', content);
    };

    const finalize = (
        index: number,
        result: ExtendedCompletionResult,
        meta: FinalizeMeta
    ): void => {
        const vid = new Date().getTime().toString();

        messages.update(index, (msgItem: IChatSessionMsgItem) => {
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
                author: meta.modelName,
                timestamp: new Date().getTime(),
                attachedItems: meta.msgToSend.length,
                attachedChars: meta.msgToSend.reduce((sum, m) => {
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
        if (result.usage && index > 0) {
            batch(() => {
                messages.update(index, 'token', result.usage?.completion_tokens);
                messages.update(index - 1, 'token', result.usage?.prompt_tokens);
            });
        }
    };

    const markError = (index: number, error: Error | string): void => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        messages.update(index, 'loading', false);
        messages.update(index, 'message', 'content', `**[Error]** ${errorMessage}`);
    };

    return {
        prepareSlot,
        updateContent,
        finalize,
        markError
    };
};

// ============================================================================
// 2. Handlers - 各模态处理器
// ============================================================================

// ----------------------------------------------------------------------------
// 2.1 Chat Handler
// ----------------------------------------------------------------------------

interface ChatHandlerDeps {
    model: Accessor<IRuntimeLLM>;
    config: IStoreRef<IChatSessionConfig>;
    systemPrompt: ReturnType<typeof useSignalRef<string>>;
    customOptions: ISignalRef<IChatCompleteOption>;
    toolExecutor?: ToolExecutor;
}

interface ChatExecuteParams {
    msgToSend: IMessage[];
    controller: AbortController;
    onStream: (content: string, toolCalls?: IToolCallResponse[]) => void;
}

const createChatHandler = (deps: ChatHandlerDeps) => {
    const { model, config, systemPrompt, customOptions, toolExecutor } = deps;

    /** 构建 chat completion 选项 */
    const buildChatOption = (): IChatCompleteOption => {
        let option = { ...config().chatOption };

        // customOptions 最高优先级
        if (customOptions()) {
            option = deepMerge(option, (customOptions() as any) || {});
        }

        // 注入 tools
        if (toolExecutor?.hasEnabledTools()) {
            const tools = toolExecutor.getEnabledToolDefinitions();
            if (tools?.length) {
                option.tools = tools;
                option.tool_choice = 'auto';
            }
        }

        // 删除 null/undefined 字段
        Object.keys(option).forEach(key => {
            if (option[key] === null || option[key] === undefined) {
                delete option[key];
            }
        });

        return option;
    };

    /** 构建系统提示词 */
    const buildSystemPrompt = (): string => {
        const ptime = `It's: ${new Date().toString()}`;
        let prompt = systemPrompt().trim() || '';
        if (toolExecutor?.hasEnabledTools()) {
            prompt += toolExecutor.toolRules();
        }
        return `${ptime}\n\n${prompt}`;
    };

    /** 执行 chat completion */
    const execute = async (params: ChatExecuteParams): Promise<ICompletionResult> => {
        const chatOption = buildChatOption();
        return gpt.complete(params.msgToSend, {
            model: model(),
            systemPrompt: buildSystemPrompt(),
            stream: chatOption.stream,
            streamInterval: 2,
            streamMsg: params.onStream,
            abortControler: params.controller,
            option: chatOption,
        });
    };

    return {
        needsHistory: true,
        supportsToolChain: true,
        buildChatOption,
        buildSystemPrompt,
        execute
    };
};

type ChatHandler = ReturnType<typeof createChatHandler>;

// ----------------------------------------------------------------------------
// 2.2 Image Handler
// ----------------------------------------------------------------------------

interface ImageHandlerDeps {
    model: Accessor<IRuntimeLLM>;
    customOptions: ISignalRef<IChatCompleteOption>;
}

const createImageHandler = (deps: ImageHandlerDeps) => {
    const { model, customOptions } = deps;

    /** 从 attachments 提取图片 */
    const extractImage = (attachments: TMessageContentPart[]): Blob | null => {
        const part = attachments?.find(p => p.type === 'image_url') as IImageContentPart | undefined;
        if (!part) return null;
        return FormatConverter.dataURLToBlob(part.image_url.url as DataURL);
    };

    /** 构建运行时选项（移除 stream 相关字段） */
    const buildRuntimeOption = (): Record<string, any> => {
        let option: Record<string, any> = {};
        if (customOptions()) {
            option = deepMerge(option, (customOptions() as any) || {});
        }
        // 非 chat 强制移除 stream
        if ('stream' in option) delete option.stream;
        if ('stream_options' in option) delete option.stream_options;
        // 删除 null/undefined
        Object.keys(option).forEach(key => {
            if (option[key] === null || option[key] === undefined) {
                delete option[key];
            }
        });
        return option;
    };

    /** 图像生成 */
    const generate = async (
        prompt: string,
        options?: Partial<Omit<IImageGenerationOptions, 'prompt'>> & {
            showRevisedPrompt?: boolean;
            imageTitle?: string;
        }
    ): Promise<ICompletionResult> => {
        const runtimeOption = buildRuntimeOption();
        const mergedOptions = deepMerge({ ...(options || {}) }, runtimeOption);
        const result = await generateImage(model(), { prompt, ...(mergedOptions as any) });
        return imageResultToCompletion(result, {
            showRevisedPrompt: options?.showRevisedPrompt ?? true,
            imageTitle: options?.imageTitle
        });
    };

    /** 图像编辑 */
    const edit = async (
        image: Blob,
        prompt: string,
        options?: Partial<Omit<IImageEditOptions, 'image' | 'prompt'>> & {
            imageTitle?: string;
        }
    ): Promise<ICompletionResult> => {
        const runtimeOption = buildRuntimeOption();
        const mergedOptions = deepMerge({ ...(options || {}) }, runtimeOption);
        const result = await editImage(model(), { image, prompt, ...(mergedOptions as any) });
        return imageResultToCompletion(result, {
            showRevisedPrompt: false,
            imageTitle: options?.imageTitle ?? '编辑后的图像'
        });
    };

    return {
        needsHistory: false,
        supportsToolChain: false,
        extractImage,
        generate,
        edit
    };
};

type ImageHandler = ReturnType<typeof createImageHandler>;

// ----------------------------------------------------------------------------
// 2.3 Audio Handler
// ----------------------------------------------------------------------------

interface AudioHandlerDeps {
    model: Accessor<IRuntimeLLM>;
    customOptions: ISignalRef<IChatCompleteOption>;
}

const createAudioHandler = (deps: AudioHandlerDeps) => {
    const { model, customOptions } = deps;

    /** 从 attachments 提取音频 */
    const extractAudio = (attachments: TMessageContentPart[]): Blob | null => {
        const part = attachments?.find(p => p.type === 'input_audio') as IAudioContentPart | undefined;
        if (!part) return null;

        const audioFormat = part.input_audio.format || 'wav';
        const audioMimeType = audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
        return FormatConverter.base64ToBlob(
            part.input_audio.data as Base64String,
            audioMimeType
        );
    };

    /** 构建运行时选项 */
    const buildRuntimeOption = (): Record<string, any> => {
        let option: Record<string, any> = {};
        if (customOptions()) {
            option = deepMerge(option, (customOptions() as any) || {});
        }
        if ('stream' in option) delete option.stream;
        if ('stream_options' in option) delete option.stream_options;
        Object.keys(option).forEach(key => {
            if (option[key] === null || option[key] === undefined) {
                delete option[key];
            }
        });
        return option;
    };

    /** 语音转文字 */
    const transcribe = async (
        audioSource: Blob,
        options?: Partial<Omit<IAudioTranscriptionOptions, 'file'>> & {
            showTimestamps?: boolean;
            showSegments?: boolean;
        }
    ): Promise<ICompletionResult> => {
        const runtimeOption = buildRuntimeOption();
        const mergedOptions = deepMerge({ ...(options || {}) }, runtimeOption);
        const result = await transcribeAudio(model(), { file: audioSource, ...(mergedOptions as any) });
        return transcriptionResultToCompletion(result, {
            showTimestamps: options?.showTimestamps,
            showSegments: options?.showSegments
        });
    };

    /** 文字转语音 */
    const speak = async (
        text: string,
        options: Omit<ITextToSpeechOptions, 'input'> & { showInputText?: boolean }
    ): Promise<ICompletionResult> => {
        const runtimeOption = buildRuntimeOption();
        const mergedOptions = deepMerge({ ...(options || {}) }, runtimeOption);
        const result = await textToSpeech(model(), { input: text, ...(mergedOptions as any) });
        return ttsResultToCompletion(result, {
            showInputText: options?.showInputText ?? true,
            inputText: text
        });
    };

    return {
        needsHistory: false,
        supportsToolChain: false,
        extractAudio,
        transcribe,
        speak
    };
};

type AudioHandler = ReturnType<typeof createAudioHandler>;

// ============================================================================
// 3. Tool Chain Handler
// ============================================================================

interface ToolChainParams {
    toolExecutor: ToolExecutor;
    initialResponse: ICompletionResult;
    contextMessages: IMessage[];
    targetIndex: number;
    controller: AbortController;
    model: IRuntimeLLM;
    systemPrompt: string;
    chatOption: IChatCompleteOption;
    maxRounds: number;
    messages: IStoreRef<IChatSessionMsgItem[]>;
    scrollToBottom?: (force?: boolean) => void;
}

const handleToolChain = async (params: ToolChainParams): Promise<ExtendedCompletionResult> => {
    const {
        toolExecutor,
        initialResponse,
        contextMessages,
        targetIndex,
        controller,
        model,
        systemPrompt,
        chatOption,
        maxRounds,
        messages,
        scrollToBottom
    } = params;

    if (!toolExecutor || !initialResponse.tool_calls?.length) {
        return initialResponse;
    }

    try {
        const toolChainResult = await executeToolChain(toolExecutor, initialResponse, {
            contextMessages,
            maxRounds,
            abortController: controller,
            model,
            systemPrompt,
            chatOption,
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

// ============================================================================
// 4. Orchestrator - 编排层
// ============================================================================

interface UseGptCommunicationParams {
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
}

const useGptCommunication = (params: UseGptCommunicationParams) => {
    const {
        model,
        config,
        messages,
        systemPrompt,
        customOptions,
        loading,
        multiModalAttachments,
        contexts,
        toolExecutor,
        newID,
        getAttachedHistory
    } = params;

    // 创建消息生命周期管理器
    const lifecycle = createMessageLifecycle(messages, model, newID);

    // 创建各模态处理器
    const chatHandler = createChatHandler({
        model,
        config,
        systemPrompt,
        customOptions,
        toolExecutor
    });

    const imageHandler = createImageHandler({
        model,
        customOptions
    });

    const audioHandler = createAudioHandler({
        model,
        customOptions
    });

    // 当前的 AbortController
    let controller: AbortController | null = null;

    // ========================================================================
    // 核心执行逻辑
    // ========================================================================

    /**
     * 执行 chat 模态请求
     */
    const executeChatRequest = async (
        msgToSend: IMessage[],
        targetIndex: number,
        scrollToBottom?: (force?: boolean) => void
    ): Promise<ExtendedCompletionResult> => {
        // 执行初始请求
        const initialResult = await chatHandler.execute({
            msgToSend,
            controller: controller!,
            onStream: (content, _toolCalls) => {
                lifecycle.updateContent(targetIndex, content);
                scrollToBottom?.(false);
            }
        });

        // 处理工具调用链
        if (toolExecutor && initialResult.tool_calls?.length) {
            return handleToolChain({
                toolExecutor,
                initialResponse: initialResult,
                contextMessages: msgToSend,
                targetIndex,
                controller: controller!,
                model: model(),
                systemPrompt: chatHandler.buildSystemPrompt(),
                chatOption: chatHandler.buildChatOption(),
                maxRounds: config().toolCallMaxRounds,
                messages,
                scrollToBottom
            });
        }

        return initialResult;
    };

    /**
     * 预检查：验证模态类型和必要的 attachments
     * 与原代码 getExecutorForServiceType 返回 null 的逻辑等价
     * 
     * @returns true 表示检查通过，false 表示检查失败
     */
    const preValidateModalType = (
        modelType: string | undefined,
        attachments: TMessageContentPart[]
    ): boolean => {
        switch (modelType) {
            case 'image-edit': {
                const image = imageHandler.extractImage(attachments);
                if (!image) {
                    showMessage('图像编辑需要上传图片');
                    return false;
                }
                return true;
            }
            case 'audio-stt': {
                const audio = audioHandler.extractAudio(attachments);
                if (!audio) {
                    showMessage('音频转录需要音频文件');
                    return false;
                }
                return true;
            }
            default:
                return true;
        }
    };

    /**
     * 根据模态类型执行请求
     * 注意：调用前应先调用 preValidateModalType 进行预检查
     * @param msgToSend - 预先获取的历史消息（在创建占位符之前获取）
     */
    const executeByModalType = async (
        modelType: string | undefined,
        userText: string,
        attachments: TMessageContentPart[],
        targetIndex: number,
        msgToSend: IMessage[],
        scrollToBottom?: (force?: boolean) => void
    ): Promise<{ result: ExtendedCompletionResult; msgToSend: IMessage[] }> => {

        switch (modelType) {
            case 'image-gen': {
                const result = await imageHandler.generate(userText);
                return { result, msgToSend };
            }

            case 'image-edit': {
                // 预检查已确保 image 存在
                const image = imageHandler.extractImage(attachments)!;
                const result = await imageHandler.edit(image, userText);
                return { result, msgToSend };
            }

            case 'audio-tts': {
                const result = await audioHandler.speak(userText, { voice: 'nova' });
                return { result, msgToSend };
            }

            case 'audio-stt': {
                // 预检查已确保 audio 存在
                const audio = audioHandler.extractAudio(attachments)!;
                const result = await audioHandler.transcribe(audio);
                return { result, msgToSend };
            }

            case 'chat':
            default: {
                const result = await executeChatRequest(msgToSend, targetIndex, scrollToBottom);
                return { result, msgToSend };
            }
        }
    };

    /**
     * 预检查 rerun 模态
     * 
     * 注意：原代码 reRunMessage 调用 getExecutorForServiceType(modelType, userText) 
     * 不传递 multiModalAttachments，导致 image-edit 和 audio-stt 检查失败。
     * 错误消息为 "需要上传图片/音频文件"（虽然语义上"不支持重新生成"更准确，
     * 但为了行为一致，保持原有消息）。
     * 
     * @returns true 表示检查通过，false 表示检查失败
     */
    const preValidateRerunModalType = (
        modelType: string | undefined
    ): boolean => {
        switch (modelType) {
            case 'image-edit':
                // 原代码：multiModalAttachments 为 undefined，find 返回 undefined
                // 触发 "图像编辑需要上传图片" 消息
                showMessage('图像编辑需要上传图片');
                return false;
            case 'audio-stt':
                // 原代码：multiModalAttachments 为 undefined，find 返回 undefined
                // 触发 "音频转录需要音频文件" 消息
                showMessage('音频转录需要音频文件');
                return false;
            default:
                return true;
        }
    };

    /**
     * 根据模态类型执行 rerun 请求
     * @param msgToSend - 预先获取的历史消息（在创建占位符之前获取）
     */
    const executeRerunByModalType = async (
        modelType: string | undefined,
        userText: string,
        targetIndex: number,
        msgToSend: IMessage[],
        scrollToBottom?: (force?: boolean) => void
    ): Promise<{ result: ExtendedCompletionResult; msgToSend: IMessage[] }> => {

        switch (modelType) {
            case 'image-gen': {
                const result = await imageHandler.generate(userText);
                return { result, msgToSend };
            }

            case 'audio-tts': {
                const result = await audioHandler.speak(userText, { voice: 'nova' });
                return { result, msgToSend };
            }

            case 'chat':
            default: {
                const result = await executeChatRequest(msgToSend, targetIndex, scrollToBottom);
                return { result, msgToSend };
            }
        }
    };

    // ========================================================================
    // 公开 API
    // ========================================================================

    /**
     * 发送消息
     */
    const sendMessage = async (
        userMessage: string,
        multiModalAttachmentsValue: TMessageContentPart[],
        contextsValue: IProvidedContext[],
        scrollToBottom?: (force?: boolean) => void
    ): Promise<RunResult | undefined> => {
        // 检查是否有输入
        if (!userMessage.trim() && multiModalAttachmentsValue.length === 0 && contextsValue.length === 0) {
            return;
        }

        const modelType = model()?.type;

        // 预检查：在创建占位符之前验证模态有效性
        // 与原代码 getExecutorForServiceType 返回 null 的行为一致
        if (!preValidateModalType(modelType, multiModalAttachmentsValue)) {
            return;  // 返回 undefined，与原代码一致
        }

        loading.update(true);
        controller = new AbortController();

        // 先获取历史消息（在创建占位符之前）
        // 这样 msgToSend 不会包含即将创建的 loading 占位符
        const msgToSend = (modelType === 'chat' || !modelType) 
            ? getAttachedHistory() 
            : [];

        // 创建占位符
        const targetIndex = lifecycle.prepareSlot('append');

        // 清理附件和上下文
        multiModalAttachments.update([]);
        contexts.update([]);

        try {
            // 执行请求
            const executeResult = await executeByModalType(
                modelType,
                userMessage,
                multiModalAttachmentsValue,
                targetIndex,
                msgToSend,  // 传入预先获取的历史消息
                scrollToBottom
            );

            // 完成消息
            lifecycle.finalize(targetIndex, executeResult.result, {
                msgToSend: executeResult.msgToSend,
                modelName: model().model
            });

            return { updatedTimestamp: Date.now(), hasResponse: true };

        } catch (error) {
            console.error('Completion error:', error);
            lifecycle.markError(targetIndex, error instanceof Error ? error : String(error));
            return { updatedTimestamp: Date.now(), hasResponse: false };

        } finally {
            loading.update(false);
            controller = null;
        }
    };

    /**
     * 重新运行消息
     */
    const reRunMessage = async (
        atIndex: number,
        scrollToBottom?: (force?: boolean) => void
    ): Promise<RunResult | undefined> => {
        // 边界检查
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

        const modelType = model()?.type;

        // 预检查：在创建占位符之前验证模态有效性
        // 与原代码 getExecutorForServiceType(modelType, userText) 不传 attachments 的行为一致
        if (!preValidateRerunModalType(modelType)) {
            return;  // 返回 undefined，与原代码一致
        }

        // 确定 prepareMode
        const nextIndex = userIndex + 1;
        const nextMsg = messages()[nextIndex];
        const prepareMode: PrepareMode =
            nextMsg?.message?.role === 'assistant' && !nextMsg.hidden
                ? { updateAt: nextIndex }
                : { insertAt: nextIndex };

        loading.update(true);
        controller = new AbortController();

        // 先获取历史消息（在创建占位符之前）
        // 即使传了 fromIndex=userIndex，但为了保持代码一致性和清晰度，提前获取
        const msgToSend = (modelType === 'chat' || !modelType)
            ? getAttachedHistory(config().attachedHistory, userIndex)
            : [];

        // 创建/更新占位符
        const targetIndex = lifecycle.prepareSlot(prepareMode);

        // 清理附件和上下文
        multiModalAttachments.update([]);
        contexts.update([]);

        try {
            // 执行请求
            const executeResult = await executeRerunByModalType(
                modelType,
                userText,
                targetIndex,
                msgToSend,  // 传入预先获取的历史消息
                scrollToBottom
            );

            // 完成消息
            lifecycle.finalize(targetIndex, executeResult.result, {
                msgToSend: executeResult.msgToSend,
                modelName: model().model
            });

            return { updatedTimestamp: Date.now(), hasResponse: true };

        } catch (error) {
            console.error('Completion error:', error);
            lifecycle.markError(targetIndex, error instanceof Error ? error : String(error));
            return { updatedTimestamp: Date.now(), hasResponse: false };

        } finally {
            loading.update(false);
            controller = null;
        }
    };

    /**
     * 中止当前请求
     */
    const abortMessage = () => {
        if (loading()) {
            controller?.abort();
        }
    };

    /**
     * 自动生成标题
     */
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
        });

        return result.ok ? result.content : '标题生成失败，请手动输入';
    };

    return {
        autoGenerateTitle,
        sendMessage,
        reRunMessage,
        abortMessage,
    };
};

export { useGptCommunication };
