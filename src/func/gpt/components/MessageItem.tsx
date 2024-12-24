import { Component, onMount, Show } from 'solid-js';
import { formatDateTime, getLute, html2ele, inputDialog } from "@frostime/siyuan-plugin-kits";

import styles from './MessageItem.module.scss';
import { addScript, addStyle, convertMathFormulas } from '../utils';
import { Constants, showMessage } from 'siyuan';
import { defaultConfig } from '../setting/store';

const useCodeToolbar = (language: string, code: string) => {
    let html = `
    <div class="${styles['code-toolbar']}">
        <div class="fn__flex-1"></div>
        <span class="b3-label__text" style="font-family: var(--b3-font-family-code); margin: 0px;">
            ${language}
        </span>
        <button
            class="${styles.toolbarButton} b3-button b3-button--text"
            style="padding: 0;"
            title="复制"
        >
            <svg><use href="#iconCopy" /></svg>
        </button>
    </div>
    `;
    let ele = html2ele(html);
    ele.querySelector('button').onclick = () => {
        navigator.clipboard.writeText(code);
    }
    return ele;
}

const initHljs = async () => {
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

const initKatex = async () => {
    if (window.katex) return;
    // https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/render/mathRender.ts
    const cdn = Constants.PROTYLE_CDN;
    addStyle(`${cdn}/js/katex/katex.min.css`, "protyleKatexStyle");
    await addScript(`${cdn}/js/katex/katex.min.js`, "protyleKatexScript");
    return window.hljs !== undefined && window.hljs !== null;
}

const renderCodeblock = (ele: HTMLElement) => {
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
    if (['markdown', 'md', 'text', 'plaintext', 'tex'].includes(language)) {
        ele.style.whiteSpace = 'pre-wrap';
    }
    // pre.style.marginTop = '0';
    Object.assign(pre.style, {
        'margin-top': 0,
        'white-space': 'pre'
    })
}

const renderMathBlock = (element: HTMLElement) => {
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

const MessageItem: Component<{
    messageItem: IChatSessionMsgItem, markdown?: boolean,
    updateIt?: (message: string) => void,
    deleteIt?: () => void,
    rerunIt?: () => void
}> = (props) => {

    let lute = getLute();

    let msgRef: HTMLDivElement;

    const renderCode = async () => {
        const codeBlocks = msgRef.querySelectorAll('pre>code');
        if (codeBlocks.length === 0) {
            return;
        }
        if (!window.hljs) {
            await initHljs();
        }
        if (window.hljs) {
            codeBlocks.forEach((ele: HTMLElement) => {
                renderCodeblock(ele);
            });
        }
    }

    const renderMath = async () => {
        let mathElements: HTMLElement[] = Array.from(msgRef.querySelectorAll('.language-math'));

        if (mathElements.length === 0) {
            return;
        }

        if (!window.katex) {
            await initKatex();
        }

        // 遍历所有数学公式元素并渲染
        mathElements.forEach((element) => {
            renderMathBlock(element);
        });
    }

    onMount(async () => {
        //仅仅只在需要配置调整 Lute 渲染的 markdown 内容时才会执行
        if (props.markdown !== true) return;
        renderCode();
        renderMath();
    });

    const markdownContent = () => {
        let text = props.messageItem.message.content;
        if (defaultConfig().convertMathSyntax) {
            text = convertMathFormulas(text);
        }
        return text;
    }

    const message = () => {
        if (props.markdown) {
            let text = markdownContent();
            //@ts-ignore
            let html = lute.Md2HTML(text);
            return html;
        }
        return props.messageItem.message.content;
    }

    // #iconAccount
    const IconUser = () => (
        <svg>
            <use href="#iconAccount" />
        </svg>
    );

    const IconAssistant = () => (
        <svg>
            <use href="#iconGithub" />
        </svg>
    );

    const editMessage = () => {
        inputDialog({
            title: '编辑消息',
            defaultText: markdownContent(),
            confirm: (text) => {
                props.updateIt?.(text);
            },
            'type': 'textarea',
            width: '700px',
            height: '500px'
        });
    }

    const copyMessage = () => {
        try {
            // 强制将焦点设置到文档的 body 元素上
            document.body.focus();
            navigator.clipboard.writeText(markdownContent());
            showMessage('已复制到剪贴板');
        } catch (error) {
            console.error('剪贴板操作失败:', error);
            showMessage('复制失败，请重试');
        }
    };

    const deleteMessage = () => {
        props.deleteIt?.();
    }

    const rerunMessage = () => {
        props.rerunIt?.();
    }

    const ToolbarButton = (props: {
        icon: string, title?: string, onclick: (e?: MouseEvent) => void
    }) => {
        return (
            <button
                class={`${styles.toolbarButton} b3-button b3-button--text`}
                onclick={(e) => {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    props.onclick(e);
                }}
                title={props.title}
            >
                <svg><use href={`#${props.icon}`} /></svg>
            </button>
        );
    }

    return (
        <div class={styles.messageItem} data-role={props.messageItem.message.role}>
            {props.messageItem.message.role === 'user' ? (
                <div class={styles.icon}><IconUser /></div>
            ) : (
                <div class={styles.icon}><IconAssistant /></div>
            )}
            <div class={styles.messageContainer}>
                <div
                    class={`${styles.message} ${styles[props.messageItem.message.role]} b3-typography`}
                    style={{
                        'white-space': props.markdown ? '' : 'pre'
                    }}
                    innerHTML={message()}
                    ref={msgRef}
                />
                <div class={styles.toolbar}>
                    <span>
                        {formatDateTime(null, new Date(props.messageItem.timestamp))}
                    </span>
                    <span>
                        {props.messageItem.author}
                    </span>

                    <div class="fn__flex-1" />
                    <Show when={props.messageItem.token}>
                        <span class="counter" style={{ padding: 0 }}>Token: {props.messageItem.token}</span>
                    </Show>
                    <ToolbarButton icon="iconEdit" title="编辑" onclick={editMessage} />
                    <ToolbarButton icon="iconCopy" title="复制" onclick={copyMessage} />
                    <ToolbarButton icon="iconTrashcan" title="删除" onclick={(e: MouseEvent) => {
                        // Ctrl + 点击
                        if (e.ctrlKey) {
                            deleteMessage();
                        } else {
                            showMessage('如果想要删除此消息，请按 Ctrl + 点击');
                        }
                    }} />
                    <ToolbarButton icon="iconRedo" title="重新运行" onclick={(e: MouseEvent) => {
                        // Ctrl + 点击
                        if (e.ctrlKey) {
                            rerunMessage();
                        } else {
                            showMessage('如果想要重新运行，请按 Ctrl + 点击');
                        }
                    }} />
                </div>
            </div>
        </div>
    )
}

export default MessageItem;
