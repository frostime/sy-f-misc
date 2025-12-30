/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-14
 * @FilePath     : /src/func/gpt/tools/web/fetch-webpage.ts
 * @Description  : 基础网页获取工具 - 获取网页并转换为 Markdown
 */
import { Tool, ToolPermissionLevel, ToolExecuteResult, ToolExecuteStatus } from "../types";
import { normalizeLimit, truncateContent } from '../utils';
import { WebToolError, WebToolErrorCode, WebPageContentResult } from './types';
import { fetchWebContentAsMarkdown, isValidUrl } from './webpage';

const WEB_PAGE_LIMIT = 7000;

/**
 * FetchWebPage 工具 - 获取网页内容并转换为 Markdown
 *
 * 职责：
 * 1. 获取网页内容
 * 2. 转换为 Markdown 格式
 * 3. 支持内容截断（begin/limit）
 * 4. 支持链接和图片过滤
 */
export const fetchWebPageTool: Tool = {
    DEFAULT_OUTPUT_LIMIT_CHAR: WEB_PAGE_LIMIT,

    declaredReturnType: {
        type: `{
    title: string;
    description: string;
    keywords: string;
    author: string;
    content: string;
    url: string;
    contentType: string | null;
    originalLength: number;
    shownLength: number;
    isTruncated: boolean;
}`,
        note: '网页内容（Markdown 格式），包含元信息和主要内容。支持内容截断。'
    },

    definition: {
        type: 'function',
        function: {
            name: 'FetchWebPage',
            description: '获取网页内容并转换为 Markdown 格式。这是获取网页的基础工具，适用于阅读和理解网页内容。',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '网页 URL'
                    },
                    begin: {
                        type: 'integer',
                        description: '开始的字符位置，默认为 0。用于分页获取长网页内容。'
                    },
                    limit: {
                        type: 'integer',
                        description: `返回的网页内容字符数量限制，默认 ${WEB_PAGE_LIMIT}。如果小于等于 0 则不限制。`
                    },
                    keepLink: {
                        type: 'boolean',
                        description: '是否保留链接的完整URL，默认false（只保留锚文本，节省空间）。如果需要获取页面中的链接地址，设置为true。'
                    },
                    keepImg: {
                        type: 'boolean',
                        description: '是否保留图片链接，默认false（移除所有图片，节省空间）。'
                    }
                },
                required: ['url']
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: {
        url?: string,
        begin?: number,
        limit?: number,
        keepLink?: boolean,
        keepImg?: boolean
    }): Promise<ToolExecuteResult> => {
        const begin = args.begin ?? 0;
        const limit = normalizeLimit(args.limit, WEB_PAGE_LIMIT);
        const options = {
            keepLink: args.keepLink,
            keepImg: args.keepImg
        };

        if (!args.url) {
            const error: WebToolError = {
                code: WebToolErrorCode.INVALID_URL,
                message: '必须提供 url 参数'
            };
            return {
                status: ToolExecuteStatus.ERROR,
                data: error
            };
        }

        try {
            if (!isValidUrl(args.url)) {
                const error: WebToolError = {
                    code: WebToolErrorCode.INVALID_URL,
                    message: '无效的 URL 格式',
                    url: args.url
                };
                return {
                    status: ToolExecuteStatus.ERROR,
                    data: error
                };
            }

            // 获取网页内容（Markdown 模式）
            const content = await fetchWebContentAsMarkdown(args.url, options);
            let resultContent = content.content;
            const originalLength = resultContent.length;

            // 应用起始位置和长度限制
            if (begin > 0) {
                const startPos = Math.min(begin, originalLength);
                resultContent = resultContent.substring(startPos);
            }

            // 应用截断
            const truncResult = truncateContent(resultContent, limit);

            // 构建结构化结果
            const result: WebPageContentResult = {
                title: content.title,
                description: content.description,
                keywords: content.keywords || '',
                author: content.author || '',
                content: truncResult.content,
                url: content.url,
                contentType: content.contentType,
                mode: 'markdown',
                originalLength: originalLength,
                shownLength: truncResult.shownLength,
                isTruncated: truncResult.isTruncated
            };

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result
            };
        } catch (error) {
            console.error(`获取网页失败: ${args.url}`, error);
            const webError: WebToolError = {
                code: error.message.includes('二进制') ? WebToolErrorCode.BINARY_CONTENT :
                    error.message.includes('超时') ? WebToolErrorCode.TIMEOUT :
                        error.message.includes('获取') ? WebToolErrorCode.FETCH_FAILED :
                            WebToolErrorCode.PARSE_FAILED,
                message: error.message,
                url: args.url,
                details: error
            };
            return {
                status: ToolExecuteStatus.ERROR,
                data: webError
            };
        }
    },

    formatForLLM: (data: WebPageContentResult): string => {
        const parts: string[] = [];

        // 标题和元信息
        parts.push(`# ${data.title}`);
        parts.push('');

        // 元信息表格
        const metadata: string[] = [];
        metadata.push('| 属性 | 值 |');
        metadata.push('|------|-----|');
        metadata.push(`| URL | ${data.url} |`);
        if (data.description) metadata.push(`| 描述 | ${data.description} |`);
        if (data.keywords) metadata.push(`| 关键词 | ${data.keywords} |`);
        if (data.author) metadata.push(`| 作者 | ${data.author} |`);
        if (data.contentType) metadata.push(`| 内容类型 | ${data.contentType} |`);

        // 内容统计
        if (data.isTruncated) {
            metadata.push(`| 内容长度 | ${data.shownLength} / ${data.originalLength} 字符 (已截断) |`);
        } else {
            metadata.push(`| 内容长度 | ${data.originalLength} 字符 |`);
        }

        parts.push(...metadata);
        parts.push('');
        parts.push('---');
        parts.push('');

        // 主要内容
        parts.push('## 📄 内容');
        parts.push('');
        parts.push(data.content);

        // 截断提示
        if (data.isTruncated) {
            parts.push('');
            parts.push('---');
            parts.push('');
            parts.push(`> ⚠️ **内容已截断** - 显示了前 ${data.shownLength} 个字符（共 ${data.originalLength} 字符）`);
            parts.push(`> 💡 如需查看更多内容，可使用 begin=${data.shownLength} 参数获取后续内容`);
        }

        return parts.join('\n');
    },

    /**
     * 已经在 formatedForLLM 中处理截断逻辑，因此这里直接返回 formatted 内容, 避免系统重复截断
     */
    truncateForLLM: (formatted: string, args: Record<string, any>): string => {
        // const limit = normalizeLimit(args.limit, WEB_PAGE_LIMIT);

        // if (limit > 0 && formatted.length > limit) {
        //     const truncResult = truncateContent(formatted, limit);
        //     let result = truncResult.content;
        //     if (truncResult.isTruncated) {
        //         result += `\n\n[格式化后的内容过长，已截断为 ${limit} 字符]`;
        //     }
        //     return result;
        // }

        return formatted;
    }
};
