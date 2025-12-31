/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-31
 * @FilePath     : /src/func/gpt/privacy/message-mask.ts
 * @Description  : Helper functions for masking/recovering messages
 */

import { privacyMaskService } from './mask-service';
import { IPrivacyField, IMaskSchema } from './types';



/**
 * Mask all messages
 * @param messages 原始消息数组
 * @param fields 隐私字段配置
 * @returns 屏蔽后的消息数组和 schema
 */
export const maskMessages = (
    messages: IMessage[],
    fields: IPrivacyField[]
): { masked: IMessage[]; schema: IMaskSchema } => {
    const schema: IMaskSchema = {
        mappings: new Map(),
        timestamp: Date.now()
    };

    const enabledFields = fields.filter(f => f.enabled);
    if (enabledFields.length === 0) {
        return { masked: messages, schema };
    }

    const masked = messages.map(msg => {
        const newMsg = { ...msg };

        if (msg.content) {
            if (typeof msg.content === 'string') {
                const result = privacyMaskService.mask(msg.content, enabledFields);
                newMsg.content = result.masked;
                // 合并 schema mappings
                result.schema.mappings.forEach((value, key) => {
                    schema.mappings.set(key, value);
                });
            } else if (Array.isArray(msg.content)) {
                newMsg.content = msg.content.map(part => {
                    if (part.type === 'text') {
                        const result = privacyMaskService.mask(part.text, enabledFields);
                        // 合并 schema mappings
                        result.schema.mappings.forEach((value, key) => {
                            schema.mappings.set(key, value);
                        });
                        return { ...part, text: result.masked };
                    }
                    return part;
                });
            }
        }

        return newMsg;
    });

    return { masked, schema };
};

/**
 * Recover content from masked text
 * @param content 屏蔽后的内容
 * @param schema mask schema
 * @returns 恢复后的内容
 */
export const recoverContent = (content: string, schema: IMaskSchema): string => {
    if (!content || !schema || schema.mappings.size === 0) {
        return content;
    }
    return privacyMaskService.recover(content, schema);
};
