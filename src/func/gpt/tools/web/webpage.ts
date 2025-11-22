/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-30 20:11:55
 * @FilePath     : /src/func/gpt/tools/web/webpage.ts
 * @LastEditTime : 2025-08-03 21:28:32
 * @Description  : 网页内容获取工具
 */
import { addScript } from "../../utils";
import { Tool, ToolPermissionLevel, ToolExecuteResult, ToolExecuteStatus } from "../types";
import { normalizeLimit, saveAndTruncate, truncateContent } from '../utils';

/**
 * 验证URL是否有效
 */
export const isValidUrl = (url: string): boolean => {
    // 空字符串或空白字符串
    if (!url.trim()) {
        return false;
    }

    // 相对路径（以 / 开头）
    if (url.startsWith('/')) {
        return true;
    }

    // 以 assets/ public/ 为开头
    if (url.startsWith('assets/') || url.startsWith('public/')) {
        return true;
    }

    // 协议相对路径（以 // 开头）
    if (url.startsWith('//')) {
        return true;
    }

    // 绝对路径（包含协议）
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

/**
 * 解析后的HTML内容
 */
interface ParsedHtmlContent {
    title: string;
    description: string;
    keywords: string;
    author: string;
    mainContent: string;
}

/**
 * 将HTML文本转换为Document对象
 */
export const html2Document = (text: string, url?: string): Document => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    if (!url) {
        return doc;
    }

    // 处理特殊的URL
    const domain = new URL(url).hostname;
    const path = new URL(url).pathname;

    // 应用特殊删除规则
    const DOMAIN_SPECIFIC_REMOVE = {
        'sina\\.com\\.cn/.+shtml': ['#sina-header', '.article-content-right', '.page-tools'],
        'ld246\\.com/article/': [
            '.wrapper>.side', '.content>.module:not(#comments)',
            '#comments>.module-header,.fn__flex-inline', '.welcome', '.article-tail'
        ],
        'kexue\\.fm/': ['#Header', '#MainMenu', '#MainMenuiPad', '#SideBar', '#Footer']
    } as { [url: string]: string[] };

    const REGEX = Object.fromEntries(
        Object.entries(DOMAIN_SPECIFIC_REMOVE)
            .map(([key]) => [key, new RegExp(key)])
    );

    for (const [pattern, selectors] of Object.entries(DOMAIN_SPECIFIC_REMOVE)) {
        const reg = REGEX[pattern];
        const ans = reg.test(`${domain}${path}`);
        if (ans) {
            for (const selector of selectors) {
                const elements = doc.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            }
        }
    }
    return doc;
};

/**
 * 获取网页内容的选项
 */
interface FetchWebContentOptions {
    /**
     * 是否保留链接
     */
    keepLink?: boolean;
    /**
     * 是否保留图片
     */
    keepImg?: boolean;
}

/**
 * 关键词查找选项
 */
interface KeywordSearchOptions {
    /**
     * 要查找的关键词数组
     */
    findKeywords: string[];
    /**
     * 关键词连接方式
     */
    joinKeywords: 'AND' | 'OR';
}

/**
 * 关键词匹配结果
 */
interface KeywordMatch {
    /**
     * 匹配的段落/元素索引
     */
    index: number;
    /**
     * 匹配的内容
     */
    content: string;
    /**
     * 匹配的关键词
     */
    matchedKeywords: string[];
    /**
     * 匹配段落在原始文本中的开始位置（仅markdown模式）
     */
    startPosition?: number;
    /**
     * 匹配段落在原始文本中的结束位置（仅markdown模式）
     */
    endPosition?: number;
}

/**
 * 关键词查找统计结果
 */
interface KeywordSearchResult {
    /**
     * 查找的关键词
     */
    keywords: string[];
    /**
     * 连接方式
     */
    joinType: 'AND' | 'OR';
    /**
     * 匹配的数量
     */
    matchCount: number;
    /**
     * 总数量
     */
    totalCount: number;
    /**
     * 匹配的内容块
     */
    matches: KeywordMatch[];
}

/**
 * 解析HTML内容
 */
