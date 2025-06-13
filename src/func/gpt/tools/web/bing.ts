import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { forwardProxy } from "@/api";

/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-28 11:16:30
 * @FilePath     : /src/func/gpt/tools/web/bing.ts
 * @LastEditTime : 2025-06-12 20:05:23
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

export async function bingSearch(query: string, pageIdx: number = 1): Promise<{ title: string; link: string; description: string }[]> {
    const first = (pageIdx - 1) * 10 + 1;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${first}&FORM=PERE`;

    try {
        // 使用 forwardProxy 函数发送请求，避免跨域问题
        const response = await forwardProxy(
            url,
            'GET',
            null,
            [{ 'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36" }],
            7000,
            'text/html'
        );

        if (!response || (response.status / 100) !== 2) {
            console.error('Bing search failed with status:', response?.status);
            throw new Error(`Bing search failed with status: ${response?.status}`);
        }

        // 处理返回的 HTML 内容
        const html = response.body;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return extractSearchResults(doc);
    } catch (error) {
        console.error('Error using forwardProxy for Bing search:', error);
        throw error;
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
