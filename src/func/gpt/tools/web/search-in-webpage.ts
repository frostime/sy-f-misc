/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-14
 * @FilePath     : /src/func/gpt/tools/web/search-in-webpage.ts
 * @Description  : 网页内关键词搜索工具 - 在网页中搜索关键词并返回匹配内容
 */
import { Tool, ToolExecuteResult, ToolExecuteStatus } from "../types";
import { normalizeLimit, truncateContent } from '../utils';
import { WebToolError, WebToolErrorCode, WebPageContentResult } from './types';
import { fetchWebContentAsMarkdown, isValidUrl } from './webpage';

/**
 * 关键词搜索选项
 */
interface KeywordSearchOptions {
    findKeywords: string[];
    joinKeywords: 'AND' | 'OR';
}

/**
 * 关键词匹配结果
 */
interface KeywordMatch {
    index: number;
    content: string;
    matchedKeywords: string[];
    startPosition?: number;
    endPosition?: number;
}

/**
 * 关键词搜索结果
 */
interface KeywordSearchResult {
    keywords: string[];
    joinType: 'AND' | 'OR';
    matchCount: number;
    totalCount: number;
    matches: KeywordMatch[];
}

/**
 * 检查文本中是否包含关键词
 */
function checkKeywordMatch(text: string, keywords: string[], joinType: 'AND' | 'OR'): { matched: boolean; matchedKeywords: string[] } {
    const lowerText = text.toLowerCase();
    const matchedKeywords: string[] = [];

    for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        if (lowerText.includes(lowerKeyword)) {
            matchedKeywords.push(keyword);
        }
    }

    const matched = joinType === 'AND'
        ? matchedKeywords.length === keywords.length
        : matchedKeywords.length > 0;

    return { matched, matchedKeywords };
}

/**
 * 在 Markdown 内容中查找关键词
 */
function searchKeywordsInMarkdown(content: string, options: KeywordSearchOptions): KeywordSearchResult {
    // 按双换行符分割段落
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const matches: KeywordMatch[] = [];

    // 计算每个段落在原始文本中的位置
    const paragraphPositions: { start: number; end: number }[] = [];
    let currentPos = 0;

    for (const paragraph of paragraphs) {
        const startPos = content.indexOf(paragraph, currentPos);
        const endPos = startPos + paragraph.length;
        paragraphPositions.push({ start: startPos, end: endPos });
        currentPos = endPos;
    }

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        const { matched, matchedKeywords } = checkKeywordMatch(paragraph, options.findKeywords, options.joinKeywords);

        if (matched) {
            // 获取上下文（前一段 + 当前段 + 后一段）
            const contextParts: string[] = [];

            // 前一段
            if (i > 0) {
                contextParts.push(paragraphs[i - 1]);
            }

            // 当前段
            contextParts.push(paragraph);

            // 后一段
            if (i < paragraphs.length - 1) {
                contextParts.push(paragraphs[i + 1]);
            }

            matches.push({
                index: i,
                content: contextParts.join('\n\n'),
                matchedKeywords,
                startPosition: paragraphPositions[i].start,
                endPosition: paragraphPositions[i].end
            });
        }
    }

    return {
        keywords: options.findKeywords,
        joinType: options.joinKeywords,
        matchCount: matches.length,
        totalCount: paragraphs.length,
        matches
    };
}

const SEARCH_LIMIT = 6000;

/**
 * SearchInWebPage 工具 - 在网页中搜索关键词
 *
 * 职责：
 * 1. 在网页内容中搜索关键词
 * 2. 返回匹配的段落及其上下文
 * 3. 提供段落位置信息（可用于后续精确获取）
 */
