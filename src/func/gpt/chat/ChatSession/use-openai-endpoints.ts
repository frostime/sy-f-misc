/**
 * 同 OpenAI 端点的通信管理
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
import { ToolExecutor } from '@gpt/tools';
import { executeToolChain } from '@gpt/tools/toolchain';
import { extractContentText, extractMessageContent } from '@gpt/chat-utils';
import { deepMerge } from '@frostime/siyuan-plugin-kits';
import { quickComplete } from '../../openai/tiny-agent';
import { FormatConverter, DataURL, Base64String } from '@gpt/chat-utils/msg-modal';
import { ITreeModel } from './use-tree-model';

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
    /** 创建占位符，返回消息 ID */
    prepareSlot(mode: PrepareMode): string;
    /** 流式更新内容 */
    updateContent(id: string, content: string): void;
    /** 完成并保存结果 */
    finalize(id: string, result: ExtendedCompletionResult, meta: FinalizeMeta): void;
    /** 标记错误 */
    markError(id: string, error: Error | string): void;
}

const createMessageLifecycle = (
    treeModel: ITreeModel,
    model: Accessor<IRuntimeLLM>,
    newID: () => string
): IMessageLifecycle => {

    const prepareSlot = (mode: PrepareMode): string => {
        const modelToUse = model();
        const timestamp = new Date().getTime();

        if (mode === 'append') {
            const id = newID();
            const vid = `v_${id}`;

            treeModel.appendNode({
                id,
                type: 'message',
                role: 'assistant',
                currentVersionId: vid,
                versions: {
                    [vid]: {
                        id: vid,
                        message: { role: 'assistant', content: 'thinking...' },
                        author: modelToUse.model,
                        timestamp,
                        token: null,
                        time: null,
                    }
                },
                loading: true,
            });
            return id;
        }

        if ('updateAt' in mode) {
            const worldLine = treeModel.getWorldLine();
            const id = worldLine[mode.updateAt];
            if (!id) throw new Error(`Invalid updateAt index: ${mode.updateAt}`);

            const node = treeModel.getNodeById(id);
            if (!node) throw new Error(`Node not found: ${id}`);

            // Stage new version and mark as loading
            const vid = timestamp.toString();
            const currentPayload = node.versions[node.currentVersionId];

            batch(() => {
                treeModel.addVersion(id, {
                    ...currentPayload,
                    id: vid,
                    timestamp,
                });
                treeModel.updateNode(id, { loading: true });
            });
            return id;
        }

        // insertAt
        const worldLine = treeModel.getWorldLine();
        const afterId = worldLine[mode.insertAt - 1];
        if (!afterId) throw new Error(`Invalid insertAt index: ${mode.insertAt}`);

        const id = newID();
        const vid = `v_${id}`;

        treeModel.insertAfter(afterId, {
            id,
            type: 'message',
            role: 'assistant',
            currentVersionId: vid,
            versions: {
                [vid]: {
                    id: vid,
                    message: { role: 'assistant', content: '' },
                    author: modelToUse.model,
                    timestamp,
                    token: null,
                    time: null,
                }
            },
            loading: true,
        });
        return id;
    };

    const updateContent = (id: string, content: string): void => {
        treeModel.updatePayload(id, {
            message: { role: 'assistant', content }
        });
    };

    const finalize = (
        id: string,
        result: ExtendedCompletionResult,
        meta: FinalizeMeta
    ): void => {
        const vid = new Date().getTime().toString();
        const node = treeModel.getNodeById(id);
        if (!node) throw new Error(`Node not found: ${id}`);

        const newMessageContent: IMessage = {
            role: 'assistant',
            content: result.content,
        };
        if (result.reasoning_content) {
            newMessageContent['reasoning_content'] = result.reasoning_content;
        }

        // 构建新的 payload
        const newPayload: IMessagePayload = {
            id: vid,
            message: newMessageContent,
            author: meta.modelName,
            timestamp: new Date().getTime(),
            usage: result.usage,
            time: result.time,
            token: result.usage?.completion_tokens ?? null,
            userPromptSlice: result.hintSize ? [result.hintSize, result.content.length] : undefined,
        };

        // 更新节点
        batch(() => {
            treeModel.addVersion(id, newPayload);
            treeModel.updateNode(id, {
                loading: false,
                attachedItems: meta.msgToSend.length,
                attachedChars: meta.msgToSend.reduce((sum, m) => {
                    const len = extractContentText(m.content).length;
                    return sum + len;
                }, 0),
                // Note: toolChainResult 存储在 payload 中，而非节点上
            });

            // 更新上一条消息的 prompt token
            if (result.usage) {
                const worldLine = treeModel.getWorldLine();
                const currentIndex = worldLine.indexOf(id);
                if (currentIndex > 0) {
                    const prevId = worldLine[currentIndex - 1];
                    treeModel.updatePayload(prevId, {
                        token: result.usage.prompt_tokens
                    });
                }
            }
        });
    };

    const markError = (id: string, error: Error | string): void => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        batch(() => {
            treeModel.updateNode(id, { loading: false });
            treeModel.updatePayload(id, {
                message: { role: 'assistant', content: `**[Error]** ${errorMessage}` }
            });
        });
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
            abortController: params.controller,
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

// ============================================================================
// 辅助函数：从消息内容中提取图片
// ============================================================================

/**
 * 从消息内容中提取图片 Blob
 * 支持三种格式：
 * 1. TMessageContentPart[] 中的 image_url 类型
 * 2. Markdown 字符串中的 data URL 图片链接
 * 3. Markdown 字符串中的 http/https 图片链接（需要 fetch）
 */
const extractImageFromMessageContent = async (content: string | TMessageContentPart[]): Promise<Blob | null> => {
    if (Array.isArray(content)) {
        // 从 content parts 中提取
        const imagePart = content.find(p => p.type === 'image_url') as IImageContentPart | undefined;
        if (imagePart) {
            try {
                return FormatConverter.dataURLToBlob(imagePart.image_url.url as DataURL);
            } catch (error) {
                console.warn('Failed to extract image from content part:', error);
                return null;
            }
        }
    } else if (typeof content === 'string') {
        // 匹配格式: ![](data:image/...)
        const dataUrlRegex = /!\[.*?\]\((data:image\/[^;]+;base64,[^)]+)\)/;
        const dataUrlMatch = content.match(dataUrlRegex);
        if (dataUrlMatch && dataUrlMatch[1]) {
            try {
                return FormatConverter.dataURLToBlob(dataUrlMatch[1] as DataURL);
            } catch (error) {
                console.warn('Failed to extract data URL image:', error);
            }
        }

        // 匹配格式 ![](https?://...)
        const urlRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/;
        const urlMatch = content.match(urlRegex);
        if (urlMatch && urlMatch[1]) {
            try {
                const response = await fetch(urlMatch[1]);
                if (!response.ok) {
                    console.warn('Failed to fetch image:', response.statusText);
                    return null;
                }
                return await response.blob();
            } catch (error) {
                console.warn('Failed to fetch image from URL:', error);
                return null;
            }
        }
    }
    return null;
};

