import { Constants } from 'siyuan';
import styles from './MessageItem.module.scss';

import { debounce, getLute, html2ele, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { addScript, addStyle } from '../utils';
import { useSimpleContext } from './ChatSession.helper';


/**
 * 将文本分割为可安全渲染的部分和剩余的纯文本部分
 * 性能优化版本
 *
 * @param text 要分割的文本
 * @returns 包含两部分的对象：可安全渲染的部分和剩余的纯文本部分
 */
export function splitMarkdownForStreaming(text: string): {
    renderablePart: string;
    remainingPart: string;
} {
    if (!text) {
        return { renderablePart: '', remainingPart: '' };
    }

    // 将文本按行分割
    const lines = text.split('\n');
    const lineCount = lines.length;

    // 预分配数组大小以避免动态扩容
    const renderableLines = new Array(lineCount);
    let renderableCount = 0;
    const remainingLines = new Array(lineCount);
    let remainingCount = 0;

    // 用于跟踪代码块和数学公式的状态
    let inCodeBlock = false;
    let inMathBlock = false;
    let codeBlockFence = '';  // 存储代码块的围栏字符（```或~~~）

    // 最后一个空行的索引，用于确定分割点
    let lastEmptyLineIndex = -1;

    // 预编译正则表达式，避免循环中重复编译
    const fenceRegex = /^(`{3,}|~{3,})/;
    const unorderedListRegex = /^[*\-+]\s+/;
    const orderedListRegex = /^\d+\.\s+/;

    // 用于跟踪列表状态
    let inList = false;

    // 检查是否是列表项
    const isListItem = (trimmed: string): boolean => {
        return unorderedListRegex.test(trimmed) || orderedListRegex.test(trimmed);
    };

    // 处理每一行
    for (let i = 0; i < lineCount; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 检查是否为空行
        if (trimmedLine === '') {
            // 如果不在代码块或数学公式块中，记录这个空行索引
            if (!inCodeBlock && !inMathBlock) {
                lastEmptyLineIndex = renderableCount;
                inList = false; // 空行通常结束列表
            }
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 检查代码块开始/结束 - 优化字符串操作
        if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
            // 使用预编译的正则表达式
            const fence = fenceRegex.exec(trimmedLine)?.[0] || '';

            if (!inCodeBlock) {
                // 开始一个新的代码块
                inCodeBlock = true;
                codeBlockFence = fence;
                renderableLines[renderableCount++] = line;
            } else if (trimmedLine.startsWith(codeBlockFence)) {
                // 检查是否是结束标记 - 优化 replace 操作
                const restOfLine = trimmedLine.substring(codeBlockFence.length).trim();
                if (restOfLine === '') {
                    // 结束当前代码块
                    inCodeBlock = false;
                    codeBlockFence = '';
                }
                renderableLines[renderableCount++] = line;
            } else {
                // 代码块内的围栏样式行，但不是结束标记
                renderableLines[renderableCount++] = line;
            }
            continue;
        }

        // 检查数学公式块开始/结束
        if (trimmedLine === '$$') {
            inMathBlock = !inMathBlock;
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 如果在代码块或数学公式块中，继续添加到可渲染部分
        if (inCodeBlock || inMathBlock) {
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 检查是否是列表项
        if (isListItem(trimmedLine)) {
            // 如果是新的列表开始
            if (!inList) {
                inList = true;
            }
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 如果前一行是列表项，检查这一行是否是列表项的延续（缩进）
        if (inList && line.startsWith('    ') && !isListItem(trimmedLine)) {
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 如果之前在列表中，但当前行不是列表项也不是缩进，则列表结束
        if (inList && !isListItem(trimmedLine) && !line.startsWith('    ')) {
            inList = false;
        }

        // 处理普通行
        renderableLines[renderableCount++] = line;
    }

    // 如果代码块或数学公式块未关闭，我们需要将整个未关闭的块移到剩余部分
    if (inCodeBlock || inMathBlock) {
        // 如果有空行，从最后一个空行后分割
        if (lastEmptyLineIndex >= 0) {
            // 将最后一个空行之后的所有内容移到剩余部分
            for (let i = lastEmptyLineIndex + 1; i < renderableCount; i++) {
                remainingLines[remainingCount++] = renderableLines[i];
            }
            // 截断可渲染部分
            renderableCount = lastEmptyLineIndex + 1;
        } else {
            // 如果没有空行，将所有内容移到剩余部分
            for (let i = 0; i < renderableCount; i++) {
                remainingLines[remainingCount++] = renderableLines[i];
            }
            renderableCount = 0;
        }
    }

    // 调整数组大小
    renderableLines.length = renderableCount;
    remainingLines.length = remainingCount;

    // 将行数组合并回字符串
    return {
        renderablePart: renderableLines.join('\n'),
        remainingPart: remainingLines.join('\n')
    };
}

export const useCodeToolbar = (language: string, code: string) => {
    const RUN_BUTTON = `
    <button
        class="${styles.toolbarButton} b3-button b3-button--text"
        data-role="run"
        style="padding: 0;"
        title="Run"
    >
        <svg><use href="#iconPlay" /></svg>
    </button>
    `;

    let html = `
    <div class="${styles['code-toolbar']}">
        ${language.toLocaleLowerCase() === 'html' ? RUN_BUTTON : ''}
        <div class="fn__flex-1"></div>
        <span class="b3-label__text" style="font-family: var(--b3-font-family-code); margin: 0px;">
            ${language}
        </span>
        <button
            class="${styles.toolbarButton} b3-button b3-button--text"
            data-role="copy"
            style="padding: 0;"
            title="复制"
        >
            <svg><use href="#iconCopy" /></svg>
        </button>
    </div>
    `;
    let ele = html2ele(html);
    (ele.querySelector('button[data-role="copy"]') as HTMLButtonElement).onclick = () => {
        navigator.clipboard.writeText(code);
    }
    let btnRun = ele.querySelector('button[data-role="run"]') as HTMLButtonElement;
    if (btnRun) {
        btnRun.onclick = () => {
            let iframe = document.createElement('iframe');
            iframe.id = 'run-iframe';
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.srcdoc = code;
            const container = document.createElement('div');
            container.style.display = 'contents';
            container.appendChild(iframe);
            simpleDialog({
                title: '运行结果',
                ele: container,
                width: '1000px',
                height: '700px'
            });
        }
    }

    return ele;
}

export const initHljs = async () => {
    if (window.hljs) return;

    //https://github.com/siyuan-note/siyuan/blob/master/app/src/util/assets.ts#L309
    const setCodeTheme = (cdn = Constants.PROTYLE_CDN) => {
        const protyleHljsStyle = document.getElementById("protyleHljsStyle") as HTMLLinkElement;
        let css;
        if (window.siyuan.config.appearance.mode === 0) {
            css = window.siyuan.config.appearance.codeBlockThemeLight;
            if (!Constants.SIYUAN_CONFIG_APPEARANCE_LIGHT_CODE.includes(css)) {
                css = "default";
            }
        } else {
            css = window.siyuan.config.appearance.codeBlockThemeDark;
            if (!Constants.SIYUAN_CONFIG_APPEARANCE_DARK_CODE.includes(css)) {
                css = "github-dark";
            }
        }
        const href = `${cdn}/js/highlight.js/styles/${css}.min.css`;
        if (!protyleHljsStyle) {
            addStyle(href, "protyleHljsStyle");
        } else if (!protyleHljsStyle.href.includes(href)) {
            protyleHljsStyle.remove();
            addStyle(href, "protyleHljsStyle");
        }
    };

    const cdn = Constants.PROTYLE_CDN;
    setCodeTheme(cdn);
    await addScript(`${cdn}/js/highlight.js/highlight.min.js`, "protyleHljsScript");
    await addScript(`${cdn}/js/highlight.js/third-languages.js`, "protyleHljsThirdScript");
    return window.hljs !== undefined && window.hljs !== null;
}

export const initKatex = async () => {
    if (window.katex) return;
    // https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/render/mathRender.ts
    const cdn = Constants.PROTYLE_CDN;
    addStyle(`${cdn}/js/katex/katex.min.css`, "protyleKatexStyle");
    await addScript(`${cdn}/js/katex/katex.min.js`, "protyleKatexScript");
    return window.katex !== undefined && window.katex !== null;
}

export const renderCodeblock = (ele: HTMLElement) => {
    const language = ele.className.replace('language-', '').trim();

    let codeContent = ele.textContent;
    window.hljs.highlightElement(ele);

    //Create boolbar
    let btn = useCodeToolbar(language || 'text', codeContent);
    const pre = ele.parentElement;


    // Create scroll container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = styles['pre-scroll-container'];
    // Move code into scroll container
    scrollContainer.appendChild(ele);

    // Add elements to pre in correct order
    pre.appendChild(btn);
    pre.appendChild(scrollContainer);

    pre.prepend(btn);
    if (['markdown', 'md', 'text', 'plaintext', 'tex', 'latex', '', 'undefined'].includes(language)) {
        ele.style.whiteSpace = 'pre-wrap';
    }
    // pre.style.marginTop = '0';
    Object.assign(pre.style, {
        'margin-top': 0,
        'white-space': 'pre'
    })
}

export const renderMathBlock = (element: HTMLElement) => {
    try {
        const formula = element.textContent || '';
        if (!formula.trim()) {
            return;
        }

        const isBlock = element.tagName.toUpperCase() === 'DIV';

        // 使用 KaTeX 渲染公式
        const html = window.katex.renderToString(formula, {
            throwOnError: false, // 发生错误时不抛出异常
            displayMode: isBlock,   // 使用显示模式（居中显示）
            strict: (errorCode) => errorCode === "unicodeTextInMathMode" ? "ignore" : "warn",
            trust: true
        });

        // 清空原始内容并插入渲染后的内容
        element.innerHTML = html;
        if (isBlock) {
            element.classList.add(styles['katex-center-display']);
        }

    } catch (error) {
        console.error('Error rendering math formula:', error);
        // 可以在这里添加错误处理逻辑，比如显示错误提示
        element.innerHTML = `<span style="color: red;">Error rendering formula: ${error.message}</span>`;
    }
}

/**
 * Hook for rendering markdown with support for streaming content
 * Provides an elegant API for rendering markdown in components
 */
export function createMarkdownRenderer() {
    let lute = getLute();
    const { config } = useSimpleContext();
    /**
     * Run post-processors for code blocks and math formulas
     */
    const runPostProcessors = async (contentRef: HTMLElement) => {
        if (!contentRef) return;

        // Process code blocks
        const codeBlocks = contentRef.querySelectorAll('pre>code');
        if (codeBlocks.length > 0) {
            if (!window.hljs) {
                await initHljs();
            }
            if (window.hljs) {
                codeBlocks.forEach((ele: HTMLElement) => {
                    renderCodeblock(ele);
                });
            }
        }

        // Process math formulas
        const mathElements: HTMLElement[] = Array.from(contentRef.querySelectorAll('.language-math'));
        if (mathElements.length > 0) {
            if (!window.katex) {
                await initKatex();
            }
            mathElements.forEach((element) => {
                renderMathBlock(element);
            });
        }
    };

    // Debounced version of runPostProcessors to avoid excessive processing
    const renderHTMLBlock = debounce(runPostProcessors, 50);

    /**
     * Render markdown content to HTML
     *
     * @param text The markdown text to render, in streaming mode, this will be the full lastest response content
     * @param isLoading Whether the content is still loading/streaming
     * @param lute The Lute instance for markdown rendering
     * @param streamingClass CSS class for streaming text
     * @returns Rendered HTML
     */
    const renderMarkdown = (
        text: string,
        isLoading: boolean = false
    ): string => {
        if (!text) return '';

        // If content is loading, use streaming mode
        if (isLoading) {
            // 使用配置项来决定是否在流式模式下渲染 Markdown
            if (!config().renderInStreamMode) {
                text = window.Lute.EscapeHTMLStr(text)
                return `<div style="white-space: pre-wrap;">${text}</div>`;
            }

            const { renderablePart, remainingPart } = splitMarkdownForStreaming(text);

            // Render the safe part as markdown
            let html = '';
            if (renderablePart) {
                //@ts-ignore
                html = lute.Md2HTML(renderablePart);
            }

            // Add the remaining part as escaped HTML
            if (remainingPart) {
                html += `<div class="${styles.streamingText || ''}">${window.Lute.EscapeHTMLStr(remainingPart)}</div>`;
            }
            return html;
        } else {
            // Regular rendering for complete content
            //@ts-ignore
            const html = lute.Md2HTML(text);
            return html;
        }
    };

    return {
        renderMarkdown,
        renderHTMLBlock
    };
}

