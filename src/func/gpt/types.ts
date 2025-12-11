/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-20 01:32:32
 * @FilePath     : /src/func/gpt/types.ts
 * @LastEditTime : 2025-05-30 19:32:40
 * @Description  :
 */
// ============================================================================
// Message Content Types（ OpenAI 规范）
// 参考 https://platform.openai.com/docs/api-reference/chat/create
// ============================================================================

/**
 * 文本内容部分
 */
interface ITextContentPart {
    type: 'text';
    text: string;
}

/**
 * 图片内容部分
 */
interface IImageContentPart {
    type: 'image_url';
    image_url: {
        url: string;  // URL 或 base64 encoded image data
        detail?: 'auto' | 'low' | 'high';
    };
}

/**
 * 音频内容部分
 * 注意：OpenAI 使用 input_audio，不是 audio_url
 */
interface IAudioContentPart {
    type: 'input_audio';
    input_audio: {
        data: string;  // Base64 encoded audio data
        format: 'wav' | 'mp3';
    };
}

/**
 * 文件内容部分
 * 注意：OpenAI 使用 file，不是 file_url
 */
interface IFileContentPart {
    type: 'file';
    file: {
        file_data?: string;   // Base64 encoded file data
        file_id?: string;     // Uploaded file ID
        filename?: string;    // File name
    };
}

/**
 * 内容部分联合类型
 */
type TMessageContentPart =
    | ITextContentPart
    | IImageContentPart
    | IAudioContentPart
    | IFileContentPart
// | string;

/**
 * 消息内容类型
 * 可以是简单字符串，或内容部分数组
 */
type TMessageContent = string | TMessageContentPart[];

// ============================================================================
// Message Types
// ============================================================================

/**
 * 用户消息
 */
interface IUserMessage {
    role: 'user';
    content: TMessageContent;
    name?: string;  // 可选的参与者名称
}

/**
 * 助手消息
 */
interface IAssistantMessage {
    role: 'assistant';
    content: string | null;
    name?: string;
    refusal?: string | null;  // 拒绝回答的原因
    reasoning_content?: string;
    tool_calls?: IToolCall[];
}

/**
 * 系统消息
 */
interface ISystemMessage {
    role: 'system';
    content: string;
    name?: string;
}

/**
 * 工具消息（工具调用的结果）
 */
interface IToolMessage {
    role: 'tool';
    content: string;
    tool_call_id: string;
}

interface IMessageLoose {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: TMessageContent | string | null;
    name?: string;
    refusal?: string | null;
    reasoning_content?: string;
    tool_calls?: IToolCall[];
    tool_call_id?: string;
    [key: string]: any;
}

/**
 * 消息联合类型
 */
type IMessageStrict =
    | IUserMessage
    | IAssistantMessage
    | ISystemMessage
    | IToolMessage;

// 较为宽松，规避严格类型检查
// type IMessageLoose = {
//     role: 'user' | 'assistant' | 'system' | 'tool';
//     content: TMessageContent;
//     reasoning_content?: string;
//     tool_call_id?: string;
//     tool_calls?: IToolCallResponse[];
//     [key: string]: any;
// };

type IMessage = IMessageStrict | IMessageLoose;



interface IPromptTemplate {
    name: string;
    content: string;
    type: 'system' | 'user';
}

/**
 * Interface defining the options for interacting with the OpenAI GPT API.
 */
/**
 * JSON Schema 属性类型，用于 OpenAI tool call
 */
interface JSONSchemaProperty {
    type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
    description?: string;
    enum?: any[];
    items?: JSONSchemaProperty | JSONSchemaProperty[];  // 用于数组类型
    properties?: Record<string, JSONSchemaProperty>;    // 用于对象类型
    required?: string[];                               // 用于对象类型
    minimum?: number;                                 // 用于数值类型
    maximum?: number;                                 // 用于数值类型
}