export const parseHtmlContent = (doc: Document, options?: FetchWebContentOptions): ParsedHtmlContent => {
    const result: ParsedHtmlContent = {
        title: '',
        description: '',
        keywords: '',
        author: '',
        mainContent: ''
    };

    // 解析 head 信息
    const head = doc.head;
    if (head) {
        // 获取标题
        result.title = head.querySelector('title')?.textContent?.trim() || '';

        // 获取 meta 信息
        const metas = head.getElementsByTagName('meta');
        for (const meta of Array.from(metas)) {
            const name = meta.getAttribute('name')?.toLowerCase();
            const content = meta.getAttribute('content');
            if (!content) continue;

            switch (name) {
                case 'description':
                    result.description = content;
                    break;
                case 'keywords':
                    result.keywords = content;
                    break;
                case 'author':
                    result.author = content;
                    break;
            }
        }
    }

    // 解析 body 内容
    const body = doc.body;
    if (body) {
        // 移除不需要的元素
        const removeSelectors = [
            'script', 'style', 'iframe', 'noscript', 'svg',
            'header:not(article header)', 'footer:not(article footer)', 'nav',
            '.ad', '.ads', '.advertisement',
            'aside:not(article aside)',
            '.popup, .modal, .cookie, .banner',
            'button, input, select, textarea'
        ];

        // 创建body的克隆以避免修改原始DOM
        const bodyClone = body.cloneNode(true) as HTMLElement;

        // 移除不需要的元素
        removeSelectors.forEach(selector => {
            try {
                const elements = bodyClone.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            } catch (e) {
                // 忽略选择器语法错误
            }
        });

        //@ts-ignore
        let turndownService = globalThis.TurndownService?.({ // 确保 TurndownService 已加载
            headingStyle: 'atx',
            hr: '---',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            linkStyle: 'inlined',
            blankReplacement: (_, node) => {
                // 保留换行符
                return node.isBlock ? '\n\n' : '';
            }
        }) as {
            turndown(dom: HTMLElement): string,
            keep(input: string | string[]): void,
            addRule(name: string, rule: any): void
        };

        if (turndownService && turndownService.turndown) {
            turndownService.keep(['del', 'ins']);

            // 添加条件规则
            if (options?.keepImg !== true) {
                // 移除图片规则
                turndownService.addRule('removeImages', {
                    filter: ['img'],
                    replacement: function (_: string, node: Element) {
                        // 图片看看有无 alt
                        const alt = node.getAttribute('alt');
                        if (alt) {
                            return `(${alt} 图片略)`;
                        }
                        return '(图片略)';
                    }
                });
            }

            if (options?.keepLink !== true) {
                // 移除链接URL，只保留文本
                turndownService.addRule('removeLinkUrls', {
                    filter: ['a'],
                    replacement: function (_: string, node: Element) {
                        const text = node.textContent || '';
                        if (!text) return '';
                        return `(URL链接: ${text})`;
                    }
                });
            } else {
                // 保留链接的原始规则
                turndownService.addRule('inlineParagraphInLink', {
                    filter: (node: Node) => node.nodeName === 'A',
                    replacement: (_: string, node: Element) => {
                        const text = (node as HTMLElement).innerText.replace(/\n+/g, ' ').trim();
                        const href = node.getAttribute('href') || '';
                        return '[' + text + '](' + href + ')';
                    }
                });
            }
            const markdown = turndownService.turndown(bodyClone);
            result.mainContent = markdown;
        } else {
            console.warn('Turndown.js 未能正常加载，使用替代方案解析 HTML 内容');
            let mainContent = '';
            const mainElement = bodyClone.querySelector('article, main');
            if (mainElement) {
                mainContent = mainElement.textContent || '';
            } else {
                // 如果没有特定的内容标签，获取所有文本
                mainContent = bodyClone.textContent || '';
            }

            // 清理文本
            result.mainContent = mainContent
                .replace(/\s+/g, ' ')  // 合并空白字符
                .replace(/\n+/g, '\n\n') // 合并换行
                .trim();
        }
    }

    return result;
};

/**
 * 获取网页内容的返回类型
 */
