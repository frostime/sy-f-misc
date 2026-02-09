/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-14
 * @FilePath     : /src/func/gpt/tools/web/extract-html.ts
 * @LastEditTime : 2025-12-16 (重构)
 * @Description  : HTML 元素提取工具 - 使用 CSS 选择器提取特定 HTML 元素
 *
 * 重构说明 (2025-12-16):
 * - 使用新 API：改用 fetchWebPageAsHTML() 直接获取 Element[]
 * - 移除重复解析：不再需要重新解析 HTML 字符串
 * - 代码更清晰：遵循 SOLID 原则，职责单一
 */
import { Tool, ToolExecuteResult, ToolExecuteStatus } from "../types";
import { normalizeLimit } from '../utils';
import { WebToolError, WebToolErrorCode } from './types';
import { fetchWebPageAsHTML, isValidUrl, type HTMLPageContent } from './webpage';
import { createTreeSource, TreeBuilder, formatTree, type Tree, type TreeNode } from '@/libs/tree-model';

/**
 * DOM 节点数据 - 提取后的纯数据
 */
interface DOMNodeData {
    tagName: string;
    attributes: Record<string, string>;
    selector: string;
    textPreview?: string;
}

/**
 * DOM 结构探索结果
 */
interface InspectDOMResult {
    title: string;
    url: string;
    entrySelector: string;
    maxDepth: number;
    tree: Tree<DOMNodeData>;
}

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
const INSPECT_DOM_LIMIT = 8000;

/**
 * 过滤无意义的 class 名称
 * - 去除动态生成的 hash 类名（如 css-1xg5j4k-MuiButton）
 * - 去除过长的类名
 * - 保留前 3 个有意义的类名
 */
function filterClassNames(classNames: string): string {
    if (!classNames) return '';

    const classes = classNames.split(/\s+/)
        .filter(cls => {
            // 过滤掉明显的 hash 类名
            if (/^[a-z]+-[0-9a-z]{6,}$/i.test(cls)) return false;
            // 过滤掉过长的类名（超过 30 字符）
            if (cls.length > 30) return false;
            return true;
        })
        .slice(0, 3); // 只保留前 3 个

    return classes.join(' ');
}

/**
 * 过滤元素属性，只保留有语义价值的属性
 */
function filterAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    const meaningfulAttrs = ['id', 'class', 'role', 'aria-label', 'name', 'type', 'href', 'src'];

    meaningfulAttrs.forEach(attrName => {
        const value = element.getAttribute(attrName);
        if (value) {
            if (attrName === 'class') {
                const filtered = filterClassNames(value);
                if (filtered) attrs[attrName] = filtered;
            } else {
                attrs[attrName] = value;
            }
        }
    });

    return attrs;
}

/**
 * 生成元素的 CSS 选择器路径
 */
function generateSelector(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.tagName.toLowerCase() !== 'html') {
        let selector = current.tagName.toLowerCase();

        // 添加 id
        if (current.id) {
            selector += `#${current.id}`;
            parts.unshift(selector);
            break; // id 是唯一的，可以停止
        }

        // 添加主要的 class
        const classes = filterClassNames(current.className);
        if (classes) {
            selector += `.${classes.split(' ').join('.')}`;
        }

        parts.unshift(selector);
        current = current.parentElement;

        // 限制路径长度
        if (parts.length >= 5) break;
    }

    return parts.join(' > ');
}

/**
 * 获取元素的文本预览
 */
function getTextPreview(element: Element, maxLength: number = 50): string | undefined {
    // 只获取直接子文本节点
    let text = '';
    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent || '';
        }
    }

    text = text.trim().replace(/\s+/g, ' ');

    if (!text) return undefined;
    if (text.length <= maxLength) return text;

    return text.substring(0, maxLength) + '...';
}

/**
 * 过滤元素 - 跳过无意义的标签
 */
function shouldSkipElement(element: Element): boolean {
    return ['script', 'style', 'noscript', 'svg'].includes(element.tagName.toLowerCase());
}

