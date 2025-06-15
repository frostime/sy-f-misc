/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-15
 * @FilePath     : /src/func/gpt/tools/web/bocha.ts
 * @Description  : Tavily search API integration
 */
import { globalMiscConfigs } from '../../setting/store';
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from '../types';


/**
 * Performs a web search using the Tavily API
 * @param query The search query
 * @returns The search results or null if the search failed
 */
export async function webSearch(query: string, options?: {
    freshness?: 'onDay' | 'onWeek' | 'onMonth' | 'onYear' | 'noLimit' | string;
    summary?: boolean;
    count?: number
}) {
    const bochaApiKey = globalMiscConfigs().bochaApiKey;

    if (!bochaApiKey) {
        console.error('Bocha API key is not configured');
        return null;
    }

    try {
        const response = await fetch('https://api.bochaai.com/v1/web-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bochaApiKey}`
            },
            body: JSON.stringify({
                query,
                ...options
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Bocha API error:', errorText);
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error calling Bocha API:', error);
        return null;
    }
}


export const bochaSearchTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'BochaSearch',
            description: '使用 Bocha API 获取互联网上的高质量搜索结果',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query' },
                    freshness: {
                        type: 'string',
                        enum: ['onDay', 'onWeek', 'onMonth', 'onYear', 'noLimit', 'YYYY-MM-DD..YYYY-MM-DD', 'YYYY-MM-DD'],
                        description: '搜索指定时间范围内的网页 (或按照 YYYY-MM-DD 的模板指定时间范围), 如果不需要特别指定推荐使用“noLimit”。搜索算法会自动进行时间范围的改写，效果更佳。',
                    },
                    summary: {
                        type: 'boolean',
                        description: '是否返回搜索结果的摘要，默认为 true',
                    },
                    count: {
                        type: 'integer',
                        description: '返回的搜索结果数量，默认为 10',
                        minimum: 1,
                        maximum: 50
                    }
                },
                required: ['query']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: {
        query: string,
        [key: string]: any
    }): Promise<ToolExecuteResult> => {
        let bochaApiKey = globalMiscConfigs().bochaApiKey;
        if (!bochaApiKey) {
            return {
                status: ToolExecuteStatus.ERROR,
                data: "Bocha API key is not configured"
            }
        }

        const result = await webSearch(args.query, {
            freshness: args.freshness,
            summary: args.summary ?? true,
            count: args.count ?? 10
        });

        if (result === null || !result['data']) {
            return {
                status: ToolExecuteStatus.ERROR,
                data: { error: "Search failed." }
            };
        }

        if (result['data']?.['images']) {
            delete result['data']['images'];
        }

        const data = {
            code: result['code'],
            queryContext: result['data']['queryContext'],
            webPages: result['data']['webPages']['value'].map((webPage: any) => {
                return {
                    datePublished: webPage['datePublished'],
                    name: webPage['name'],
                    url: webPage['url'],
                    abstract: webPage['summary'] ?? webPage['snippet'],
                    siteName: webPage['siteName']
                }
            })
        }

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: data
        };
    }
};
