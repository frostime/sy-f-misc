/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-14
 * @FilePath     : /src/func/gpt/tools/web/types.ts
 * @Description  : Web 工具组的共享类型定义
 */

/**
 * Web 工具组统一错误码
 */
export enum WebToolErrorCode {
    /** URL 格式无效 */
    INVALID_URL = 'INVALID_URL',
    /** 网络请求失败 */
    FETCH_FAILED = 'FETCH_FAILED',
    /** 内容解析失败 */
    PARSE_FAILED = 'PARSE_FAILED',
    /** 请求超时 */
    TIMEOUT = 'TIMEOUT',
    /** 不支持的二进制内容 */
    BINARY_CONTENT = 'BINARY_CONTENT',
    /** API Key 未配置 */
    API_KEY_MISSING = 'API_KEY_MISSING',
    /** API 请求错误 */
    API_ERROR = 'API_ERROR',
    /** API 速率限制 */
    RATE_LIMIT = 'RATE_LIMIT',
    /** 未知错误 */
    UNKNOWN = 'UNKNOWN'
}

/**
 * Web 工具组统一错误类型
 */
export interface WebToolError {
    /** 错误码 */
    code: WebToolErrorCode;
    /** 错误消息 */
    message: string;
    /** 相关 URL（如果有） */
    url?: string;
    /** 额外的错误详情 */
    details?: any;
}

/**
 * Bing 搜索单条结果
 */
export interface BingSearchItem {
    /** 标题 */
    title: string;
    /** 链接 URL（直接回答时为空字符串） */
    link: string;
    /** 描述/摘要 */
    description: string;
    /** 是否为 Bing 直接回答（link 为空） */
    isDirectAnswer?: boolean;
}

/**
 * Bing 搜索结果
 */
export interface BingSearchResult {
    /** 搜索查询词 */
    query: string;
    /** 搜索结果列表 */
    results: BingSearchItem[];
    /** 页码 */
    pageIndex: number;
    /** 应用的过滤器 */
    filters?: {
        site?: string;
        filetype?: string;
        dateFilter?: 'day' | 'week' | 'month';
    };
}

/**
 * Google 搜索单条结果
 */
export interface GoogleSearchItem {
    /** 标题 */
    title: string;
    /** 链接 URL */
    link: string;
    /** 描述/摘要 */
    description: string;
    /** 显示的域名 */
    displayLink?: string;
}

/**
 * Google 搜索结果
 */
export interface GoogleSearchResult {
    /** 搜索查询词 */
    query: string;
    /** 搜索结果列表 */
    results: GoogleSearchItem[];
    /** 页码 */
    pageIndex: number;
    /** 总结果数（仅 API 模式） */
    totalResults?: number;
    /** 搜索耗时（仅 API 模式） */
    searchTime?: number;
    /** 应用的过滤器 */
    filters?: {
        site?: string;
        filetype?: string;
        dateFilter?: 'day' | 'week' | 'month' | 'year';
    };
}

/**
 * Tavily 搜索单条结果
 */
export interface TavilySearchItem {
    url: string;
    title: string;
    content: string;
    score: number;
    raw_content?: string;
}

/**
 * Tavily 搜索结果
 */
export interface TavilySearchResult {
    query: string;
    answer?: string;
    results: TavilySearchItem[];
    images?: {
        url: string;
        description?: string;
    }[];
    search_id: string;
    created_at: string;
    time: string;
}

/**
 * 网页内容结果
 */
export interface WebPageContentResult {
    /** 网页标题 */
    title: string;
    /** 网页描述（meta description） */
    description: string;
    /** 网页关键词（meta keywords） */
    keywords: string;
    /** 作者（meta author） */
    author: string;
    /** 主要内容（Markdown 或 HTML） */
    content: string;
    /** 原始 URL */
    url: string;
    /** 内容类型 */
    contentType: string | null;
    /** 内容模式 */
    mode: 'markdown' | 'raw';
    /** 原始内容长度 */
    originalLength: number;
    /** 返回的内容长度（可能经过截断） */
    shownLength: number;
    /** 是否被截断 */
    isTruncated: boolean;
    /** 关键词搜索结果（如果使用了关键词搜索） */
    keywordSearch?: {
        keywords: string[];
        joinType: 'AND' | 'OR';
        matchCount: number;
        totalCount: number;
        matches: Array<{
            index: number;
            content: string;
            matchedKeywords: string[];
            startPosition?: number;
            endPosition?: number;
        }>;
    };
}