/**
 * 从消息列表中查找最近的包含图片的消息
 */
const findImageFromRecentMessages = async (messages: IChatSessionMsgItemV2[], atIndex: number): Promise<Blob | null> => {
    // 从 atIndex 向前查找第一个 message 类型节点
    let msg: IChatSessionMsgItemV2 | null = null;
    for (let i = atIndex; i >= 0; i--) {
        msg = messages[i];
        if (msg.type !== 'message') continue;
        break;
    }

    if (!msg) return null;

    // 直接从 V2 结构中获取 message content
    const currentPayload = msg.versions[msg.currentVersionId];
    if (!currentPayload?.message) return null;

    const image = await extractImageFromMessageContent(currentPayload.message.content);
    if (image) {
        return image;
    }
    return null;
};

// ============================================================================
// 3. Tool Chain Handler
// ============================================================================

interface ToolChainParams {
    toolExecutor: ToolExecutor;
    initialResponse: ICompletionResult;
    contextMessages: IMessage[];
    targetId: string;  // 从 index 改为 ID
    controller: AbortController;
    model: IRuntimeLLM;
    systemPrompt: string;
    chatOption: IChatCompleteOption;
    maxRounds: number;
    treeModel: ITreeModel;  // 从 messages 改为 treeModel
    scrollToBottom?: (force?: boolean) => void;
}

