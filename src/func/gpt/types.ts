/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-20 01:32:32
 * @FilePath     : /src/func/gpt/types.ts
 * @LastEditTime : 2025-01-28 15:58:32
 * @Description  : 
 */
interface IMessageContent {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url: string;
    };
}

type TMessageContent = IMessageContent[] | string;

interface IMessage {
    role: 'user' | 'assistant' | 'system';
    content: TMessageContent;
}

interface IPromptTemplate {
    name: string;
    content: string;
    type: 'system' | 'user';
}

/**
 * Interface defining the options for interacting with the OpenAI GPT API.
 */
interface IChatOption {
    /**
     * Controls the randomness of the output.
     * Lower values (e.g., 0.2) make it more deterministic, higher values (e.g., 1.0) make it more creative.
     * Default is 0.7 for Chat Completions.
     * @type {number}
     * @range 0.0 - 2.0
     */
    temperature?: number;

    /**
     * Nucleus sampling. An alternative to temperature.
     * Only the tokens comprising the smallest set that exceeds the probability mass of this value are considered.
     * Use either temperature or top_p, not both.
     * Default is 1.0 for Chat Completions.
     * @type {number}
     * @range 0.0 - 1.0
     */
    top_p?: number;

    /**
     * The maximum number of tokens in the response.
     * Useful for limiting costs and preventing long responses.
     * Default is model-dependent (e.g., 4096 for gpt-3.5-turbo).
     * @type {number}
     */
    max_tokens?: number;

    /**
     * Penalizes tokens based on how frequently they have appeared so far in the text.
     * Between -2.0 and 2.0. Positive values will reduce repetition and help the model generate novel text.
     * Default is 0.
     * @type {number}
     * @range -2.0 - 2.0
     */
    frequency_penalty?: number;

    /**
     * Penalizes tokens that have already appeared in the text, regardless of how many times they have appeared.
     * Between -2.0 and 2.0. Positive values will reduce the likelihood of repeated content.
     * Default is 0.
     * @type {number}
     * @range -2.0 - 2.0
     */
    presence_penalty?: number;

    /**
     * Specifies a stop sequence or multiple stop sequences for the API to stop generating further tokens.
     * The returned text will not contain the stop sequence.
     * Default is null.
     * @type {string | string[]}
     */
    stop?: string | string[];

    stream?: boolean
}

interface IGPTProvider {
    name: string;  //provider 的名称, 例如 OpenAI, V3 等等
    models: string[];  //所有的模型
    url: string;
    apiKey: string;
    disabled?: boolean;  //是否禁用该provider
}

interface IGPTModel {
    model: string;  //模型名称, 可以
    url: string;
    apiKey: string;
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
    message?: IMessage;  // 如果多版本 versions 存在, 则 message === versions[currentVersion]
    currentVersion?: string; // 当前 version
    versions?: Record<string, {
        content: TMessageContent;
        author?: string;
        timestamp?: number;
        token?: number;
    }>; //多版本 message 情况下有用
    context?: IProvidedContext[];
    // 为了在 MessageItem 当中隐藏 context prompt，在这里记录 prompt 字符串的起止位置
    // 通过 slice 可以 获取 user prompt, 而去掉 context prompt 部分
    userPromptSlice?: [number, number];
    token?: number;
    author?: string;
    timestamp?: number;
    title?: string;
    loading?: boolean;  // 用于存储消息的输出状态，仅仅在等待过程中需求使用
    hidden?: boolean;   // 用于标识是否在获取上下文时跳过此消息
    // msgChars?: number;  //消息的字数
    attachedItems?: number;  //上下文消息条目数量, 不包括自身
    attachedChars?: number;  //上下文的字数, 不包括自身
}

interface IChatSessionHistory {
    id: string;
    title: string;
    timestamp: number;
    items: IChatSessionMsgItem[];
    sysPrompt?: string;
}

interface IChatSessionConfig {
    attachedHistory: number;
    //GPT 常常使用 \( \) 语法，但是 md 习惯使用 $ $ 语法，需要转换
    convertMathSyntax: boolean;
    maxInputLenForAutoTitle: number;
    autoTitleModelId?: string;
    chatOption: IChatOption;
}
