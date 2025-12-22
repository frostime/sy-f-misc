/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-22
 * @FilePath     : /src/func/gpt/tools/web/google.ts
 * @Description  : Google Search implementation with two modes: 
 *                 1. Google Custom Search API (requires API key)
 *                 2. Direct scraping (fallback, may be blocked in mainland China)
 */
import { getFrontend } from "siyuan";
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { forwardProxy } from "@/api";
import { GoogleSearchResult, GoogleSearchItem, WebToolError, WebToolErrorCode } from "./types";
import { globalMiscConfigs } from "../../setting";


const isBrowser = getFrontend().startsWith('browser');

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

/**
 * 使用 Google Custom Search API 进行搜索
 */
async function googleSearchAPI(
    query: string,
    apiKey: string,
    searchEngineId: string,
    pageIdx: number = 1,
    site?: string,
    filetype?: string,
    dateFilter?: 'day' | 'week' | 'month' | 'year'
): Promise<GoogleSearchResult> {
    // 构建搜索查询
    let searchQuery = query.trim();

    // 添加 site 和 filetype 过滤
    if (site) {
        searchQuery += ` site:${site}`;
    }
    if (filetype) {
        searchQuery += ` filetype:${filetype}`;
    }

    // 计算起始位置（Google API 使用 start 参数，每页最多10条）
    const start = (pageIdx - 1) * 10 + 1;

    // 构建 API URL
    const params = new URLSearchParams({
        key: apiKey,
        cx: searchEngineId,
        q: searchQuery,
        start: start.toString(),
        num: '10'
    });

    // 添加日期过滤
    if (dateFilter) {
        const dateFilterMap = {
            'day': 'd1',    // 过去24小时
            'week': 'w1',   // 过去一周
            'month': 'm1',  // 过去一个月
            'year': 'y1'    // 过去一年
        };
        params.append('dateRestrict', dateFilterMap[dateFilter]);
    }

    const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Google API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();

        // 解析搜索结果
        const items: GoogleSearchItem[] = (data.items || []).map((item: any) => ({
            title: item.title,
            link: item.link,
            description: item.snippet || '',
            displayLink: item.displayLink
        }));

        return {
            query,
            results: items,
            pageIndex: pageIdx,
            totalResults: parseInt(data.searchInformation?.totalResults || '0'),
            searchTime: parseFloat(data.searchInformation?.searchTime || '0'),
            filters: {
                site,
                filetype,
                dateFilter
            }
        };
    } catch (error) {
        console.error('Google API search error:', error);
        throw error;
    }
}

/**
 * 通过直接抓取 Google 搜索结果页面进行搜索（备用方案）
 */
function extractGoogleSearchResults(dom: Document): { title: string; link: string; description: string }[] {
    const searchResults: { title: string; link: string; description: string }[] = [];

    // Google 搜索结果的主容器
    const resultDivs = dom.querySelectorAll('#search div[data-rpos]')

    resultDivs.forEach((div) => {
        // 提取标题和链接
        const titleElement = div.querySelector('h3');
        const linkElement = div.querySelector('a');

        if (!titleElement || !linkElement) return;

        const title = titleElement.textContent?.trim() || '';
        const link = linkElement.getAttribute('href') || '';

        // 提取描述
        const descElements = div.querySelectorAll('div[data-sncf], div.VwiC3b, span.aCOpRe');
        let description = '';

        for (const elem of descElements) {
            const text = elem.textContent?.trim();
            if (text && text.length > description.length) {
                description = text;
            }
        }

        if (title && link && link.startsWith('http')) {
            searchResults.push({ title, link, description });
        }
    });

    return searchResults;
}

const fetchWeb = async (url: string, timeout: number = 7000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        if (!isBrowser) {
            const response = await fetch(url, {
                headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const text = await response.text();
                return {
                    ok: true,
                    content: text
                };
            }
        } else {
            const response = await forwardProxy(url, 'GET', null, [headers], timeout, 'text/html');
            clearTimeout(timeoutId);

            if (response && Math.floor(response.status / 100) === 2) {
                return {
                    ok: true,
                    content: response.body
                };
            }
        }

        return {
            ok: false,
            content: ''
        };
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('请求超时，可能是由于网络问题或 Google 服务在当前地区不可访问');
        }
        throw error;
    }
};