interface IToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;  // JSON string
    };
}

interface IToolDefinition {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters: {
            type: 'object';
            properties: Record<string, JSONSchemaProperty>;
            required?: string[];
            additionalProperties?: boolean;
        };
        strict?: boolean;
    };
}

/**
 * 工具选择，用于控制模型如何选择工具
 */
type IToolChoice =
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };

// ============================================================================
// Chat Completion Options
// ============================================================================


/**
 * 工具调用响应，模型生成的工具调用
 */
interface IToolCallResponse {
    id: string;
    index: number;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON 字符串
    };
}

interface IChatCompleteOption {


    // Sampling parameters
    temperature?: number;  // 0-2
    top_p?: number;  // 0-1
    max_tokens?: number;
    max_completion_tokens?: number;

    // Penalties
    frequency_penalty?: number;  // -2 to 2
    presence_penalty?: number;   // -2 to 2

    // Stop sequences
    stop?: string | string[];

    // Streaming
    stream?: boolean;
    stream_options?: {
        include_usage?: boolean;
    };

    // Tools
    tools?: IToolDefinition[];
    tool_choice?: IToolChoice;
    parallel_tool_calls?: boolean;

    // Response format
    response_format?: {
        type: 'text' | 'json_object' | 'json_schema';
        json_schema?: {
            name: string;
            description?: string;
            schema: Record<string, any>;
            strict?: boolean;
        };
    };

    reasoning_effort?: 'none' | 'low' | 'medium' | 'high';

    // Audio
    audio?: {
        voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
        format: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';
    };

    // Modalities
    modalities?: ('text' | 'audio')[];

    // Other
    seed?: number;
    n?: number;  // Number of completions
    logprobs?: boolean;
    top_logprobs?: number;
    logit_bias?: Record<string, number>;
    user?: string;

    // Metadata
    metadata?: Record<string, string>;
    store?: boolean;
}



// ========================================
// Response
// ========================================
interface ICompletionUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;

    //trivials
    prompt_tokens_details?: {
        cached_tokens?: number;
        audio_tokens?: number;
    };
    completion_tokens_details?: {
        reasoning_tokens?: number;
        audio_tokens?: number;
    };
}

// interface ICompletionResponse {
//     id: string;
//     object: 'chat.completion';
//     created: number;
//     model: string;
//     choices: {
//         index: number;
//         message: IAssistantMessage;
//         finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call';
//         logprobs?: any;
//     }[];
//     usage?: ICompletionUsage;
//     system_fingerprint?: string;

//     // Extended fields (from our wrapper)
//     references?: { title?: string; url: string }[];
//     time?: {
//         latency: number;  // ms
//         throughput?: number;  // tokens/s
//     };
// }


interface ICompletionResult {
    ok?: boolean;
    content: string;
    usage?: {
        completion_tokens: number;
        prompt_tokens: number;
        total_tokens: number;
    };
    reasoning_content?: string;
    references?: {
        title?: string;
        url: string;
    }[];
    time?: {
        latency: number; // ms
        throughput?: number; // tokens/s
    };
    tool_calls?: IToolCallResponse[];
}


// ========================================
// LLM V1 版本配置; To be deprecated; 替代为 ILLMProviderV2
// ========================================
interface IGPTProvider {
    name: string;  //provider 的名称, 例如 OpenAI, V3 等等
    models: string[];  //所有的模型
    url: string;
    apiKey: string;
    disabled?: boolean;  //是否禁用该provider
    redirect?: Record<string, string>;  //模型名称重定向; 适合字节火山等使用接入端点而非模型名称作为输入的情况
}

// ========================================
// LLM V2 版本类型替代
// ========================================

type ModelBareId = string | 'siyuan';  // <modelName>@<providerName>

