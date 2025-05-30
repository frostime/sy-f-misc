import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-28 11:16:30
 * @FilePath     : /src/func/gpt/tools/web/bing.ts
 * @LastEditTime : 2025-05-30 20:01:38
 * @Description  : 
 */
function extractSearchResults(dom: Document): { title: string; link: string; description: string }[] {
    // 获取所有的 li.b_algo 元素
    const algoListItems: NodeListOf<HTMLLIElement> = dom.querySelectorAll('li.b_algo');

    // 定义一个数组来存储搜索结果
    const searchResults: { title: string; link: string; description: string }[] = [];

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

export async function bingSearch(query: string, pageIdx: number = 1): Promise<{ title: string; link: string; description: string }[]> {
    const first = (pageIdx - 1) * 10 + 1;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${first}&FORM=PERE`;
    try {
        const response = await fetch(url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return extractSearchResults(doc);
    } catch (error) {
        console.error('Bing search error:', error);
        return [];
    }
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
                        description: '搜索语句'
                    },
                },
                required: ['query']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: { query: string }): Promise<ToolExecuteResult> => {
        const result = await bingSearch(args.query);
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: JSON.stringify(result)
        };
    }
};
