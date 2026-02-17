import { Constants } from 'siyuan';

import { debounce, getLute, html2ele, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { addScript, addStyle } from '@gpt/utils';

import { useSimpleContext } from '../ChatSession/use-chat-session';
import styles from './MessageItem.module.scss';


export const useCodeToolbar = (language: string, code: string) => {
    // 代码块操作栏 HTML - 极简设计
    let html = `
    <div class="${styles['codeActionBar']}">
        <span class="${styles['codeActionLangBadge']}" title="${language || 'text'}">${language || 'text'}</span>
        <div class="${styles['codeActionButtons']}">
            ${language.toLowerCase() === 'html' ? `
            <button
                class="${styles['codeActionButton']}"
                data-role="run"
                title="运行"
            >
                <svg><use href="#iconPlay" /></svg>
            </button>
            ` : ''}
            <button
                class="${styles['codeActionButton']}"
                data-role="copy"
                title="复制"
            >
                <svg><use href="#iconCopy" /></svg>
            </button>
        </div>
    </div>
    `;

    let ele = html2ele(html);

    // 复制按钮
    (ele.querySelector('button[data-role="copy"]') as HTMLButtonElement).onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(code);
    };

    // 运行按钮
    let btnRun = ele.querySelector('button[data-role="run"]') as HTMLButtonElement;
    if (btnRun) {
        btnRun.onclick = (e) => {
            e.stopPropagation();
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
        };
    }

    return ele;
};

export const initHljs = async () => {
    if (window.hljs) return;

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
};

export const initKatex = async () => {
    if (window.katex) return;
    const cdn = Constants.PROTYLE_CDN;
    addStyle(`${cdn}/js/katex/katex.min.css`, "protyleKatexStyle");
    await addScript(`${cdn}/js/katex/katex.min.js`, "protyleKatexScript");
    return window.katex !== undefined && window.katex !== null;
};

export const initMermaid = async () => {
    if (window.mermaid) return;
    const CDN = Constants.PROTYLE_CDN;
    console.debug('Initializing mermaid...');
    const flag = await addScript(`${CDN}/js/mermaid/mermaid.min.js`, "protyleMermaidScript");
    if (!flag) return;
    const config: any = {
        securityLevel: "loose",
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
            showSequenceNumbers: true
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
};

export const renderCodeblock = (ele: HTMLElement, addActionBar: boolean = true) => {
    const language = ele.className.replace('language-', '').trim();

    let codeContent = ele.textContent;
    window.hljs.highlightElement(ele);

    if (addActionBar) {
        // 创建代码块操作栏
        let actionBar = useCodeToolbar(language || 'text', codeContent);
        const pre = ele.parentElement;

        // 给 pre 添加相对定位，作为操作栏的定位容器
        pre.style.position = 'relative';

        // 将操作栏插入到 pre 的开头
        pre.insertBefore(actionBar, pre.firstChild);
    }

    // 特殊语言的换行处理
    if (['markdown', 'md', 'text', 'plaintext', 'tex', 'latex', '', 'undefined'].includes(language)) {
        ele.style.whiteSpace = 'pre-wrap';
    }
};

export const renderMathBlock = (element: HTMLElement) => {
    try {
        const formula = element.textContent || '';
        if (!formula.trim()) {
            return;
        }

        const isBlock = element.tagName.toUpperCase() === 'DIV';

        const html = window.katex.renderToString(formula, {
            throwOnError: false,
            displayMode: isBlock,
            strict: (errorCode) => errorCode === "unicodeTextInMathMode" ? "ignore" : "warn",
            trust: true
        });

        element.innerHTML = html;
        if (isBlock) {
            element.classList.add(styles['katex-center-display']);
        }

    } catch (error) {
        console.error('Error rendering math formula:', error);
        element.innerHTML = `<span style="color: red;">Error rendering formula: ${error.message}</span>`;
    }
};

export const runMarkdownPostRender = async (contentRef: HTMLElement, options?: {
    renderCodeblock?: boolean;
    renderMath?: boolean;
    renderMermaid?: boolean;
    addCodeActionBar?: boolean;
}) => {
    if (!contentRef) return;

    const { renderCodeblock: shouldRenderCodeblock = true, renderMath: shouldRenderMath = true, renderMermaid: shouldRenderMermaid = true, addCodeActionBar = true } = options || {};

    const codeBlocks = contentRef.querySelectorAll('pre>code');
    if (codeBlocks.length > 0 && shouldRenderCodeblock) {
        if (!window.hljs) {
            await initHljs();
        }
        if (window.hljs) {
            codeBlocks.forEach((ele: HTMLElement) => {
                renderCodeblock(ele, addCodeActionBar);
            });
        }
    }

    const mathElements: HTMLElement[] = Array.from(contentRef.querySelectorAll('.language-math'));
    if (mathElements.length > 0 && shouldRenderMath) {
        if (!window.katex) {
            await initKatex();
        }
        mathElements.forEach((element) => {
            renderMathBlock(element);
        });
    }

    const mermaidElements: HTMLElement[] = Array.from(contentRef.querySelectorAll('.language-mermaid'));
    if (mermaidElements.length > 0 && shouldRenderMermaid) {
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
                    setTimeout(() => {
                        ele.remove();
                    }, 500);
                }
            }
        });
    }
};

export function createMarkdownRenderer() {
    let lute = getLute();
    const { config } = useSimpleContext();

    const renderHTMLBlock = debounce(runMarkdownPostRender, 50);

    let cachedRenderablePart = '';
    let cachedHtml = '';

    const renderMarkdown = (
        text: string,
        isLoading: boolean = false
    ): string => {
        if (!text) return '';

        if (isLoading) {
            if (!config().renderInStreamMode) {
                text = window.Lute.EscapeHTMLStr(text);
                return `<div style="white-space: pre-wrap;">${text}</div>`;
            }

            const blocks = text.split('\n\n');
            const renderablePart = blocks.slice(0, -1).join('\n\n');
            const remainingPart = blocks.slice(-1).join('\n\n');

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

            if (remainingPart) {
                html += `<div class="${styles.streamingText || ''}">${window.Lute.EscapeHTMLStr(remainingPart)}</div>`;
            }
            return html;
        } else {
            //@ts-ignore
            const html = lute.Md2HTML(text);
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

