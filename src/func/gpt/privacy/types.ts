/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-31
 * @FilePath     : /src/func/gpt/privacy/types.ts
 * @Description  : Privacy mask types
 */

/**
 * 隐私字段类型
 */
export type MaskType =
    | 'email'        // 邮箱地址
    | 'phone'        // 电话号码
    | 'bankcard'     // 银行卡号
    | 'api_key'      // API 密钥
    | 'password'     // 密码
    | 'id_card'      // 身份证号
    | 'address'      // 地址
    | 'name'         // 姓名
    | 'custom';      // 自定义

/**
 * 单个隐私字段配置
 */
export interface IPrivacyField {
    /** 匹配模式列表：可以是纯文本或正则表达式字符串 */
    patterns: string[];

    /** 是否为正则表达式模式 */
    isRegex: boolean;

    /** 屏蔽类型 */
    maskType: MaskType;

    /** 是否启用 */
    enabled: boolean;

    /** 可选的描述 */
    description?: string;
}

/**
 * Mask 映射项
 */
export interface IMaskMapEntry {
    /** mask token，如 __MASK_EMAIL_1__ */
    token: string;

    /** 原始值 */
    original: string;

    /** 类型 */
    type: MaskType;
}

/**
 * Mask Schema - 记录所有的屏蔽映射关系
 */
export interface IMaskSchema {
    /** 映射表：token -> original */
    mappings: Map<string, IMaskMapEntry>;

    /** 生成时间戳 */
    timestamp: number;
}
