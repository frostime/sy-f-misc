/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-09-21
 * @FilePath     : /src/libs/collected-messages.ts
 * @Description  : 简单的消息收集器Hook
 */

import { showMessage } from "siyuan";

/**
 * 消息收集器 Hook
 * 
 * @returns hook 对象，包含 collect 和 show 方法
 */
export const useCollectedMessages = () => {
    const messages: { text: string, type: 'info' | 'error' }[] = [];

    return {
        collect: (text: string, type: 'info' | 'error' = 'info') => {
            messages.push({ text, type });
        },
        show: () => {
            if (messages.length === 0) return;

            //拆分 info error
            const infoMessages = messages.filter(m => m.type === 'info').map(m => m.text);
            const errorMessages = messages.filter(m => m.type === 'error').map(m => m.text);
            
            // 组合所有消息，按类型排序：先 info 后 error
            const allMessages: string[] = [];
            if (infoMessages.length > 0) {
                allMessages.push(...infoMessages.map(m => `• ${m}`));
            }
            if (errorMessages.length > 0) {
                if (infoMessages.length > 0) {
                    allMessages.push(''); // 添加空行分隔
                }
                allMessages.push(...errorMessages.map(m => `⚠️ ${m}`));
            }

            // 一次性显示所有消息，根据是否有错误决定消息类型
            const hasError = errorMessages.length > 0;
            const messageType = hasError ? 'error' : 'info';
            const timeout = hasError ? 5000 : 4000; // 有错误时显示更久
            
            showMessage(allMessages.join('<br/>'), timeout, messageType);
        },
        /**
         * 获取当前收集的消息数量
         */
        count: () => messages.length,
        /**
         * 清空收集的消息
         */
        clear: () => {
            messages.length = 0;
        }
    };
};