/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-30 20:11:55
 * @FilePath     : /src/func/gpt/tools/web/webpage.ts
 * @LastEditTime : 2025-12-16 19:17:04
 * @Description  : 网页内容获取工具
 * 
 * 重构说明 (2025-12-16):
 * - 拆分 API：fetchWebPageAsMarkdown() 和 fetchWebPageAsHTML() 单一职责
 * - 返回结构化数据：HTMLPageContent 直接返回 Element[] 而不是 HTML 字符串
 * - 清理历史代码：删除未使用的关键词搜索函数
 * - 保持向后兼容：fetchWebContent() 继续保留
 */
import { addScript } from "../../utils";

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
 * 获取网页内容的返回类型（Markdown 模式）
 */
export interface WebPageContent {
    /** 网页标题 */
    title: string;
    /** 网页描述 */
    description: string;
    /** 网页关键词 */
    keywords?: string;
    /** 作者 */
    author?: string;
    /** 网页主要内容 */
    content: string;
    /** 原始 URL */
    url: string;
    /** 内容类型 */
    contentType: string | null;
}

/**
 * HTML 页面内容返回类型（Raw HTML 模式）
 */
export interface HTMLPageContent {
    /** 网页标题 */
    title: string;
    /** 原始 URL */
    url: string;
    /** 使用的 CSS 选择器 */
    querySelector: string;
    /** 匹配的 DOM 元素数组 */
    elements: Element[];
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
        keywords: '',
        author: '',
        content,
        url,
        contentType: response.headers.get('content-type')
    };
}

/**
 * 处理 HTML 响应 - Raw 模式（新版本，返回结构化数据）
 */
async function handleHtmlResponseRaw(response: Response, url: string, querySelector: string = 'body'): Promise<HTMLPageContent> {
    const text = await response.text();
    const doc = html2Document(text, url);

    // 获取页面标题作为元信息
    const title = doc.head?.querySelector('title')?.textContent?.trim() || `Raw HTML: ${url}`;

    // 使用 querySelector 获取元素
    const elements = doc.querySelectorAll(querySelector);

    return {
        title,
        url,
        querySelector,
        elements: Array.from(elements),
        contentType: response.headers.get('content-type')
    };
}

/**
 * 处理 HTML 响应 - Raw 模式（旧版本，用于向后兼容）
 * @deprecated 请使用 handleHtmlResponseRaw 获取结构化数据
 */
async function handleHtmlResponseRawLegacy(response: Response, url: string, querySelector: string = 'body'): Promise<WebPageContent> {
    const htmlContent = await handleHtmlResponseRaw(response, url, querySelector);

    // 将元素转换为 HTML 字符串（旧格式）
    const htmlParts: string[] = [];
    htmlContent.elements.forEach((element, index) => {
        if (htmlContent.elements.length > 1) {
            htmlParts.push(`<!-- Element ${index + 1} -->`);
        }
        htmlParts.push(element.outerHTML);
    });

    const content = htmlParts.join('\n\n');

    return {
        title: htmlContent.title,
        description: `Raw HTML 内容，选择器: "${querySelector}"，找到 ${htmlContent.elements.length} 个元素`,
        keywords: '',
        author: '',
        content,
        url: htmlContent.url,
        contentType: htmlContent.contentType
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
        keywords: parsedContent.keywords,
        author: parsedContent.author,
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
        keywords: '',
        author: '',
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
        keywords: '',
        author: '',
        content: text,
        url,
        contentType: response.headers.get('content-type')
    };
}

/**
 * 获取网页内容
 */
export const fetchWebContentAsMarkdown = async (url: string, options?: FetchWebContentOptions): Promise<WebPageContent> => {
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


/**
 * 获取网页的原始 HTML 元素（新 API，推荐使用）
 */
export const fetchWebPageAsHTML = async (url: string, querySelector: string = 'body'): Promise<HTMLPageContent> => {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        const contentType = response.headers.get('content-type');

        // 如果是二进制内容，跳过
        if (contentType && !contentType.includes('text') && !contentType.includes('html')) {
            throw new Error('不支持的二进制内容类型: ' + contentType);
        }

        if (contentType && contentType.includes('html')) {
            return handleHtmlResponseRaw(response, url, querySelector);
        } else {
            throw new Error('非 HTML 内容类型: ' + contentType);
        }
    } catch (error) {
        throw new Error(`获取网页 HTML 内容失败: ${error.message}`);
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
