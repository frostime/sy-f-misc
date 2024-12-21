import { Component, onMount } from 'solid-js';
import { getLute, html2ele } from "@frostime/siyuan-plugin-kits";

import styles from './MessageItem.module.scss';

const useCodeToolbar = (language: string, code: string) => {
    let html = `
    <div class="fn__flex" style="gap: 10px; align-items: center; height: 25px;">
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

const MessageItem: Component<{ message: IMessage, markdown?: boolean }> = (props) => {

    let lute = getLute();

    let msgRef: HTMLDivElement;

    onMount(() => {
        if (!window.hljs) return;
        msgRef.querySelectorAll('pre>code').forEach((ele: HTMLElement) => {
            const language = ele.className.replace('language-', '').trim();

            let codeContent = ele.textContent;
            window.hljs.highlightElement(ele);
            let btn = useCodeToolbar(language || 'text', codeContent);
            const pre = ele.parentElement;
            pre.prepend(btn);
            if (['markdown', 'md', 'text', 'plaintext', 'tex'].includes(language)) {
                ele.style.whiteSpace = 'pre-wrap';
            }
            // pre.style.marginTop = '0';
            Object.assign(pre.style, {
                'margin-top': 0,
                'overflow-x': 'auto',
                'white-space': 'pre'
            })
        });
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