export const searchInWebPageTool: Tool = {
    DEFAULT_OUTPUT_LIMIT_CHAR: SEARCH_LIMIT,

    declaredReturnType: {
        type: `{
    title: string;
    url: string;
    keywordSearch: {
        keywords: string[];
        joinType: 'AND' | 'OR';
        matchCount: number;
        totalCount: number;
        matches: Array<{
            index: number;
            content: string;
            matchedKeywords: string[];
            startPosition?: number;
            endPosition?: number;
        }>;
    };
}`,
        note: '关键词搜索结果，包含匹配的段落和位置信息。可使用 startPosition/endPosition 配合 FetchWebPage 的 begin/limit 参数精确获取内容。'
    },

    definition: {
        type: 'function',
        function: {
            name: 'SearchInWebPage',
            description: '在网页内容中搜索关键词，返回包含关键词的段落及其上下文。适用于从长网页中快速定位特定内容，避免获取整个网页。搜索结果包含段落的位置信息，可用于后续精确获取。',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '网页 URL'
                    },
                    keywords: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: '要搜索的关键词数组，例如：["机器学习", "深度学习"]'
                    },
                    joinType: {
                        type: 'string',
                        enum: ['AND', 'OR'],
                        description: '关键词连接方式：AND（所有关键词都必须匹配）或 OR（任意一个关键词匹配即可），默认 OR'
                    }
                },
                required: ['url', 'keywords']
            }
        }
    },

    permission: {
        executionPolicy: 'ask-once',
        resultApprovalPolicy: 'never'
    },

    execute: async (args: {
        url?: string,
        keywords?: string[],
        joinType?: 'AND' | 'OR'
    }): Promise<ToolExecuteResult> => {
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

        if (!args.keywords || args.keywords.length === 0) {
            const error: WebToolError = {
                code: WebToolErrorCode.INVALID_URL,
                message: '必须提供 keywords 参数'
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
            const content = await fetchWebContentAsMarkdown(args.url, {
                keepLink: false,
                keepImg: false
            });

            // 执行关键词搜索
            const keywordOptions: KeywordSearchOptions = {
                findKeywords: args.keywords,
                joinKeywords: args.joinType || 'OR'
            };

            const searchResult = searchKeywordsInMarkdown(content.content, keywordOptions);

            // 构建结果
            const result: WebPageContentResult = {
                title: content.title,
                description: content.description,
                keywords: content.keywords || '',
                author: content.author || '',
                content: '',  // 搜索模式下不返回完整内容
                url: content.url,
                contentType: content.contentType,
                mode: 'markdown',
                originalLength: content.content.length,
                shownLength: 0,
                isTruncated: false,
                keywordSearch: searchResult
            };

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result
            };
        } catch (error) {
            console.error(`搜索网页失败: ${args.url}`, error);
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

        // 标题
        parts.push(`# 🔍 关键词搜索: ${data.title}`);
        parts.push('');

        // URL
        parts.push(`**URL**: ${data.url}`);
        parts.push('');

        if (!data.keywordSearch) {
            return parts.join('\n') + '\n*未找到关键词搜索结果*';
        }

        const ks = data.keywordSearch;

        // 搜索统计
        parts.push('## 搜索统计');
        parts.push('');
        parts.push(`- **搜索关键词**: [${ks.keywords.join(', ')}]`);
        parts.push(`- **连接方式**: ${ks.joinType}`);
        parts.push(`- **匹配段落数**: ${ks.matchCount} / ${ks.totalCount}`);
        parts.push('');

        if (ks.matches.length === 0) {
            parts.push('---');
            parts.push('');
            parts.push('*❌ 未找到匹配的内容*');
            return parts.join('\n');
        }

        parts.push('---');
        parts.push('');
        parts.push('## 匹配结果');
        parts.push('');

        ks.matches.forEach((match, index) => {
            parts.push(`### 匹配 ${index + 1} - 段落 ${match.index + 1}`);
            parts.push('');
            parts.push(`**匹配关键词**: ${match.matchedKeywords.join(', ')}`);

            if (match.startPosition !== undefined && match.endPosition !== undefined) {
                parts.push(`**字符位置**: ${match.startPosition} - ${match.endPosition}`);
                parts.push(`> 💡 使用 FetchWebPage 工具配合 begin=${match.startPosition}, limit=${match.endPosition - match.startPosition} 可精确获取此段落`);
            }

            parts.push('');
            parts.push('**内容** (包含上下文):');
            parts.push('');
            parts.push(match.content);
            parts.push('');
            parts.push('---');
            parts.push('');
        });

        return parts.join('\n');
    },

    /**
    * 已经在 formatedForLLM 中处理截断逻辑，因此这里直接返回 formatted 内容, 避免系统重复截断
    */
    truncateForLLM: (formatted: string, args: Record<string, any>): string => {
        // const limit = normalizeLimit(args.limit, SEARCH_LIMIT);

        // if (limit > 0 && formatted.length > limit) {
        //     const truncResult = truncateContent(formatted, limit);
        //     let result = truncResult.content;
        //     if (truncResult.isTruncated) {
        //         result += `\n\n[搜索结果过长，已截断为 ${limit} 字符]`;
        //     }
        //     return result;
        // }

        return formatted;
    }
};
