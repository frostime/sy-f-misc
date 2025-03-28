/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-15 22:46:00
 * @FilePath     : /src/func/gpt/context-provider/TavilySearchProvider.ts
 * @Description  : Tavily Web Search Provider
 */

import { showMessage } from "siyuan";
import { tavilySearch, tavilyExtract } from "../tools/tavily";
import { globalMiscConfigs } from "../setting/store";


const TavilySearchProvider: CustomContextProvider = {
    type: "input-line",
    name: "TavilySearchProvider",
    icon: 'iconWebSearch',
    displayTitle: "Tavily Search",
    description: "使用 Tavily API 进行网络搜索",
    getContextItems: async (options: {
        query: string;
        searchOptions?: Parameters<typeof tavilySearch>[1];
        enableExtract?: boolean;
        extractOptions?: Parameters<typeof tavilyExtract>[1];
    }): Promise<ContextItem[]> => {
        const query = options.query?.trim();
        if (!query) {
            showMessage("搜索关键词不能为空", 3000, "error");
            return [];
        }

        const tavilyApiKey = globalMiscConfigs.value.tavilyApiKey;
        if (!tavilyApiKey) {
            showMessage("请先在设置中配置 Tavily API Key", 5000, "error");
            return [];
        }

        try {
            // 执行搜索
            const searchResult = await tavilySearch(query, options.searchOptions);
            if (!searchResult) {
                showMessage("搜索失败，请检查网络连接或 API Key", 3000, "error");
                return [];
            }

            const { results } = searchResult;
            if (!results || results.length === 0) {
                showMessage(`未找到与"${query}"相关的搜索结果`, 3000, "info");
                return [];
            }

            // 将搜索结果转换为上下文项
            const contextItems: ContextItem[] = results.map((result, index) => {
                return {
                    name: `搜索结果 #${index + 1}: ${result.title}`,
                    description: `相关性 ${result.score} | 来源: ${result.url}`,
                    content: `${result.content}\n\n原始链接: ${result.url}`
                };
            });

            // 如果启用了 extract 功能，则对每个搜索结果进行内容提取
            if (options.enableExtract && results.length > 0) {
                // 收集所有需要提取的 URL
                const urlsToExtract = results.map(result => result.url);

                try {
                    // 批量提取内容
                    const extractResult = await tavilyExtract(urlsToExtract, options.extractOptions);

                    if (extractResult && extractResult.content && extractResult.content.length > 0) {
                        // 创建 URL 到提取内容的映射
                        const urlToContentMap = new Map<string, string>();
                        extractResult.content.forEach(item => {
                            urlToContentMap.set(item.url, item.content);
                        });

                        // 更新上下文项，添加提取的完整内容
                        contextItems.forEach(item => {
                            const itemUrl = item.content.split("\n\n原始链接: ")[1];
                            if (itemUrl && urlToContentMap.has(itemUrl)) {
                                const extractedContent = urlToContentMap.get(itemUrl);
                                item.content = `${item.content}\n\n## 完整内容:\n${extractedContent}`;
                                item.description = `${item.description} [已提取完整内容]`;
                            }
                        });
                    }

                    // 如果有提取失败的 URL，记录到日志
                    if (extractResult?.failed_urls && extractResult.failed_urls.length > 0) {
                        console.warn('Some URLs failed to extract:', extractResult.failed_urls);
                    }
                } catch (extractError) {
                    console.error('Error during content extraction:', extractError);
                    // 提取失败不影响搜索结果的返回
                }
            }

            return contextItems;
        } catch (error) {
            console.error("Tavily search error:", error);
            showMessage(`搜索出错: ${error.message || '未知错误'}`, 3000, "error");
            return [];
        }
    }
};

export default TavilySearchProvider;
