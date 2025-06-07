/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-30 20:11:55
 * @FilePath     : /src/func/gpt/tools/web/webpage.ts
 * @LastEditTime : 2025-06-04 11:59:34
 * @Description  : 
 */
import URLProvider from "../../context-provider/URLProvider";
import { Tool, ToolPermissionLevel, ToolExecuteResult, ToolExecuteStatus } from "../types";

export const webPageContentTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'WebPageContent',
            description: '尝试获取给定 URL 链接的网页内容，返回 Markdown 文本; url 和 urlList 只能选择其一',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '网页 URL'
                    },
                    urlList: {
                        type: 'array',
                        items: {
                            type: "string",
                        },
                        description: '网页 URL 列表, 这意味着将会尝试获取多个网页内容'
                    },
                    limit: {
                        type: 'integer',
                        description: '可选, 返回的网页内容字符数量的限制; 默认 5000; 如果小于等于 0, 则不限制; 注意是字符数量(string.length)'
                    }
                }
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: { url?: string, urlList?: string[], limit?: number }): Promise<ToolExecuteResult> => {
        let limit = args.limit ?? 5000;
        let urlText = '';
        if (args.url) {
            urlText = args.url;
        } else if (args.urlList && args.urlList.length > 0) {
            urlText = args.urlList.join('\n');
        }
        const result = await URLProvider.getContextItems({ query: urlText });
        if (result.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '存在错误, 未能获取到网页内容'
            }
        } else {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result.map(item => {
                    let content = item.content.trim();
                    let len = content.length;
                    if (limit > 0 && len > limit) {
                        content = content.substring(0, args.limit);
                        content += `\n\n原始内容过长 (${len} 字符), 已省略; 只保留前 ${limit} 字符`;
                    }
                    return content;
                }).join('\n\n')
            }
        }
    }
};