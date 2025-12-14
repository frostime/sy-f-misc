/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-14
 * @FilePath     : /src/func/gpt/tools/web/extract-html.ts
 * @Description  : HTML 元素提取工具 - 使用 CSS 选择器提取特定 HTML 元素
 */
import { Tool, ToolPermissionLevel, ToolExecuteResult, ToolExecuteStatus } from "../types";
import { normalizeLimit, truncateContent } from '../utils';
import { WebToolError, WebToolErrorCode } from './types';
import { fetchWebContent, isValidUrl } from './webpage';

/**
 * HTML 元素提取结果
 */
interface ExtractHTMLResult {
    title: string;
    url: string;
    querySelector: string;
    elementsCount: number;
    elements: Array<{
        index: number;
        html: string;
        text: string;
    }>;
    originalLength: number;
    shownLength: number;
    isTruncated: boolean;
}

const EXTRACT_HTML_LIMIT = 5000;

/**
 * ExtractHTML 工具 - 提取网页中特定的 HTML 元素
 * 
 * 职责：
 * 1. 使用 CSS 选择器提取元素
 * 2. 返回原始 HTML 和纯文本
 * 3. 支持多个匹配元素
 */
export const extractHTMLTool: Tool = {
    DEFAULT_OUTPUT_LIMIT_CHAR: EXTRACT_HTML_LIMIT,

    declaredReturnType: {
        type: `{
    title: string;
    url: string;
    querySelector: string;
    elementsCount: number;
    elements: Array<{
        index: number;
        html: string;
        text: string;
    }>;
    originalLength: number;
    shownLength: number;
    isTruncated: boolean;
}`,
        note: '提取的 HTML 元素列表，每个元素包含原始 HTML 和纯文本内容'
    },

    definition: {
        type: 'function',
        function: {
            name: 'ExtractHTML',
            description: '使用 CSS 选择器从网页中提取特定的 HTML 元素。适用于精确提取网页中的特定部分，如文章内容、评论区、数据表格等。',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '网页 URL'
                    },
                    querySelector: {
                        type: 'string',
                        description: 'CSS 选择器，用于定位要提取的元素。例如："article", ".content", "#main-text", "table.data" 等。会执行 querySelectorAll 获取所有匹配元素。'
                    },
                    limit: {
                        type: 'integer',
                        description: `返回内容的字符数量限制，默认 ${EXTRACT_HTML_LIMIT}。如果小于等于 0 则不限制。`
                    }
                },
                required: ['url', 'querySelector']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: {
        url?: string,
        querySelector?: string,
        limit?: number
    }): Promise<ToolExecuteResult> => {
        const limit = normalizeLimit(args.limit, EXTRACT_HTML_LIMIT);

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

        if (!args.querySelector) {
            const error: WebToolError = {
                code: WebToolErrorCode.INVALID_URL,
                message: '必须提供 querySelector 参数'
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

            // 获取网页内容（Raw 模式）
            const content = await fetchWebContent(args.url, 'raw', {}, args.querySelector);

            // 解析 HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(content.content, 'text/html');
            const elements = doc.querySelectorAll('body > *');

            if (elements.length === 0) {
                const error: WebToolError = {
                    code: WebToolErrorCode.PARSE_FAILED,
                    message: `未找到匹配选择器 "${args.querySelector}" 的元素`,
                    url: args.url
                };
                return {
                    status: ToolExecuteStatus.ERROR,
                    data: error
                };
            }

            // 提取元素信息
            const extractedElements: ExtractHTMLResult['elements'] = [];
            let totalLength = 0;

            elements.forEach((element, index) => {
                const html = element.outerHTML;
                const text = element.textContent?.trim() || '';
                extractedElements.push({
                    index,
                    html,
                    text
                });
                totalLength += html.length + text.length;
            });

            // 如果需要截断，截断最后几个元素
            let shownLength = totalLength;
            let isTruncated = false;

            if (limit > 0 && totalLength > limit) {
                let currentLength = 0;
                const truncatedElements: typeof extractedElements = [];

                for (const elem of extractedElements) {
                    const elemLength = elem.html.length + elem.text.length;
                    if (currentLength + elemLength > limit) {
                        isTruncated = true;
                        break;
                    }
                    truncatedElements.push(elem);
                    currentLength += elemLength;
                }

                shownLength = currentLength;
                extractedElements.length = 0;
                extractedElements.push(...truncatedElements);
            }

            const result: ExtractHTMLResult = {
                title: content.title,
                url: content.url,
                querySelector: args.querySelector,
                elementsCount: elements.length,
                elements: extractedElements,
                originalLength: totalLength,
                shownLength,
                isTruncated
            };

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result
            };
        } catch (error) {
            console.error(`提取 HTML 失败: ${args.url}`, error);
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

    formatForLLM: (data: ExtractHTMLResult): string => {
        const parts: string[] = [];

        // 标题
        parts.push(`# HTML 元素提取: ${data.title}`);
        parts.push('');

        // 元信息
        parts.push('| 属性 | 值 |');
        parts.push('|------|-----|');
        parts.push(`| URL | ${data.url} |`);
        parts.push(`| 选择器 | \`${data.querySelector}\` |`);
        parts.push(`| 匹配元素数 | ${data.elementsCount} |`);

        if (data.isTruncated) {
            parts.push(`| 显示元素数 | ${data.elements.length} (已截断) |`);
        }

        parts.push('');
        parts.push('---');
        parts.push('');

        // 提取的元素
        data.elements.forEach((elem) => {
            parts.push(`## 元素 ${elem.index + 1}`);
            parts.push('');
            parts.push('### HTML');
            parts.push('```html');
            parts.push(elem.html);
            parts.push('```');
            parts.push('');
            parts.push('### 文本内容');
            parts.push(elem.text);
            parts.push('');
            parts.push('---');
            parts.push('');
        });

        // 截断提示
        if (data.isTruncated) {
            parts.push(`> ⚠️ **内容已截断** - 显示了前 ${data.elements.length} 个元素（共 ${data.elementsCount} 个）`);
        }

        return parts.join('\n');
    },

    /**
    * 已经在 formatedForLLM 中处理截断逻辑，因此这里直接返回 formatted 内容, 避免系统重复截断
    */
    truncateForLLM: (formatted: string, args: Record<string, any>): string => {
        // const limit = normalizeLimit(args.limit, EXTRACT_HTML_LIMIT);

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