export interface WebPageContent {
    /** 网页标题 */
    title: string;
    /** 网页描述 */
    description: string;
    /** 网页主要内容 */
    content: string;
    /** 原始 URL */
    url: string;
    /** 内容类型 */
    contentType: string | null;
}

/**
 * 处理 JSON 响应
 */
async function handleJsonResponse(response: Response, url: string): Promise<WebPageContent> {
    const jsonData = await response.json();
    const content = JSON.stringify(jsonData, null, 2);
    return {
        title: `JSON: ${url}`,
        description: `JSON 数据 (${content.length} 字符)`,
        content,
        url,
        contentType: response.headers.get('content-type')
    };
}

/**
 * 处理 HTML 响应 - Raw 模式
 */
async function handleHtmlResponseRaw(response: Response, url: string, querySelector: string = 'body'): Promise<WebPageContent> {
    const text = await response.text();
    const doc = html2Document(text, url);

    // 获取页面标题作为元信息
    const title = doc.head?.querySelector('title')?.textContent?.trim() || `Raw HTML: ${url}`;

    // 使用 querySelector 获取元素
    const elements = doc.querySelectorAll(querySelector);

    if (elements.length === 0) {
        return {
            title,
            description: `未找到匹配选择器 "${querySelector}" 的元素`,
            content: '',
            url,
            contentType: response.headers.get('content-type')
        };
    }

    // 将所有匹配的元素的 HTML 拼接起来
    const htmlParts: string[] = [];
    elements.forEach((element, index) => {
        if (elements.length > 1) {
            htmlParts.push(`<!-- Element ${index + 1} -->`);
        }
        htmlParts.push(element.outerHTML);
    });

    const content = htmlParts.join('\n\n');

    return {
        title,
        description: `Raw HTML 内容，选择器: "${querySelector}"，找到 ${elements.length} 个元素`,
        content,
        url,
        contentType: response.headers.get('content-type')
    };
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

/**
 * 在 Raw HTML 内容中查找关键词
 */
function searchKeywordsInRawHtml(content: string, options: KeywordSearchOptions): KeywordSearchResult {
    // 解析 HTML 内容
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const elements = Array.from(doc.body?.children || []);
    const matches: KeywordMatch[] = [];

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const text = element.textContent || '';
        const { matched, matchedKeywords } = checkKeywordMatch(text, options.findKeywords, options.joinKeywords);

        if (matched) {
            matches.push({
                index: i,
                content: element.outerHTML,
                matchedKeywords
            });
        }
    }

    return {
        keywords: options.findKeywords,
        joinType: options.joinKeywords,
        matchCount: matches.length,
        totalCount: elements.length,
        matches
    };
}

/**
 * 格式化关键词查找结果
 */
function formatKeywordSearchResult(searchResult: KeywordSearchResult, mode: 'markdown' | 'raw'): string {
    const { keywords, joinType, matchCount, totalCount, matches } = searchResult;

    const result: string[] = [];

    // 统计信息
    result.push('# 关键词查找统计');
    result.push(`- 查找关键词: [${keywords.join(', ')}]`);
    result.push(`- 连接方式: ${joinType}`);
    result.push(`- 匹配${mode === 'markdown' ? '段落' : '元素'}数: ${matchCount}`);
    result.push(`- 总${mode === 'markdown' ? '段落' : '元素'}数: ${totalCount}`);
    result.push('');

    if (matches.length === 0) {
        result.push('未找到匹配的内容。');
        return result.join('\n');
    }

    // 匹配内容
    result.push('# 匹配内容');

    matches.forEach((match, index) => {
        result.push(`## 匹配位置 ${index + 1} (${mode === 'markdown' ? '段落' : '元素'} ${match.index + 1})`);
        result.push(`**匹配关键词**: ${match.matchedKeywords.join(', ')}`);

        // 在 markdown 模式下显示字符位置信息
        if (mode === 'markdown' && match.startPosition !== undefined && match.endPosition !== undefined) {
            result.push(`**字符位置**: ${match.startPosition} - ${match.endPosition} (可用于 begin/limit 参数)`);
        }

        result.push('');
        result.push(match.content);
        result.push('');
    });

    return result.join('\n');
}

