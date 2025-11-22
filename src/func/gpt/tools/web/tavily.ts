/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-15
 * @FilePath     : /src/func/gpt/tools/web/tavily.ts
 * @Description  : Tavily search API integration
 */
import { globalMiscConfigs } from '../../setting/store';
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from '../types';
import { saveAndTruncate } from '../utils';

export interface TavilySearchResponse {
    query: string;
    answer?: string;
    results: {
        url: string;
        title: string;
        content: string;
        score: number;
        raw_content?: string;
    }[];
    images?: {
        url: string;
        description?: string;
    }[];
    search_id: string;
    created_at: string;
    time: string;
}

export interface TavilyExtractResponse {
    content: {
        url: string;
        content: string;
        images?: string[];
    }[];
    failed_urls?: {
        url: string;
        error: string;
    }[];
    time: number;
}

/**
 * Performs a web search using the Tavily API
 * @param query The search query
 * @returns The search results or null if the search failed
 */
export async function tavilySearch(query: string, options?: {
    search_depth?: 'basic' | 'advanced';
    include_domains?: string[];
    exclude_domains?: string[];
    include_answer?: boolean | 'basic' | 'advanced';
    max_results?: number;
    include_raw_content?: boolean;
    include_images?: boolean;
    include_image_descriptions?: boolean;
    topic?: 'general' | 'news';
    days?: number;
}): Promise<TavilySearchResponse | null> {
    const tavilyApiKey = globalMiscConfigs().tavilyApiKey;

    if (!tavilyApiKey) {
        console.error('Tavily API key is not configured');
        return null;
    }

    try {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tavilyApiKey}`
            },
            body: JSON.stringify({
                query,
                search_depth: options?.search_depth ?? 'advanced',
                include_domains: options?.include_domains ?? [],
                exclude_domains: options?.exclude_domains ?? [],
                include_answer: options?.include_answer ?? false,
                max_results: options?.max_results ?? 5,
                include_raw_content: options?.include_raw_content ?? false,
                include_images: options?.include_images ?? false,
                include_image_descriptions: options?.include_image_descriptions ?? false,
                topic: options?.topic ?? 'general',
                ...(options?.topic === 'news' && options?.days !== undefined ? { days: options.days } : {})
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Tavily API error:', errorText);
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error calling Tavily API:', error);
        return null;
    }
}

/**
 * Extracts content from URLs using the Tavily API
 * @param urls Array of URLs to extract content from
 * @returns The extracted content or null if the extraction failed
 */
export async function tavilyExtract(urls: string | string[], options?: {
    extraction_depth?: 'basic' | 'advanced';
    include_images?: boolean;
}): Promise<TavilyExtractResponse | null> {
    const tavilyApiKey = globalMiscConfigs().tavilyApiKey;

    if (!tavilyApiKey) {
        console.error('Tavily API key is not configured');
        return null;
    }

    try {
        const urlsArray = Array.isArray(urls) ? urls : [urls];

        const response = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tavilyApiKey}`
            },
            body: JSON.stringify({
                urls: urlsArray,
                extraction_depth: options?.extraction_depth ?? 'advanced',
                include_images: options?.include_images ?? false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Tavily API error:', errorText);
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error calling Tavily API:', error);
        return null;
    }
}

/**
 * Formats Tavily search results to a markdown string for chat
 * @param results The search results
 * @returns Formatted markdown string
 */
export function formatTavilyResults(results: TavilySearchResponse): string {
    if (!results || !results.results || results.results.length === 0) {
        return '**No search results found**';
    }

    let markdown = `## Search Results for: "${results.query}"\n\n`;

    if (results.answer) {
        markdown += `### Answer\n${results.answer}\n\n`;
    }

    results.results.forEach((result, index) => {
        markdown += `### ${index + 1}. [${result.title}](${result.url})\n`;
        markdown += `${result.content}\n\n`;
    });

    if (results.images && results.images.length > 0) {
        markdown += `### Images\n`;
        results.images.forEach((image, index) => {
            markdown += `${index + 1}. ![Image](${image.url})${image.description ? ` - ${image.description}` : ''}\n`;
        });
        markdown += '\n';
    }

    markdown += `*Search performed: ${new Date(results.created_at).toLocaleString()} (took ${results.time}s)*\n`;

    return markdown;
}