/**
 * 格式化 DOM 节点显示 - 生成节点的文本表示
 */
function formatDOMNode(data: DOMNodeData, node: TreeNode<DOMNodeData>): string {
    let line = data.tagName;

    // 添加 id 和 class
    if (data.attributes.id) {
        line += `#${data.attributes.id}`;
    }
    if (data.attributes.class) {
        line += `.${data.attributes.class.split(' ').join('.')}`;
    }

    // 添加其他重要属性
    const otherAttrs = Object.entries(data.attributes)
        .filter(([key]) => key !== 'id' && key !== 'class')
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
    if (otherAttrs) {
        line += ` [${otherAttrs}]`;
    }

    // 添加文本预览
    if (data.textPreview) {
        line += ` ("${data.textPreview}")`;
    }

    // 添加选择器提示（仅顶层节点）
    if (node.depth < 2) {
        line += `\n${' '.repeat(node.depth * 4)}  → [选择器: ${data.selector}]`;
    }

    return line;
}

/**
 * InspectDOMStructure 工具 - 探索网页 DOM 结构
 *
 * 职责：
 * 1. 获取网页的 DOM 树形结构概览
 * 2. 帮助 LLM 理解页面结构，构建精确的 CSS 选择器
 * 3. 支持指定入口节点和探索深度
 */
