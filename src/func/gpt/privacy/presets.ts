/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-31
 * @FilePath     : /src/func/gpt/privacy/presets.ts
 * @Description  : Privacy field presets
 */

import { IPrivacyField } from './types';

/**
 * 预设的隐私字段配置
 */
export const PRIVACY_PRESETS: IPrivacyField[] = [
    {
        patterns: ['\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b'],
        isRegex: true,
        maskType: 'email',
        enabled: false,
        description: '邮箱地址'
    },
    {
        patterns: ['1[3-9]\\d{9}'],
        isRegex: true,
        maskType: 'phone',
        enabled: false,
        description: '中国大陆手机号'
    },
    {
        patterns: ['\\b[0-9]{16,19}\\b'],
        isRegex: true,
        maskType: 'bankcard',
        enabled: false,
        description: '银行卡号（16-19位）'
    },
    {
        patterns: ['sk-[A-Za-z0-9]{48}'],
        isRegex: true,
        maskType: 'api_key',
        enabled: false,
        description: 'OpenAI API Key'
    },
    {
        patterns: ['\\b[1-9]\\d{5}(18|19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[0-9Xx]\\b'],
        isRegex: true,
        maskType: 'id_card',
        enabled: false,
        description: '中国大陆身份证号'
    }
];
