/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-20 01:32:32
 * @FilePath     : /src/func/gpt/types.ts
 * @LastEditTime : 2024-12-20 01:33:53
 * @Description  : 
 */
interface IMessage {
    role: 'user' | 'assistant';
    content: string;
}
