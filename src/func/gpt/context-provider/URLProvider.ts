/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-23 21:14:51
 * @FilePath     : /src/func/gpt/context-provider/URLProvider.ts
 * @Description  : URL Content Provider
 */

// import { request } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";
import { addScript } from "../utils";

const isValidUrl = (url: string): boolean => {
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

interface ParsedHtmlContent {
    title: string;
    description: string;
    keywords: string;
    author: string;
    mainContent: string;
}

const parseHtmlContent = (doc: Document): ParsedHtmlContent => {
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
            'form, button, input, select, textarea'
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
        let turndownService = globalThis.TurndownService?.() as {
            turndown(dom: HTMLElement, options: any): string, keep: any,
            addRule(name: string, rule: any): void
        };

        if (turndownService && turndownService.turndown) {
            turndownService.keep(['del', 'ins']);
            turndownService.addRule('inlineParagraphInLink', {
                filter: (node: Node) => node.nodeName === 'A',
                replacement: (content: string, node: Element) => {
                    const text = (node as HTMLElement).innerText.replace(/\n+/g, ' ').trim();
                    const href = node.getAttribute('href') || '';
                    return '[' + text + '](' + href + ')';
                }
            });
            const markdown = turndownService.turndown(bodyClone, {
                headingStyle: 'atx',
                hr: '---',
                bulletListMarker: '-',
                codeBlockStyle: 'fenced',
                fence: '```',
                emDelimiter: '_',
                strongDelimiter: '**',
                linkStyle: 'inlined',
                // linkReferenceStyle: 'full',
                blankReplacement: (content, node) => {
                    // 保留换行符
                    return node.isBlock ? '\n\n' : '';
                }
            });
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
                const response = await fetch(url);
                const contentType = response.headers.get('content-type');

                // 如果是二进制内容，跳过
                if (contentType && !contentType.includes('text') && !contentType.includes('json') && !contentType.includes('html')) {
                    continue;
                }

                let content = '';
                if (contentType && contentType.includes('json')) {
                    // JSON内容
                    const jsonData = await response.json();
                    content = JSON.stringify(jsonData, null, 2);
                } else if (contentType && (contentType.includes('html') || contentType.includes('text'))) {
                    // HTML或文本内容
                    const text = await response.text();
                    if (contentType.includes('html')) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');
                        if (!globalThis.TurndownService) {
                            await addScript('/plugins/sy-f-misc/scripts/turndown.js', 'turndown-js');
                        }
                        const parsedContent = parseHtmlContent(doc);

                        // 组装格式化的内容
                        const parts = [];
                        if (parsedContent.title) parts.push(`标题: ${parsedContent.title}`);
                        if (parsedContent.description) parts.push(`描述: ${parsedContent.description}`);
                        if (parsedContent.keywords) parts.push(`关键词: ${parsedContent.keywords}`);
                        if (parsedContent.author) parts.push(`作者: ${parsedContent.author}`);
                        if (parsedContent.mainContent) parts.push(`\n正文内容:\n${parsedContent.mainContent}`);

                        content = parts.join('\n');
                    } else {
                        content = text;
                    }
                }

                if (content) {
                    results.push({
                        name: `URL内容: ${url.substring(0, 30)}${url.length > 30 ? '...' : ''}`,
                        description: `访问: ${url}; 结果类型为 ${contentType}`,
                        content: content,
                    });
                }
            } catch (error) {
                showMessage(`获取URL内容失败 (${url}): ${error.message}`, 4000, "error");
                // 继续处理其他URL，不中断
            }
        }

        return results;
    }
};

export default URLProvider;