type LLMServiceType =
    | 'chat'          // 对应 /chat/completions
    | 'embeddings'    // 对应 /embeddings
    | 'image'         // 对应 /images/generations
    | 'audio_stt'     // 对应 /audio/transcriptions
    | 'audio_tts'     // 对应 /audio/speech
    | 'moderation'    // 对应 /moderations
    | string;         // 扩展

type LLMModality = 'text' | 'image' | 'file' | 'audio' | 'video';

//替代 IGPTProvider
interface ILLMProviderV2 {
    name: string;  //provider 的名称, 例如 OpenAI, V3 等等
    baseUrl: string;  //API URL, 例如 https://api.openai.com/v1
    apiKey: string;
    customHeaders?: Record<string, string>;  // 自定义请求头

    disabled: boolean;  //是否禁用该provider

    /** OpenAI 兼容的 endpoint 映射 */
    endpoints: Partial<Record<LLMServiceType, string>> & {
        /** chat 一般都是 /chat/completions 或 /responses */
        chat?: string;
        /** embeddings 多半是 /embeddings */
        embeddings?: string;
        /** 图像生成 */
        image?: string;
        audio_speech?: string;
        audio_transcriptions?: string;
    };
    // baseUrl + endpoints[type] 组成完整的 API URL

    models: ILLMConfigV2[];  //所有的模型
}

//替代 IGPTProvider['models']
interface ILLMConfigV2 {
    model: string;  //模型名称
    displayName?: string; //显示名称; 在火山方舟这种场景下比较有用

    type: LLMServiceType; // 决定使用 provider.endpoints 中的哪个路径

    disabled?: boolean;

    modalities: {
        input: LLMModality[];
        output: LLMModality[];
    };

    capabilities: {
        tools?: boolean;  //是否支持工具调用 默认 true
        streaming?: boolean; //是否支持流式输出 默认 true
        reasoning?: boolean; // 是否支持推理字段 (reasoning_content),
        jsonMode?: boolean;  // 是否支持 json_object
        reasoningEffort?: boolean; // 是否支持 reasoning_effort: 'none' | 'low' | 'medium' | 'high'
        // structuredOutputs?: boolean;  // json_schema
    }

    limits: {
        maxContext?: number;      // 最大上下文窗口 (Context Window)
        maxOutput?: number;       // 最大输出 token
        temperatureRange?: [number, number];
        [key: string]: any; //后面再扩展吧
    }

    options: {
        //强制覆盖对话中的选项; 比如指定 think effort 等
        customOverride?: Partial<IChatCompleteOption & Record<string, any>>;
        //不支持的选项列表
        unsupported?: (keyof IChatCompleteOption | string)[];
    };

    price?: {
        inputPerK: number;  //每1K tokens 的价格
        outputPerK: number; //每1K tokens 的价格
        unit?: string;    //价格单位, "USD" | "CNY"
    }
}

interface IRuntimeLLM {
    // modelToUse?: string; //模型, 发送给 Chat 请求用的名称, 如果为空则使用 model
    model: string;  //模型名称
    url: string;
    apiKey: string;
    bareId: ModelBareId;  // model@Provider
    config?: ILLMConfigV2;
    provider?: Omit<ILLMProviderV2, 'models'>;
}


/**
 * 对话 Session 中各个 item 记录
 */