const handleToolChain = async (params: ToolChainParams): Promise<ExtendedCompletionResult> => {
    const {
        toolExecutor,
        initialResponse,
        contextMessages,
        targetId,
        controller,
        model,
        systemPrompt,
        chatOption,
        maxRounds,
        treeModel,
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
                    treeModel.updatePayload(targetId, {
                        message: { role: 'assistant', content }
                    });
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
    treeModel: ITreeModel;  // 从 messages 改为 treeModel
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
        treeModel,
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
    const lifecycle = createMessageLifecycle(treeModel, model, newID);

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
        targetId: string,
        scrollToBottom?: (force?: boolean) => void
    ): Promise<ExtendedCompletionResult> => {
        // 执行初始请求
        const initialResult = await chatHandler.execute({
            msgToSend,
            controller: controller!,
            onStream: (content, _toolCalls) => {
                lifecycle.updateContent(targetId, content);
                scrollToBottom?.(false);
            }
        });

        // 处理工具调用链
        if (toolExecutor && initialResult.tool_calls?.length) {
            return handleToolChain({
                toolExecutor,
                initialResponse: initialResult,
                contextMessages: msgToSend,
                targetId,
                controller: controller!,
                model: model(),
                systemPrompt: chatHandler.buildSystemPrompt(),
                chatOption: chatHandler.buildChatOption(),
                maxRounds: config().toolCallMaxRounds,
                treeModel,
                scrollToBottom
            });
        }

        return initialResult;
    };

    /**
     * 预检查：验证模态类型和必要的 attachments
     * 对于 image-edit，如果没有附件，允许稍后从上一条消息提取
     * 
     * @returns true 表示检查通过，false 表示检查失败
     */
    const preValidateModalType = (
        modelType: string | undefined,
        attachments: TMessageContentPart[]
    ): boolean => {
        switch (modelType) {
            case 'image-edit': {
                // 允许没有附件，稍后从上一条消息提取
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
        targetId: string,
        msgToSend: IMessage[],
        scrollToBottom?: (force?: boolean) => void
    ): Promise<{ result: ExtendedCompletionResult; msgToSend: IMessage[] }> => {

        switch (modelType) {
            case 'image-gen': {
                const result = await imageHandler.generate(userText);
                return { result, msgToSend };
            }

            case 'image-edit': {
                // 尝试从附件提取图片
                let image = imageHandler.extractImage(attachments);

                // 如果没有附件，尝试从上一条消息提取
                if (!image) {
                    // targetId 是新消息的占位符, 所以要从本消息往前走
                    const worldLine = treeModel.getWorldLine();
                    const currentIndex = worldLine.indexOf(targetId);
                    image = await findImageFromRecentMessages(treeModel.messages(), currentIndex - 2);
                    if (!image) {
                        throw new Error('图像编辑需要上传图片，或在上一条消息中包含图片');
                    }
                }

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
                const result = await executeChatRequest(msgToSend, targetId, scrollToBottom);
                return { result, msgToSend };
            }
        }
    };

    /**
     * 预检查 rerun 模态
     * 
     * @returns true 表示检查通过，false 表示检查失败
     */
    const preValidateRerunModalType = (
        modelType: string | undefined
    ): boolean => {
        switch (modelType) {
            case 'image-edit':
                // 允许 rerun，稍后从原始消息中提取图片
                return true;
            case 'audio-stt':
                // 音频转录不支持 rerun（无法从消息中恢复音频数据）
                showMessage('音频转录不支持重新生成');
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
        targetId: string,
        msgToSend: IMessage[],
        scrollToBottom?: (force?: boolean) => void
    ): Promise<{ result: ExtendedCompletionResult; msgToSend: IMessage[] }> => {

        switch (modelType) {
            case 'image-gen': {
                const result = await imageHandler.generate(userText);
                return { result, msgToSend };
            }

            case 'image-edit': {
                // 从消息历史中查找图片
                const worldLine = treeModel.getWorldLine();
                const currentIndex = worldLine.indexOf(targetId);
                const image = await findImageFromRecentMessages(treeModel.messages(), currentIndex - 2);
                if (!image) {
                    throw new Error('无法找到用于编辑的图片，请确保之前的消息中包含图片');
                }
                const result = await imageHandler.edit(image, userText);
                return { result, msgToSend };
            }

            case 'audio-tts': {
                const result = await audioHandler.speak(userText, { voice: 'nova' });
                return { result, msgToSend };
            }

            case 'chat':
            default: {
                const result = await executeChatRequest(msgToSend, targetId, scrollToBottom);
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
        const targetId = lifecycle.prepareSlot('append');

        // 清理附件和上下文
        multiModalAttachments.update([]);
        contexts.update([]);

        try {
            // 执行请求
            const executeResult = await executeByModalType(
                modelType,
                userMessage,
                multiModalAttachmentsValue,
                targetId,
                msgToSend,  // 传入预先获取的历史消息
                scrollToBottom
            );

            // 完成消息
            lifecycle.finalize(targetId, executeResult.result, {
                msgToSend: executeResult.msgToSend,
                modelName: model().model
            });

            return { updatedTimestamp: Date.now(), hasResponse: true };

        } catch (error) {
            console.error('Completion error:', error);
            lifecycle.markError(targetId, error instanceof Error ? error : String(error));
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
        const worldLine = treeModel.getWorldLine();
        if (atIndex < 0 || atIndex >= worldLine.length) return;

        const targetId = worldLine[atIndex];
        const targetMsg = treeModel.getNodeById(targetId);
        if (!targetMsg || targetMsg.type !== 'message' || targetMsg.hidden) {
            if (targetMsg?.hidden) showMessage('无法重新生成此消息：已隐藏');
            return;
        }

        // 定位 user 消息
        let userIndex = atIndex;
        const currentPayload = targetMsg.versions[targetMsg.currentVersionId];
        if (currentPayload.message.role === 'assistant') {
            if (atIndex === 0) {
                showMessage('无法重新生成此消息：需要用户输入作为前文');
                return;
            }
            const prevId = worldLine[atIndex - 1];
            const prevMsg = treeModel.getNodeById(prevId);
            const prevPayload = prevMsg?.versions[prevMsg.currentVersionId];
            if (!prevMsg || prevPayload?.message?.role !== 'user' || prevMsg.hidden) {
                showMessage('无法重新生成此消息：需要用户输入作为前文');
                return;
            }
            userIndex = atIndex - 1;
        }

        // 提取用户输入
        const userId = worldLine[userIndex];
        const userNode = treeModel.getNodeById(userId)!;
        const userPayload = userNode.versions[userNode.currentVersionId];
        const userContent = userPayload.message?.content;
        const userText = typeof userContent === 'string'
            ? userContent
            : extractMessageContent(userContent).text;

        const modelType = model()?.type;

        // 预检查：在创建占位符之前验证模态有效性
        if (!preValidateRerunModalType(modelType)) {
            return;
        }

        // 确定 prepareMode
        const nextIndex = userIndex + 1;
        const nextId = worldLine[nextIndex];
        const nextMsg = nextId ? treeModel.getNodeById(nextId) : null;
        const nextPayload = nextMsg?.versions[nextMsg.currentVersionId];
        const prepareMode: PrepareMode =
            nextPayload?.message?.role === 'assistant' && !nextMsg.hidden
                ? { updateAt: nextIndex }
                : { insertAt: nextIndex };

        loading.update(true);
        controller = new AbortController();

        // 先获取历史消息（在创建占位符之前）
        const msgToSend = (modelType === 'chat' || !modelType)
            ? getAttachedHistory(config().attachedHistory, userIndex)
            : [];

        // 创建/更新占位符
        const targetRerunId = lifecycle.prepareSlot(prepareMode);

        // 清理附件和上下文
        multiModalAttachments.update([]);
        contexts.update([]);

        try {
            // 执行请求
            const executeResult = await executeRerunByModalType(
                modelType,
                userText,
                targetRerunId,
                msgToSend,  // 传入预先获取的历史消息
                scrollToBottom
            );

            // 完成消息
            lifecycle.finalize(targetRerunId, executeResult.result, {
                msgToSend: executeResult.msgToSend,
                modelName: model().model
            });

            return { updatedTimestamp: Date.now(), hasResponse: true };

        } catch (error) {
            console.error('Completion error:', error);
            lifecycle.markError(targetRerunId, error instanceof Error ? error : String(error));
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
