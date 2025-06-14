/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-30 20:11:55
 * @FilePath     : /src/func/gpt/tools/web/webpage.ts
 * @LastEditTime : 2025-06-14 21:24:13
 * @Description  : 网页内容获取工具
 */
import { addScript } from "../../utils";
import { Tool, ToolPermissionLevel, ToolExecuteResult, ToolExecuteStatus } from "../types";

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
     * 是否保留链接的URL（默认为false）
     * 如果为false，则只保留锚文本部分
     */
    keepLink?: boolean;
    /**
     * 是否保留图片（默认为false）
     * 如果为false，则移除所有图片
     */
    keepImg?: boolean;
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
export const fetchWebContent = async (url: string, options?: FetchWebContentOptions): Promise<WebPageContent> => {
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
            return handleHtmlResponse(response, url, options);
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
                        description: '是否保留链接的URL，默认false（只保留锚文本节省空间）'
                    },
                    keepImg: {
                        type: 'boolean',
                        description: '是否保留图片链接，默认false（移除所有图片）'
                    }
                },
                // 必须提供 url 或 urlList 之一
                required: []  // 在运行时手动验证
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: {
        url?: string,
        urlList?: string[],
        begin?: number,
        limit?: number,
        keepLink?: boolean,
        keepImg?: boolean
    }): Promise<ToolExecuteResult> => {
        const begin = args.begin ?? 0;
        const limit = args.limit ?? 5000;
        const options = {
            keepLink: args.keepLink,
            keepImg: args.keepImg
        };
        const urls: string[] = [];

        if (args.url) {
            urls.push(args.url);
        } else if (args.urlList && args.urlList.length > 0) {
            urls.push(...args.urlList);
        } else {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '必须提供 url 或 urlList 参数'
            };
        }

        const results: string[] = [];

        for (const url of urls) {
            try {
                if (!isValidUrl(url)) {
                    results.push(`[错误] 无效的 URL: ${url}`);
                    continue;
                }

                const content = await fetchWebContent(url, options);
                let resultText = content.content;
                const originalLength = resultText.length;

                // 应用起始位置和长度限制
                if (begin > 0 || (limit > 0 && originalLength > limit)) {
                    // 确保 begin 不超过内容长度
                    const startPos = Math.min(begin, originalLength);
                    // 如果指定了限制，则截取指定长度；否则截取到末尾
                    const endPos = limit > 0 ? Math.min(startPos + limit, originalLength) : originalLength;

                    resultText = resultText.substring(startPos, endPos);

                    // 添加截断信息
                    if (endPos < originalLength || startPos > 0) {
                        resultText += `\n\n[原始内容长度: ${originalLength} 字符, 显示范围: ${startPos} - ${endPos}]`;
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

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: results.join('\n\n---\n\n')
        };
    }
};