interface IChatSessionMsgItem {
    /**
     * 如果是 message 代表一个对话的记录
     * 如果是 seperator，代表清空上下文记录，开启一个新的会话段落，此时无需关注
    */
    type: 'message' | 'seperator';
    id: string;
    message?: IMessageLoose;  // 如果多版本 versions 存在, 则 message === versions[currentVersion]
    currentVersion?: string; // 当前 version
    versions?: Record<string, {
        content: IMessage['content'];
        reasoning_content?: IAssistantMessage['reasoning_content'];
        author?: IChatSessionMsgItem['author'];
        timestamp?: IChatSessionMsgItem['timestamp'];
        token?: IChatSessionMsgItem['token'];
        time?: ICompletionResult['time'];
    }>; //多版本 message 情况下有用
    context?: IProvidedContext[];
    // 为了在 MessageItem 当中隐藏 context prompt，在这里记录 prompt 字符串的起止位置
    // 通过 slice 可以 获取 user prompt, 而去掉 context prompt 部分
    userPromptSlice?: [number, number];
    token?: number;
    usage?: {
        completion_tokens: number;
        prompt_tokens: number;
        total_tokens: number;
    };
    time?: {
        latency: number; // ms
        throughput?: number; // tokens/s
    };
    author?: string;
    timestamp?: number;
    title?: string;
    loading?: boolean;  // 用于存储消息的输出状态，仅仅在等待过程中需求使用
    hidden?: boolean;   // 用于标识是否在获取上下文时跳过此消息
    pinned?: boolean;   // 用于标识是否固定此消息（即使超出上下文范围也保留）
    // msgChars?: number;  //消息的字数
    attachedItems?: number;  //上下文消息条目数量, 不包括自身
    attachedChars?: number;  //上下文的字数, 不包括自身
    branchFrom?: {
        sessionId: string;
        sessionTitle: string;
        messageId: string;
    };
    branchTo?: {
        sessionId: string;
        sessionTitle: string;
        messageId: string;
    }[];
    /**
     * 工具调用链结果（如果这条消息经过了工具调用）
     */
    toolChainResult?: {
        // 工具调用历史记录
        toolCallHistory: {
            callId: string;
            toolName: string;
            args: any;
            result: {
                status: any;  // ToolExecuteStatus
                data?: any;
                error?: string;
                rejectReason?: string;
            };
            startTime: number;
            endTime: number;
            roundIndex: number;
            resultRejected?: boolean;
            resultRejectReason?: string;
            // 本轮的 token 使用情况（如果有）
            llmUsage?: {
                prompt_tokens: number;
                completion_tokens: number;
                total_tokens: number;
            };
        }[];
        // 执行统计
        stats: {
            totalRounds: number;
            totalCalls: number;
            totalTime: number;
            startTime: number;
            endTime: number;
        };
        // 完成状态
        status: 'completed' | 'aborted' | 'error' | 'timeout';
        error?: string;
    };
}

interface IChatSessionHistory {
    type?: 'history'; // 类型标识; 将 History 和 Snapshot 区分开来; 可选; 默认就为 history
    id: string;
    title: string;
    timestamp: number;
    updated?: number;
    items: IChatSessionMsgItem[];
    sysPrompt?: string;
    tags?: string[];
}

/**
 * 聊天会话的快照数据，用于性能优化的历史记录列表显示
 */
interface IChatSessionSnapshot {
    type: 'snapshot'; // 类型标识; 将 History 和 Snapshot 区分开来
    id: string;
    title: string;
    timestamp: number;
    updated?: number;
    tags?: string[];
    preview: string; // 前500字的内容预览
    messageCount: number; // 消息数量
    lastMessageAuthor: string; // 最后一条消息的作者
    lastMessageTime: number; // 最后一条消息的时间
    // systemPrompt?: string;
}

/**
 * 历史记录快照文件的数据结构
 */
interface IHistorySnapshot {
    schema: string; // snapshot数据结构版本，用于兼容性检查
    lastUpdated: number; // snapshot最后更新时间
    sessions: IChatSessionSnapshot[]; // 会话快照数组
}

interface IChatSessionConfig {
    attachedHistory: number;
    //GPT 常常使用 \( \) 语法，但是 md 习惯使用 $ $ 语法，需要转换
    convertMathSyntax: boolean;
    maxInputLenForAutoTitle: number;
    utilityModelId?: string;
    renderInStreamMode: boolean; // 是否在 stream 模式下渲染 markdown
    toolCallMaxRounds: number; // 工具调用最大轮次
    chatOption: IChatCompleteOption;
}