export const inspectDOMStructureTool: Tool = {
    DEFAULT_OUTPUT_LIMIT_CHAR: INSPECT_DOM_LIMIT,

    declaredReturnType: {
        type: `{
    title: string;
    url: string;
    entrySelector: string;
    maxDepth: number;
    tree: Tree<{
        tagName: string;
        attributes: Record<string, string>;
        selector: string;
        textPreview?: string;
    }>;
    interface Tree<T> {roots: TreeNode<T>[];}
    interface TreeNode<T> {data: T; children: TreeNode<T>[];}
}`,
        note: '网页 DOM 树形结构，使用 Tree 模型包含标签名、属性、CSS 选择器路径和文本预览'
    },

    definition: {
        type: 'function',
        function: {
            name: 'InspectDOMStructure',
            description: '探索网页的 DOM 结构，获取树形结构概览。用于理解页面结构并构建精确的 CSS 选择器。适用于首次访问网页，不确定如何提取内容时。',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '网页 URL'
                    },
                    entrySelector: {
                        type: 'string',
                        description: 'DOM 树的起始选择器，默认为 "body"。可指定为 "main"、"article"、"#content" 等来聚焦特定区域。'
                    },
                    maxDepth: {
                        type: 'integer',
                        description: '遍历的最大深度，默认为 4。较小的值返回更简洁的结构，较大的值提供更详细的信息。建议：首次探索用 3-4，深入分析用 5-6。'
                    },
                    includeText: {
                        type: 'boolean',
                        description: '是否包含文本内容预览，默认 true。文本预览有助于判断元素的实际内容。'
                    }
                },
                required: ['url']
            }
        }
    },

    permission: {
        executionPolicy: 'ask-once',
        resultApprovalPolicy: 'always'
    },

    execute: async (args: {
        url?: string,
        entrySelector?: string,
        maxDepth?: number,
        includeText?: boolean
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

        const entrySelector = args.entrySelector || 'body';
        const maxDepth = args.maxDepth || 4;
        const includeText = args.includeText !== false;

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

            // 获取网页 HTML 内容
            const htmlContent: HTMLPageContent = await fetchWebPageAsHTML(args.url, entrySelector);

            if (htmlContent.elements.length === 0) {
                const error: WebToolError = {
                    code: WebToolErrorCode.PARSE_FAILED,
                    message: `未找到匹配选择器 "${entrySelector}" 的元素`,
                    url: args.url
                };
                return {
                    status: ToolExecuteStatus.ERROR,
                    data: error
                };
            }

            // 使用 tree-model 构建 DOM 树
            const sources = createTreeSource({
                root: htmlContent.elements,
                getChildren: (el: Element) =>
                    Array.from(el.children).filter(child => !shouldSkipElement(child)),
                extract: (el: Element): DOMNodeData => ({
                    tagName: el.tagName.toLowerCase(),
                    attributes: filterAttributes(el),
                    selector: generateSelector(el),
                    textPreview: includeText ? getTextPreview(el) : undefined
                })
            });

            const tree = await TreeBuilder.build(sources, { maxDepth });

            const result: InspectDOMResult = {
                title: htmlContent.title,
                url: htmlContent.url,
                entrySelector,
                maxDepth,
                tree
            };

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result
            };
        } catch (error) {
            console.error(`探索 DOM 结构失败: ${args.url}`, error);
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

    formatForLLM: (data: InspectDOMResult): string => {
        const parts: string[] = [];

        // 标题
        parts.push(`# 🔍 DOM 结构探索: ${data.title}`);
        parts.push('');

        // 元信息
        parts.push('| 属性 | 值 |');
        parts.push('|------|-----|');
        const stats = data.tree.getStats();
        parts.push(`| URL | ${data.url} |`);
        parts.push(`| 入口选择器 | \`${data.entrySelector}\` |`);
        parts.push(`| 最大深度 | ${data.maxDepth} |`);
        parts.push(`| 根节点数 | ${data.tree.roots.length} |`);
        parts.push(`| 总节点数 | ${stats.totalNodes} |`);
        parts.push(`| 叶子节点 | ${stats.leafNodes} |`);
        parts.push('');

        parts.push('---');
        parts.push('');
        parts.push('## 📊 DOM 树形结构');
        parts.push('');
        parts.push('```');

        // 使用 tree-model 的格式化功能
        const formatted = formatTree({
            tree: data.tree,
            formatter: formatDOMNode,
            showChildCount: true
        });
        parts.push(formatted);

        parts.push('```');
        parts.push('');

        parts.push('---');
        parts.push('');
        parts.push('## 💡 使用提示');
        parts.push('');
        parts.push('根据上述结构，你可以：');
        parts.push('1. **使用 ExtractHTML 工具**：复制 [选择器: ...] 中的选择器来精确提取元素');
        parts.push('2. **深入探索**：对感兴趣的区域使用更大的 maxDepth 或指定 entrySelector');
        parts.push('3. **搜索关键词**：使用 SearchInWebPage 在特定区域搜索关键词');
        parts.push('4. **获取全文**：使用 FetchWebPage 获取整个页面的 Markdown 内容');

        return parts.join('\n');
    },

    truncateForLLM: (formatted: string, _args: Record<string, any>): string => {
        return formatted;
    }
};

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
            description: '使用 CSS 选择器从网页中提取特定的 HTML 元素。适用于精确提取网页中的特定部分，如文章内容、评论区、数据表格等。建议先使用 InspectDOMStructure 了解页面结构。',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '网页 URL'
                    },
                    querySelector: {
                        type: 'string',
                        description: 'CSS 选择器，用于定位要提取的元素。例如："article", ".content", "#main-text", "table.data" 等。会执行 querySelectorAll 获取所有匹配元素。可以从 InspectDOMStructure 的结果中复制选择器。'
                    },
                    limit: {
                        type: 'integer',
                        description: `返回内容的字符数量限制，默认 ${EXTRACT_HTML_LIMIT}。如果小于等于 0 则不限制。`
                    }
                },
                required: ['url', 'querySelector']
            }
        }
    },

    permission: {
        executionPolicy: 'ask-once',
        resultApprovalPolicy: 'always'
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

            // 获取网页 HTML 内容
            const htmlContent: HTMLPageContent = await fetchWebPageAsHTML(args.url, args.querySelector);

            if (htmlContent.elements.length === 0) {
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

            htmlContent.elements.forEach((element, index) => {
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
                title: htmlContent.title,
                url: htmlContent.url,
                querySelector: args.querySelector,
                elementsCount: htmlContent.elements.length,
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

    truncateForLLM: (formatted: string, _args: Record<string, any>): string => {
        return formatted;
    }
};
