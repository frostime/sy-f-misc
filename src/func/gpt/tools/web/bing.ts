import { getFrontend } from "siyuan";
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { forwardProxy } from "@/api";

/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-28 11:16:30
 * @FilePath     : /src/func/gpt/tools/web/bing.ts
 * @LastEditTime : 2025-08-03 22:58:12
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

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    // 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    // 'Cookie': 'SRCHHPGUSR=SRCHLANG=zh-Hans; _EDGE_S=ui=zh-cn; _EDGE_V=1'
};

const fetchWeb = async (url: string) => {
    if (!isBrowser) {
        const response = await fetch(url, {
            headers
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
            headers
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

export async function bingSearch(query: string, pageIdx: number = 1, site?: string, filetype?: string, dateFilter?: 'day' | 'week' | 'month'): Promise<{ title: string; link: string; description: string }[]> {
    // 构建查询字符串
    let searchQuery = query.trim();

    searchQuery = searchQuery.replace(/\s+/g, '+');

    const encodedQuery = encodeURIComponent(searchQuery);

    // 注意这些过滤语法中分割空格不能被替换成 +,不然会无法正常生效而被视为关键词 !IMPORTANT!
    let filter = ''
    // 添加 site 过滤
    if (site) {
        const cleanSite = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
        filter += `+site%3A${cleanSite}`;
    }

    // 添加 filetype 过滤
    if (filetype) {
        const cleanFiletype = filetype.replace(/^\./g, ''); // 移除开头的点
        filter += `+filetype%3A${cleanFiletype}`;
    }

    const first = (pageIdx - 1) * 10 + 1;
    let url = `https://www.bing.com/search?q=${encodedQuery}${filter}&first=${first}&FORM=PERE`;

    // 添加日期过滤
    if (dateFilter) {
        const dateFilterMap = {
            'day': 'ex1%3a%22ez1%22',     // 过24小时
            'week': 'ex1%3a%22ez2%22',    // 过一周
            'month': 'ex1%3a%22ez3%22'    // 过一个月
        };
        url += `&filters=${dateFilterMap[dateFilter]}`;
    }

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
            description: '使用 Bing 获取互联网上的搜索结果\n返回 `{title, link, description}[]`',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '搜索关键词; 多关键词搜索请用+组合; 不支持 site: 等高级过滤语法'
                    },
                    site: {
                        type: 'string',
                        description: '可选: 等效于 bing 的 site:选项; 请填写domain如 "github.com" 或 "stackoverflow.com"'
                    },
                    filetype: {
                        type: 'string',
                        description: '可选: 等效于 bing 的 filetype:选项; 请填写文件类型如 "pdf", "doc", "ppt", "xls" 等'
                    },
                    dateFilter: {
                        type: 'string',
                        enum: ['day', 'week', 'month'],
                        description: '可选: 日期过滤，限制搜索结果的时间范围 - day:过去24小时, week:过去一周, month:过去一个月'
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

    execute: async (args: { query: string; site?: string; filetype?: string; dateFilter?: 'day' | 'week' | 'month'; pageIdx?: number }): Promise<ToolExecuteResult> => {
        try {
            const result = await bingSearch(args.query, args.pageIdx || 1, args.site, args.filetype, args.dateFilter);
            // 直接返回原始结果
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
