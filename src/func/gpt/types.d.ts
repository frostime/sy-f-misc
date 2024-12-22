/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-20 01:32:32
 * @FilePath     : /src/func/gpt/types.d.ts
 * @LastEditTime : 2024-12-22 15:53:25
 * @Description  : 
 */
interface IMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
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
     * Default is 1.
     * @type {number}
     * @range 0.0 - 2.0
     */
    temperature?: number;

    /**
     * Penalizes tokens based on how frequently they have appeared so far.
     * Between -2.0 and 2.0. Positive values will reduce repetition and help the model generate novel text.
     * Default is 0.
     * @type {number}
     * @range -2.0 - 2.0
     */
    frequency_penalty?: number;

    /**
     * Nucleus sampling. An alternative to temperature.
     * Only the tokens with a cumulative probability mass greater than this value are considered.
     * Use either temperature or top_p, not both.
     * Default is 1.
     * @type {number}
     * @range 0.0 - 1.0
     */
    top_p?: number;

    /**
     * The number of responses to generate.
     * Default is 1.
     * @type {number}
     */
    n?: number;

    /**
     * Whether to stream results.
     * If true, you'll receive the response in chunks. Requires different handling of the response.
     * Default is false.
     * @type {boolean}
     */
    stream?: boolean;

    /**
     * A list of sequences where the generation should stop.
     * Useful for limiting the output to a specific structure or length.
     * Default is null.
     * @type {string[] | null}
     */
    stop?: string[] | null;

    /**
     * The maximum number of tokens in the response.
     * Useful for limiting costs and preventing long responses.
     * Default is null.
     * @type {number}
     */
    max_tokens?: number;

    /**
     * Penalizes tokens that have already appeared in the text.
     * Between -2.0 and 2.0. Positive values will reduce the likelihood of repeated content.
     * Default is 0.
     * @type {number}
     * @range -2.0 - 2.0
     */
    presence_penalty?: number;

}

interface IGPTProvider {
    name: string;  //provider 的名称, 例如 OpenAI, V3 等等
    models: string[];  //所有的模型
    url: string;
    apiKey: string;
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
    message?: IMessage;
}

interface IChatSessionConfig extends IChatOption {
    attachedHistory: number;
}