async function googleSearchScraping(
    query: string,
    pageIdx: number = 1,
    site?: string,
    filetype?: string,
    dateFilter?: 'day' | 'week' | 'month' | 'year'
): Promise<GoogleSearchResult> {
    // 构建查询字符串
    let searchQuery = query.trim();

    // 添加 site 和 filetype 过滤
    if (site) {
        searchQuery += ` site:${site}`;
    }
    if (filetype) {
        searchQuery += ` filetype:${filetype}`;
    }

    const encodedQuery = encodeURIComponent(searchQuery);

    // 计算起始位置
    const start = (pageIdx - 1) * 10;
    let url = `https://www.google.com/search?q=${encodedQuery}&start=${start}`;

    // 添加日期过滤
    if (dateFilter) {
        const dateFilterMap = {
            'day': 'qdr:d',    // 过去24小时
            'week': 'qdr:w',   // 过去一周
            'month': 'qdr:m',  // 过去一个月
            'year': 'qdr:y'    // 过去一年
        };
        url += `&tbs=${dateFilterMap[dateFilter]}`;
    }

    try {
        const result = await fetchWeb(url, 10000);

        if (!result.ok) {
            throw new Error('无法访问 Google 搜索，可能是由于网络问题或地区限制');
        }

        const html = result.content;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const results = extractGoogleSearchResults(doc);

        const items: GoogleSearchItem[] = results.map(item => ({
            ...item,
            displayLink: new URL(item.link).hostname
        }));

        return {
            query,
            results: items,
            pageIndex: pageIdx,
            filters: {
                site,
                filetype,
                dateFilter
            }
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Google 搜索主函数（自动选择 API 或抓取模式）
 */
export async function googleSearch(
    query: string,
    pageIdx: number = 1,
    site?: string,
    filetype?: string,
    dateFilter?: 'day' | 'week' | 'month' | 'year'
): Promise<GoogleSearchResult> {
    const config = globalMiscConfigs();
    const apiKey = config.googleApiKey;
    const searchEngineId = config.googleSearchEngineId;

    // 如果配置了 API key 和搜索引擎 ID，优先使用 API
    if (apiKey && searchEngineId) {
        try {
            return await googleSearchAPI(query, apiKey, searchEngineId, pageIdx, site, filetype, dateFilter);
        } catch (error) {
            console.warn('Google API search failed, falling back to scraping:', error);
            // API 失败时回退到抓取模式
        }
    }

    // 使用抓取模式
    return await googleSearchScraping(query, pageIdx, site, filetype, dateFilter);
}

/**
 * 格式化 Google 搜索结果为报告格式
 */
export function formatGoogleResultsToReport(data: { query: string; searchResults: GoogleSearchItem[] }): string {
    const { query, searchResults } = data;
    if (!searchResults || searchResults.length === 0) {
        return `**No search results found for: "${query}"**`;
    }

    let markdown = `## Google Search Results for: "${query}"\n\n`;

    searchResults.forEach((result, index) => {
        markdown += `### ${index + 1}. [${result.title}](${result.link})\n`;
        if (result.displayLink) {
            markdown += `*${result.displayLink}*\n\n`;
        }
        markdown += `${result.description}\n\n`;
    });

    markdown += `---\n*Search performed via Google*\n`;

    return markdown;
}

export const googleSearchTool: Tool = {
    declaredReturnType: {
        type: `{
    query: string;
    results: Array<{
        title: string;
        link: string;
        description: string;
        displayLink?: string;
    }>;
    pageIndex: number;
    totalResults?: number;
    searchTime?: number;
    filters?: {
        site?: string;
        filetype?: string;
        dateFilter?: 'day' | 'week' | 'month' | 'year';
    };
}`,
        note: 'Google 搜索结果，支持 API 模式（需要配置）和抓取模式（备用）'
    },

    definition: {
        type: 'function',
        function: {
            name: 'GoogleSearch',
            description: '使用 Google 获取互联网上的搜索结果。优先使用 Google Custom Search API（如已配置），否则使用网页抓取（可能在中国大陆受限）',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '搜索关键词'
                    },
                    site: {
                        type: 'string',
                        description: '可选: 限制搜索特定网站，如 "github.com" 或 "stackoverflow.com"'
                    },
                    filetype: {
                        type: 'string',
                        description: '可选: 限制搜索特定文件类型，如 "pdf", "doc", "ppt", "xls" 等'
                    },
                    dateFilter: {
                        type: 'string',
                        enum: ['day', 'week', 'month', 'year'],
                        description: '可选: 日期过滤 - day:过去24小时, week:过去一周, month:过去一个月, year:过去一年'
                    },
                    pageIdx: {
                        type: 'integer',
                        description: '可选: 页码，从1开始'
                    }
                },
                required: ['query']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: {
        query: string;
        site?: string;
        filetype?: string;
        dateFilter?: 'day' | 'week' | 'month' | 'year';
        pageIdx?: number
    }): Promise<ToolExecuteResult> => {
        try {
            const result = await googleSearch(
                args.query,
                args.pageIdx || 1,
                args.site,
                args.filetype,
                args.dateFilter
            );
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result
            };
        } catch (error) {
            console.error('Google search error:', error);

            // 判断错误类型
            let errorCode = WebToolErrorCode.FETCH_FAILED;
            let errorMessage = error.message || 'Google 搜索失败';

            if (errorMessage.includes('超时') || errorMessage.includes('timeout')) {
                errorCode = WebToolErrorCode.TIMEOUT;
                errorMessage = '请求超时。如果在中国大陆，Google 服务可能无法访问，建议使用 Bing 或其他搜索工具';
            } else if (errorMessage.includes('不可访问') || errorMessage.includes('地区限制')) {
                errorCode = WebToolErrorCode.FETCH_FAILED;
                errorMessage = 'Google 服务在当前地区不可访问，建议使用 Bing 或其他搜索工具';
            } else if (errorMessage.includes('API error')) {
                errorCode = WebToolErrorCode.API_ERROR;
            }

            const webError: WebToolError = {
                code: errorCode,
                message: errorMessage,
                details: error
            };

            return {
                status: ToolExecuteStatus.ERROR,
                data: webError
            };
        }
    },

    formatForLLM: (data: GoogleSearchResult): string => {
        if (!data || !data.results || data.results.length === 0) {
            return `**No search results found for: "${data?.query || 'unknown'}"**`;
        }

        const parts: string[] = [];

        // 标题部分
        parts.push(`## Google 搜索结果: "${data.query}"`);

        // 添加搜索统计信息（如果有）
        if (data.totalResults !== undefined) {
            parts.push(`*约 ${data.totalResults.toLocaleString()} 条结果*`);
        }
        if (data.searchTime !== undefined) {
            parts.push(`*搜索耗时: ${data.searchTime} 秒*`);
        }

        // 添加过滤器信息（如果有）
        if (data.filters) {
            const filterInfo: string[] = [];
            if (data.filters.site) filterInfo.push(`site:${data.filters.site}`);
            if (data.filters.filetype) filterInfo.push(`filetype:${data.filters.filetype}`);
            if (data.filters.dateFilter) {
                const dateMap = {
                    day: '过去24小时',
                    week: '过去一周',
                    month: '过去一个月',
                    year: '过去一年'
                };
                filterInfo.push(dateMap[data.filters.dateFilter]);
            }
            if (filterInfo.length > 0) {
                parts.push(`**过滤条件**: ${filterInfo.join(', ')}`);
            }
        }

        parts.push(''); // 空行

        // 处理搜索结果
        data.results.forEach((item, index) => {
            parts.push(`### ${index + 1}. [${item.title}](${item.link})`);
            if (item.displayLink) {
                parts.push(`*${item.displayLink}*`);
            }
            parts.push(item.description);
            parts.push(''); // 空行
        });

        // 页码信息
        if (data.pageIndex > 1) {
            parts.push(`*第 ${data.pageIndex} 页结果*`);
        }

        return parts.join('\n');
    }
};
