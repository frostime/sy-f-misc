import { Component,  } from 'solid-js';

import styles from './MessageItem.module.scss';

const lute = window.Lute.New();


const MessageItem: Component<{ message: IMessage, markdown?: boolean }> = (props) => {

    const message = () => {
        if (props.markdown) {
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
                        'white-space': 'pre-wrap'
                    }}
                    innerHTML={message()}
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
