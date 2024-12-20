/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-20 01:32:32
 * @FilePath     : /src/func/gpt/types.d.ts
 * @LastEditTime : 2024-12-21 00:47:34
 * @Description  : 
 */
interface IMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface IGPTProvider {
    id: string;
    model?: string;
    url?: string;
    apiKey?: string;
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

interface IChatSessionConfig {
    provider?: IGPTProvider;
    attachedHistory: number;
}