/**
 * 处理 HTML 响应
 */
async function handleHtmlResponse(response: Response, url: string, options?: FetchWebContentOptions): Promise<WebPageContent> {
    const text = await response.text();

    if (!globalThis.TurndownService) {
        await addScript('/plugins/sy-f-misc/scripts/turndown.js', 'turndown-js');
    }

    const doc = html2Document(text, url);
    const parsedContent = parseHtmlContent(doc, options);

    return {
        title: parsedContent.title || `网页: ${url}`,
        description: parsedContent.description,
        content: parsedContent.mainContent,
        url,
        contentType: response.headers.get('content-type')
    };
}

/**
 * 处理纯文本响应
 */
async function handleTextResponse(response: Response, url: string): Promise<WebPageContent> {
    const text = await response.text();
    return {
        title: `文本: ${url}`,
        description: `纯文本内容 (${text.length} 字符)`,
        content: text,
        url,
        contentType: response.headers.get('content-type')
    };
}

/**
 * 处理未知类型响应
 */
async function handleUnknownResponse(response: Response, url: string): Promise<WebPageContent> {
    const text = await response.text();
    return {
        title: `未知类型: ${url}`,
        description: `未知内容类型 ${response.headers.get('content-type') || '无'} (${text.length} 字符)`,
        content: text,
        url,
        contentType: response.headers.get('content-type')
    };
}

/**
 * 获取网页内容
 */
export const fetchWebContent = async (url: string, mode: 'markdown' | 'raw' = 'markdown', options?: FetchWebContentOptions, querySelector?: string): Promise<WebPageContent> => {
    options = {
        keepLink: false,
        keepImg: false,
        ...options
    };
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        const contentType = response.headers.get('content-type');

        // 如果是二进制内容，跳过
        if (contentType && !contentType.includes('text') && !contentType.includes('json') && !contentType.includes('html')) {
            throw new Error('不支持的二进制内容类型: ' + contentType);
        }

        if (contentType && contentType.includes('json')) {
            return handleJsonResponse(response, url);
        } else if (contentType && contentType.includes('html')) {
            if (mode === 'raw') {
                return handleHtmlResponseRaw(response, url, querySelector);
            } else {
                return handleHtmlResponse(response, url, options);
            }
        } else if (contentType && contentType.includes('text')) {
            return handleTextResponse(response, url);
        } else {
            return handleUnknownResponse(response, url);
        }
    } catch (error) {
        throw new Error(`获取网页内容失败: ${error.message}`);
    }
};

// 导出工具函数，供其他模块使用
export const webUtils = {
    isValidUrl,
    parseHtmlContent,
    html2Document
};

// 导出类型
export type { ParsedHtmlContent };

