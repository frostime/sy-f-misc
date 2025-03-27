/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-15
 * @FilePath     : /src/func/gpt/tools/tavily.ts
 * @Description  : Tavily search API integration
 */
import { globalMiscConfigs } from '../setting/store';

export interface TavilySearchResponse {
    query: string;
    results: {
        url: string;
        title: string;
        content: string;
        score: number;
    }[];
    search_id: string;
    created_at: string;
}

/**
 * Performs a web search using the Tavily API
 * @param query The search query
 * @returns The search results or null if the search failed
 */
export async function tavilySearch(query: string, options?: {
    searchDepth?: 'basic' | 'advanced';
    includeDomains?: string[];
    excludeDomains?: string[];
    includeAnswer?: boolean;
    maxResults?: number;
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
                search_depth: options?.searchDepth ?? 'advanced',
                include_domains: options?.includeDomains ?? [],
                exclude_domains: options?.excludeDomains ?? [],
                include_answer: options?.includeAnswer ?? false,
                max_results: options?.maxResults ?? 5
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

    results.results.forEach((result, index) => {
        markdown += `### ${index + 1}. [${result.title}](${result.url})\n`;
        markdown += `${result.content.substring(0, 200)}...\n\n`;
    });

    markdown += `*Search performed: ${new Date(results.created_at).toLocaleString()}*\n`;

    return markdown;
}