/**
 * Formats Tavily extract results to a markdown string for chat
 * @param result The extract result
 * @returns Formatted markdown string
 */
export function formatTavilyExtractResult(result: TavilyExtractResponse): string {
    if (!result || !result.content || result.content.length === 0) {
        return '**No content extracted**';
    }

    let markdown = `## Extracted Content\n\n`;

    result.content.forEach((item, index) => {
        markdown += `### ${index + 1}. [${item.url}](${item.url})\n\n`;
        markdown += `${item.content.substring(0, 500)}...\n\n`;

        if (item.images && item.images.length > 0) {
            markdown += `#### Images\n`;
            item.images.forEach((imageUrl, imgIndex) => {
                markdown += `${imgIndex + 1}. ![Image](${imageUrl})\n`;
            });
            markdown += '\n';
        }
    });

    if (result.failed_urls && result.failed_urls.length > 0) {
        markdown += `### Failed URLs\n`;
        result.failed_urls.forEach((failedUrl, index) => {
            markdown += `${index + 1}. ${failedUrl.url} - Error: ${failedUrl.error}\n`;
        });
        markdown += '\n';
    }

    markdown += `*Extraction completed in ${result.time}s*\n`;

    return markdown;
}

export const tavilySearchTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'TavilySearch',
            description: '使用 Tavily API 获取互联网上的高质量搜索结果',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query'
                    },
                    search_depth: {
                        type: 'string',
                        enum: ['basic', 'advanced'],
                        description: 'Advanced search is tailored to retrieve the most relevant sources, basic search provides generic content snippets. A basic search costs 1 API Credit, while an advanced search costs 2 API Credits. Default basic',
                    },
                    include_answer: {
                        type: 'string',
                        description: 'Include an LLM-generated answer to the provided query. Default not included',
                        enum: ['basic', 'advanced'],
                    },
                    max_results: {
                        type: 'integer',
                        description: 'The maximum number of search results to return. Default 5.',
                    },
                    topic: {
                        type: 'string',
                        enum: ['general', 'news'],
                        description: '搜索主题类型，news 为适用于获取实时更新的事情，general 为更广泛、更通用的搜索，默认为 general'
                    },
                    days: {
                        type: 'integer',
                        description: 'Number of days back from the current date to include. Available ONLY IF topic is news. Default 7.',
                        minimum: 1,
                    },
                    time_range: {
                        type: 'string',
                        description: 'The time range back from the current date to filter results.',
                        enum: ['day', 'week', 'month', 'year'],
                    }
                },
                required: ['query']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: {
        query: string,
        search_depth?: 'basic' | 'advanced',
        include_answer?: boolean,
        max_results?: number,
        topic?: 'general' | 'news'
    }): Promise<ToolExecuteResult> => {
        let tavilyApiKey = globalMiscConfigs().tavilyApiKey;
        if (!tavilyApiKey) {
            return {
                status: ToolExecuteStatus.ERROR,
                data: "Tavily API key is not configured"
            }
        }

        const result = await tavilySearch(args.query, {
            search_depth: args.search_depth,
            include_answer: args.include_answer,
            max_results: args.max_results,
            topic: args.topic
        });

        if (result === null) {
            return {
                status: ToolExecuteStatus.ERROR,
                data: { error: "Tavily search failed. API key may be missing or invalid." }
            };
        }

        //单纯保存记录而已
        saveAndTruncate('tavily-search', JSON.stringify(result, null, 2), Number.POSITIVE_INFINITY, { name: 'TavilySearch', args });

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: result
        };
    }
};
