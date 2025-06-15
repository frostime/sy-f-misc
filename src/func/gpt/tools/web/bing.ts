import { getFrontend } from "siyuan";
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { forwardProxy } from "@/api";

/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-28 11:16:30
 * @FilePath     : /src/func/gpt/tools/web/bing.ts
 * @LastEditTime : 2025-06-15 19:54:12
 * @Description  : 
 */
function extractSearchResults(dom: Document): { title: string; link: string; description: string }[] {

    const ansItem = dom.querySelector('li.b_ans');

    // 获取所有的 li.b_algo 元素
    const algoListItems: NodeListOf<HTMLLIElement> = dom.querySelectorAll('li.b_algo');

    // 定义一个数组来存储搜索结果
    const searchResults: { title: string; link: string; description: string }[] = [];

    if (ansItem) {
        // 去掉 svg style 等元素
        ansItem.querySelectorAll('svg, style').forEach((el) => el.remove());
        searchResults.push({
            title: 'Bing 直接回答',
            link: '',
            description: ansItem.textContent?.trim() || ''
        })
    }

    // 遍历每个 li.b_algo 元素
    algoListItems.forEach((item) => {
        // 提取标题
        const titleElement = item.querySelector('h2 a');
        const title = titleElement ? titleElement.textContent?.trim() || '' : '';

        // 提取链接
        const link = titleElement ? titleElement.getAttribute('href') || '' : '';

        // 提取描述
        const descriptionElement = item.querySelector('p');
        const description = descriptionElement ? descriptionElement.textContent?.trim() || '' : '';

        // 将结果添加到数组中
        searchResults.push({ title, link, description });
    });

    return searchResults;
}

const isBrowser = getFrontend().startsWith('browser');

const fetchWeb = async (url: string) => {
    if (!isBrowser) {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });
        if (response.ok) {
            const text = await response.text();
            return {
                ok: true,
                content: text
            }
        }
    } else {
        const response = await forwardProxy(url, 'GET', null, [
            {
                'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
            }
        ], 7000, 'text/html');
        if (response && (response.status / 100) === 2) {
            const text = response.body;
            return {
                ok: true,
                content: text
            }
        }
    }

    return {
        ok: false,
        content: ''
    }
}

export async function bingSearch(query: string, pageIdx: number = 1): Promise<{ title: string; link: string; description: string }[]> {
    query = query.replace(/\s+/g, '+');
    const first = (pageIdx - 1) * 10 + 1;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${first}&FORM=PERE`;

    try {
        // 使用 forwardProxy 函数发送请求，避免跨域问题
        const result = await fetchWeb(url);

        if (!result.ok) {
            console.warn('Bing search failed');
            throw new Error(`Bing search failed`);
        }

        // 处理返回的 HTML 内容
        const html = result.content;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return extractSearchResults(doc);
    } catch (error) {
        throw error;
    }
}

export interface BingSearchReportInput {
    query: string;
    searchResults: { title: string; link: string; description: string }[];
}

/**
 * Formats Bing search results to a markdown string for chat
 * @param data The search query and results
 * @returns Formatted markdown string
 */
export function formatBingResultsToReport(data: BingSearchReportInput): string {
    const { query, searchResults } = data;
    if (!searchResults || searchResults.length === 0) {
        return `**No search results found for: "${query}"**`;
    }

    let markdown = `## Search Results for: "${query}"\n\n`;
    let regularResultsCount = 0;

    searchResults.forEach((result) => {
        if (result.title === 'Bing 直接回答' && !result.link) {
            markdown += `### Bing Answer\n`;
            markdown += `${result.description}\n\n---\n\n`;
        } else {
            regularResultsCount++;
            markdown += `### ${regularResultsCount}. ${result.link ? `[${result.title}](${result.link})` : result.title}\n`;
            markdown += `${result.description}\n\n`;
        }
    });

    if (regularResultsCount > 0) {
        markdown += `---\n`;
    }
    markdown += `*Search performed via Bing*\n`;

    return markdown;
}

export const bingSearchTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'BingSearch',
            description: '使用 Bing 获取互联网上的搜索结果',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '搜索语句; 支持逻辑语法; 复杂查询逻辑请使用 () 区分优先级'
                    },
                },
                required: ['query']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: { query: string }): Promise<ToolExecuteResult> => {
        try {
            const result = await bingSearch(args.query);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result
            };
        } catch (error) {
            console.error('Bing search error:', error);
            return {
                status: ToolExecuteStatus.ERROR,
                data: error
            };
        }
    }
};
