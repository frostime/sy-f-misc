/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/url_utils.ts
 * @LastEditTime : 2025-12-10
 * @Description  : URL/path normalization utilities (internal)
 */

export const DEFAULT_CHAT_ENDPOINT = '/chat/completions';


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