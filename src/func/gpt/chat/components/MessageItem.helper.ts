import { Constants } from 'siyuan';

import { debounce, getLute, html2ele, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { addScript, addStyle } from '@gpt/utils';

import { useSimpleContext } from '../ChatSession/ChatSession.helper';
import styles from './MessageItem.module.scss';


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


export const initMermaid = async () => {
    if (window.mermaid) return;
    const CDN = Constants.PROTYLE_CDN;
    console.debug('Initializing mermaid...');
    //https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/render/mermaidRender.ts
    const flag = await addScript(`${CDN}/js/mermaid/mermaid.min.js`, "protyleMermaidScript");
    if (!flag) return;
    const config: any = {
        securityLevel: "loose", // 升级后无 https://github.com/siyuan-note/siyuan/issues/3587，可使用该选项
        altFontFamily: "sans-serif",
        fontFamily: "sans-serif",
        startOnLoad: false,
        flowchart: {
            htmlLabels: true,
            useMaxWidth: !0
        },
        sequence: {
            useMaxWidth: true,
            diagramMarginX: 8,
            diagramMarginY: 8,
            boxMargin: 8,
            showSequenceNumbers: true // Mermaid 时序图增加序号 https://github.com/siyuan-note/siyuan/pull/6992 https://mermaid.js.org/syntax/sequenceDiagram.html#sequencenumbers
        },
        gantt: {
            leftPadding: 75,
            rightPadding: 20
        }
    };
    if (window.siyuan.config.appearance.mode === 1) {
        config.theme = "dark";
    }
    window.mermaid.initialize(config);
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
     * Run post-processors for code blocks and math formulas
     */
export const runMarkdownPostRender = async (contentRef: HTMLElement) => {
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

    // .language-mermaid
    const mermaidElements: HTMLElement[] = Array.from(contentRef.querySelectorAll('.language-mermaid'));
    if (mermaidElements.length > 0) {
        if (!window.mermaid) {
            await initMermaid();
        }
        mermaidElements.forEach(async (element) => {
            const code = element.textContent || '';
            const id = "mermaid" + window.Lute.NewNodeID();

            if (!code.trim()) {
                return;
            }
            try {
                const mermaidData = await window.mermaid.render(id, code);
                element.innerHTML = mermaidData.svg;
            } catch (error) {
                console.groupCollapsed('Mermaid failed to render code:');
                console.warn(error);
                console.warn(code);
                console.groupEnd();
                const ele: HTMLElement = document.querySelector(`body>div#d${id}`);
                if (ele) {
                    ele.style.position = 'absolute';
                    ele.style.bottom = '0';
                    ele.style.opacity = '0';
                    ele.style.transform = 'translateY(50px)';
                    ele.style.transition = 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out';
                    element.innerHTML += `<div style="color: var(--b3-theme-error); text-align: center;">Mermaid 渲染失败，请检查代码正确性</div>`;
                    element.style.outline = '1px solid var(--b3-border-color)';
                    // 延时移除元素
                    setTimeout(() => {
                        ele.remove();
                    }, 500);
                }
            }
        });
    }
};


/**
 * Hook for rendering markdown with support for streaming content
 * Provides an elegant API for rendering markdown in components
 */
export function createMarkdownRenderer() {
    let lute = getLute();
    const { config } = useSimpleContext();

    // Debounced version of runPostProcessors to avoid excessive processing
    const renderHTMLBlock = debounce(runMarkdownPostRender, 50);

    // 缓存已渲染的内容
    let cachedRenderablePart = '';
    let cachedHtml = '';

    const renderMarkdown = (
        text: string,
        isLoading: boolean = false
    ): string => {
        if (!text) return '';

        // 如果内容正在加载，使用流式模式
        if (isLoading) {
            // 使用配置项来决定是否在流式模式下渲染 Markdown
            if (!config().renderInStreamMode) {
                text = window.Lute.EscapeHTMLStr(text);
                return `<div style="white-space: pre-wrap;">${text}</div>`;
            }

            const blocks = text.split('\n\n');
            const renderablePart = blocks.slice(0, -1).join('\n\n');
            const remainingPart = blocks.slice(-1).join('\n\n');

            // 使用缓存机制，只有当 renderablePart 发生变化时才重新渲染
            let html = '';
            if (renderablePart) {
                if (renderablePart.length === cachedRenderablePart.length) {
                    html = cachedHtml;
                } else {
                    //@ts-ignore
                    html = lute.Md2HTML(renderablePart);
                    cachedRenderablePart = renderablePart;
                    cachedHtml = html;
                }
            }

            // 添加剩余部分作为转义的 HTML
            if (remainingPart) {
                html += `<div class="${styles.streamingText || ''}">${window.Lute.EscapeHTMLStr(remainingPart)}</div>`;
            }
            return html;
        } else {
            // 完整内容的常规渲染
            //@ts-ignore
            const html = lute.Md2HTML(text);
            // 重置缓存，因为文档已完成
            cachedRenderablePart = '';
            cachedHtml = '';
            return html;
        }
    };

    return {
        renderMarkdown,
        renderHTMLBlock
    };
}

