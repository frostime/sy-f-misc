import { Component, onMount } from 'solid-js';
import { getLute, html2ele } from "@frostime/siyuan-plugin-kits";

import styles from './MessageItem.module.scss';
import { addScript, addStyle } from '../utils';
import { Constants } from 'siyuan';

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

const MessageItem: Component<{ message: IMessage, markdown?: boolean }> = (props) => {

    let lute = getLute();

    let msgRef: HTMLDivElement;

    onMount(async () => {
        //仅仅只在需要配置调整 Lute 渲染的 markdown 内容时才会执行
        if (props.markdown !== true) return;
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
    });

    const message = () => {
        if (props.markdown) {
            //@ts-ignore
            let html = lute.Md2HTML(props.message.content);
            return html;
        }
        return props.message.content;
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

    const copyMessage = () => {
        navigator.clipboard.writeText(props.message.content);
    };

    return (
        <div class={styles.messageItem} data-role={props.message.role}>
            {props.message.role === 'user' ? (
                <div class={styles.icon}><IconUser /></div>
            ) : (
                <div class={styles.icon}><IconAssistant /></div>
            )}
            <div class={styles.messageContainer}>
                <div
                    class={`${styles.message} ${styles[props.message.role]} b3-typography`}
                    style={{
                        'white-space': props.markdown ? '' : 'pre-line'
                    }}
                    innerHTML={message()}
                    ref={msgRef}
                />
                <div class={styles.toolbar}>
                    <button
                        class={`${styles.toolbarButton} b3-button b3-button--text`}
                        onClick={copyMessage}
                        title="复制"
                    >
                        <svg><use href="#iconCopy" /></svg>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default MessageItem;
