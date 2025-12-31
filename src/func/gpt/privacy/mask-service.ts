/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-31
 * @FilePath     : /src/func/gpt/privacy/mask-service.ts
 * @Description  : Privacy mask service implementation
 */

import { IPrivacyField, IMaskSchema, MaskType } from './types';

/**
 * 隐私屏蔽服务
 */
export class PrivacyMaskService {
    private counter: number = 0;

    /**
     * 对文本执行屏蔽
     * @param text 原始文本
     * @param fields 隐私字段配置
     * @returns 屏蔽后的文本和映射 schema
     */
    mask(text: string, fields: IPrivacyField[]): { masked: string; schema: IMaskSchema } {
        if (!text || fields.length === 0) {
            return {
                masked: text,
                schema: {
                    mappings: new Map(),
                    timestamp: Date.now()
                }
            };
        }

        const schema: IMaskSchema = {
            mappings: new Map(),
            timestamp: Date.now()
        };

        let masked = text;
        const enabledFields = fields.filter(f => f.enabled);

        for (const field of enabledFields) {
            if (field.isRegex) {
                masked = this.maskByRegex(masked, field, schema);
            } else {
                masked = this.maskByText(masked, field, schema);
            }
        }

        return { masked, schema };
    }

    /**
     * 使用正则表达式屏蔽
     */
    private maskByRegex(text: string, field: IPrivacyField, schema: IMaskSchema): string {
        let result = text;
        for (const pattern of field.patterns) {
            if (!pattern) continue;
            try {
                const regex = new RegExp(pattern, 'g');
                result = result.replace(regex, (match) => {
                    const token = this.generateToken(field.maskType);
                    schema.mappings.set(token, {
                        token,
                        original: match,
                        type: field.maskType
                    });
                    return token;
                });
            } catch (error) {
                console.error(`Invalid regex pattern: ${pattern}`, error);
            }
        }
        return result;
    }

    /**
     * 使用纯文本屏蔽
     */
    private maskByText(text: string, field: IPrivacyField, schema: IMaskSchema): string {
        let result = text;

        for (const pattern of field.patterns) {
            if (!pattern) continue;

            const token = this.generateToken(field.maskType);
            const occurrences = result.split(pattern).length - 1;

            if (occurrences > 0) {
                schema.mappings.set(token, {
                    token,
                    original: pattern,
                    type: field.maskType
                });
                // 替换所有匹配项
                result = result.split(pattern).join(token);
            }
        }

        return result;
    }

    /**
     * 恢复原始内容
     * @param text 屏蔽后的文本
     * @param schema mask schema
     * @returns 恢复后的文本
     */
    recover(text: string, schema: IMaskSchema): string {
        if (!text || !schema || schema.mappings.size === 0) {
            return text;
        }

        let recovered = text;

        // 遍历所有映射，替换回原始值
        for (const [token, entry] of schema.mappings.entries()) {
            recovered = recovered.split(token).join(entry.original);
        }

        return recovered;
    }

    /**
     * 生成唯一的 mask token
     */
    private generateToken(type: MaskType): string {
        this.counter++;
        return `__MASK_${type.toUpperCase()}_${this.counter}__`;
    }

    /**
     * 重置计数器（用于新会话）
     */
    resetCounter(): void {
        this.counter = 0;
    }
}

/**
 * 单例实例
 */
export const privacyMaskService = new PrivacyMaskService();
