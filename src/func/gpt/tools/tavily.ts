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
        markdown += `${result.content.substring(0, 200)}...\n\n`;
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