// 网页内容工具
export const webPageContentTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'WebPageContent',
            description: '获取给定 URL 链接的网页内容。支持两种模式：markdown模式（默认）返回解析的Markdown文本，raw模式返回原始HTML结构。支持关键词查找功能，可以查找包含特定关键词的内容块并返回统计结果。',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '网页 URL'
                    },
                    mode: {
                        type: 'string',
                        enum: ['markdown', 'raw'],
                        description: '返回模式：markdown（默认，返回解析的markdown文本）或 raw（返回HTML结构）'
                    },
                    begin: {
                        type: 'integer',
                        description: '开始的字符位置，默认为 0'
                    },
                    limit: {
                        type: 'integer',
                        description: '可选, 返回的网页内容字符数量的限制; 默认 5000; 如果小于等于 0, 则不限制; 注意是字符数量(string.length)'
                    },
                    keepLink: {
                        type: 'boolean',
                        description: '（markdown模式）是否保留链接的URL，默认false（只保留锚文本节省空间）; 如果你在文中看到了你想要知道的链接，但是内容为 "(URL链接: anchor-text)"，那么你可以把这设置为 true 看到完整链接'
                    },
                    keepImg: {
                        type: 'boolean',
                        description: '（markdown模式）是否保留图片链接，默认false（移除所有图片）'
                    },
                    querySelector: {
                        type: 'string',
                        description: '（raw模式）CSS选择器，默认为"body"；会执行querySelectorAll获取页面元素'
                    },
                    findKeywords: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: '要查找的关键词数组，如果提供此参数，将返回关键词查找结果而非完整内容'
                    },
                    joinKeywords: {
                        type: 'string',
                        enum: ['AND', 'OR'],
                        description: '关键词连接方式：AND（所有关键词都必须匹配）或OR（任意一个关键词匹配即可），默认OR'
                    }
                },
                required: ['url']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: {
        url?: string,
        mode?: 'markdown' | 'raw',
        begin?: number,
        limit?: number,
        keepLink?: boolean,
        keepImg?: boolean,
        querySelector?: string,
        findKeywords?: string[],
        joinKeywords?: 'AND' | 'OR'
    }): Promise<ToolExecuteResult> => {
        const begin = args.begin ?? 0;
        const limit = normalizeLimit(args.limit, 5000);
        const mode = args.mode ?? 'markdown';
        const options = {
            keepLink: args.keepLink,
            keepImg: args.keepImg
        };
        const querySelector = args.querySelector ?? 'body';
        const urls: string[] = [];

        if (args.url) {
            urls.push(args.url);
        } else {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '必须提供 url 参数'
            };
        }

        const results: string[] = [];

        for (const url of urls) {
            try {
                if (!isValidUrl(url)) {
                    results.push(`[错误] 无效的 URL: ${url}`);
                    continue;
                }

                const content = await fetchWebContent(url, mode, options, querySelector);
                let resultText = content.content;
                const originalLength = resultText.length;

                // 关键词查找功能
                if (args.findKeywords && args.findKeywords.length > 0) {
                    const keywordOptions: KeywordSearchOptions = {
                        findKeywords: args.findKeywords,
                        joinKeywords: args.joinKeywords || 'OR'
                    };

                    let searchResult: KeywordSearchResult;
                    if (mode === 'markdown') {
                        searchResult = searchKeywordsInMarkdown(resultText, keywordOptions);
                    } else {
                        searchResult = searchKeywordsInRawHtml(resultText, keywordOptions);
                    }

                    // 格式化关键词查找结果
                    resultText = formatKeywordSearchResult(searchResult, mode);

                    // 对关键词查找结果也应用字数限制
                    const truncResult = truncateContent(resultText, limit);
                    resultText = truncResult.content;
                    if (truncResult.isTruncated) {
                        resultText += `\n\n[关键词查找结果被截断: 原始长度 ${truncResult.originalLength} 字符, 显示 ${truncResult.shownLength} 字符]`;
                    }
                } else {
                    // 应用起始位置和长度限制（仅在非关键词查找模式下）
                    // 先应用 begin 偏移
                    if (begin > 0) {
                        const startPos = Math.min(begin, originalLength);
                        resultText = resultText.substring(startPos);
                    }

                    // 然后应用截断
                    const truncResult = truncateContent(resultText, limit);
                    resultText = truncResult.content;

                    // 添加截断信息
                    if (begin > 0 || truncResult.isTruncated) {
                        const displayStart = begin;
                        const displayEnd = begin + truncResult.shownLength;
                        resultText += `\n\n[原始内容长度: ${originalLength} 字符, 显示范围: ${displayStart} - ${displayEnd}]`;
                    }
                }

                // 组装元信息和内容
                const metaInfo = [];
                if (content.title) metaInfo.push(`# ${content.title}`);
                if (content.description) metaInfo.push(`> ${content.description}`);
                if (content.url) metaInfo.push(`URL: ${content.url}`);
                if (content.contentType) metaInfo.push(`内容类型: ${content.contentType}`);

                // 将元信息和内容合并
                const formattedResult = [...metaInfo, '', resultText].join('\n');

                results.push(formattedResult);
            } catch (error) {
                console.error(`处理 URL 失败: ${url}`, error);
                results.push(`[错误] 处理 URL 失败: ${url}\n${error.message}`);
            }
        }

        if (results.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '未能获取任何网页内容'
            };
        }

        saveAndTruncate('webpage', results.join('\n\n---\n\n'), Number.POSITIVE_INFINITY, { name: 'Webpage', args });

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: results.join('\n\n---\n\n')
        };
    }
};