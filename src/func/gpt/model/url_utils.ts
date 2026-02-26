/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/url_utils.ts
 * @LastEditTime : 2025-12-12 18:31:45
 * @Description  : URL/path normalization utilities (internal)
 */

export const DEFAULT_CHAT_ENDPOINT = '/chat/completions';
export const DEFAULT_CLAUDE_CHAT_ENDPOINT = '/messages';
export const DEFAULT_GEMINI_CHAT_ENDPOINT = '/models/{model}:generateContent';

export const OPENAI_ENDPONITS: Record<LLMServiceType, string> = {
    chat: '/chat/completions',
    embeddings: '/embeddings',
    'image-gen': '/images/generations',
    'image-edit': '/images/edits',
    'audio-stt': '/audio/transcriptions',
    'audio-tts': '/audio/speech',
    // 'image-variation': '/images/variations',
    'moderation': '/moderations',

}

export const normalizeProviderProtocol = (
    provider?: Pick<ILLMProviderV2, 'protocol' | 'protocal'> | null
): LLMProviderProtocol => {
    const raw = (provider?.protocol || provider?.protocal || 'openai').toLowerCase();
    if (raw === 'claude' || raw === 'gemini' || raw === 'openai') {
        return raw;
    }
    // 向后兼容：曾短暂使用 anthropic 表示 Claude
    if (raw === 'anthropic') {
        return 'claude';
    }
    return 'openai';
};

export const getDefaultEndpointByProtocol = (
    protocol: LLMProviderProtocol,
    type: LLMServiceType = 'chat'
): string => {
    if (type !== 'chat') {
        return OPENAI_ENDPONITS[type];
    }
    if (protocol === 'claude') {
        return DEFAULT_CLAUDE_CHAT_ENDPOINT;
    }
    if (protocol === 'gemini') {
        return DEFAULT_GEMINI_CHAT_ENDPOINT;
    }
    return DEFAULT_CHAT_ENDPOINT;
};

export const resolveProviderEndpointPath = (
    provider: ILLMProviderV2,
    type: LLMServiceType = 'chat'
): string => {
    const configured = provider.endpoints?.[type];
    if (configured) return configured;
    return getDefaultEndpointByProtocol(normalizeProviderProtocol(provider), type);
};


/**
 * 确保 url 末尾没有斜杠 /
 */
export const trimTrailingSlash = (url?: string) => {
    if (!url) return url;
    return url.replace(/\/+$/, '');
};


/**
 * 确保路径以 / 开头
 */
export const ensureLeadingSlash = (path?: string) => {
    if (!path) return path;
    return path.startsWith('/') ? path : `/${path}`;
};

export const splitLegacyProviderUrl = (url?: string) => {
    // 按照插件之前的逻辑，旧版本的 url 末尾应该只会是 /chat/completions
    if (!url) {
        return {
            baseUrl: '',
            endpoint: DEFAULT_CHAT_ENDPOINT
        };
    }
    const normalized = url.trim();
    const marker = '/chat/completions';
    const idx = normalized.lastIndexOf(marker);
    if (idx !== -1) {
        const baseUrl = trimTrailingSlash(normalized.slice(0, idx)) || '';
        return {
            baseUrl,
            endpoint: marker
        };
    }
    try {
        const parsed = new URL(normalized);
        const baseUrl = `${parsed.origin}`;
        return {
            baseUrl: trimTrailingSlash(baseUrl + parsed.pathname) || baseUrl,
            endpoint: DEFAULT_CHAT_ENDPOINT
        };
    } catch (error) {
        return {
            baseUrl: trimTrailingSlash(normalized) || '',
            endpoint: DEFAULT_CHAT_ENDPOINT
        };
    }
};
