/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-23 21:14:51
 * @FilePath     : /src/func/gpt/context-provider/URLProvider.ts
 * @Description  : URL Content Provider
 */

import { showMessage } from "siyuan";
import { fetchWebContent, webUtils } from "../tools/web/webpage";

const { isValidUrl } = webUtils;

const URLProvider: CustomContextProvider = {
    type: "input-area",
    name: "URLProvider",
    icon: 'iconLink',
    displayTitle: "网页内容获取",
    description: "输入指定的网页 URL，解析其内容。",
    getContextItems: async (options: {
        query: string;
    }): Promise<ContextItem[]> => {
        const queryText = options.query.trim();
        // 处理多行文本，按行分割
        const lines = queryText.split('\n');
        const urls = lines
            .map(line => line.trim())
            .filter(line => isValidUrl(line));

        if (urls.length === 0) {
            showMessage("未找到有效的URL", 4000, "error");
            return [];
        }

        const results: ContextItem[] = [];

        // 处理每个URL
        for (const url of urls) {
            try {
                // 使用 fetchWebContent 获取网页内容
                const result = await fetchWebContent(url);

                // 格式化内容
                const parts = [`URL: ${url}`];
                if (result.title) parts.push(`标题: ${result.title}`);
                if (result.description) parts.push(`描述: ${result.description}`);
                parts.push(`\n${result.content}`);

                const content = parts.join('\n');

                results.push({
                    name: `URL内容: ${url.substring(0, 30)}${url.length > 30 ? '...' : ''}`,
                    description: `访问: ${url}; 结果类型为 ${result.contentType || '未知'}`,
                    content: content,
                });
            } catch (error) {
                showMessage(`获取URL内容失败 (${url}): ${error.message}`, 4000, "error");
                // 继续处理其他URL，不中断
            }
        }

        return results;
    },
};

export default URLProvider;
