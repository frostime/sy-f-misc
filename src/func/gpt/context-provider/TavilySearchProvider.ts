/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-15 22:46:00
 * @FilePath     : /src/func/gpt/context-provider/TavilySearchProvider.ts
 * @Description  : Tavily Web Search Provider
 */

import { showMessage } from "siyuan";
import { tavilySearch } from "../tools/tavily";
import { globalMiscConfigs } from "../setting/store";

const TavilySearchProvider: CustomContextProvider = {
    type: "input-line",
    name: "TavilySearchProvider",
    icon: 'iconWebSearch',
    displayTitle: "Tavily Search",
    description: "使用 Tavily API 进行网络搜索",
    getContextItems: async (options: {
        query: string;
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
            const searchResult = await tavilySearch(query);
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
            return results.map((result, index) => {
                return {
                    name: `搜索结果 #${index + 1}: ${result.title}`,
                    description: `来源: ${result.url}`,
                    content: `${result.content}\n\n原始链接: ${result.url}`
                };
            });
        } catch (error) {
            console.error("Tavily search error:", error);
            showMessage(`搜索出错: ${error.message || '未知错误'}`, 3000, "error");
            return [];
        }
    }
};

export default TavilySearchProvider;
