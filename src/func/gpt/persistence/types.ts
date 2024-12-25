/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-25 16:08:53
 * @FilePath     : /src/func/gpt/persistence/types.ts
 * @LastEditTime : 2024-12-25 16:10:10
 * @Description  : 
 */
interface IChatSessionHistoryShotcut {
    id: string;
    title: string;
    timestamp: number;
    shotcut: string; // 简要提取其内容，不把存储完整的对话信息了
}
