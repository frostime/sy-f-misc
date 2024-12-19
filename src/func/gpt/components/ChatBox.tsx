import { Component, For } from 'solid-js';
import { useSignalRef } from '@frostime/solid-signal-ref';

import styles from './ChatBox.module.scss';

import { gpt } from '../gpt';

interface IMessage {
    role: 'user' | 'assistant';
    content: string;
}

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
        <div class={styles.messageWrapper}>
            {props.message.role === 'user' ? (
                <div class={styles.icon}><IconUser /></div>
            ) : (
                <div class={styles.icon}><IconAssistant /></div>
            )}
            <div class={styles.messageContainer}>
                <div
                    class={`${styles.message} ${styles[props.message.role]} b3-typography`}
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


const ChatSession: Component = () => {
    const input = useSignalRef<string>('');
    const messages = useSignalRef<IMessage[]>([]);
    const loading = useSignalRef<boolean>(false);

    const streamingReply = useSignalRef<string>('');

    let textareaRef: HTMLTextAreaElement;

    const sendMessage = async (e: Event) => {
        e.preventDefault();
        const userMessage = input().trim();
        if (!userMessage) return;

        messages.update(prev => [...prev, { role: 'user', content: userMessage }]);
        input.update('');
        loading.update(true);

        try {
            // 这里替换为实际的 API 调用
            const reply = await gpt(userMessage, {
                returnRaw: false,
                stream: true,
                streamInterval: 2,
                streamMsg(msg) {
                    streamingReply(msg);
                },
            });
            messages.update(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            loading.update(false);
            streamingReply('');
        }
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopImmediatePropagation();
                sendMessage(e);
            }
        }
    }

    const adjustTextareaHeight = (e: Event) => {
        const textarea = textareaRef;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    const ChatContainer = () => (
        <div class={styles.chatContainer}>
            <div class={styles.messageList}>
                <For each={messages()}>
                    {(message) => (
                        <MessageItem message={message} markdown={true} />
                    )}
                </For>
                {loading() && (
                    <>
                        <div class={styles.loading}>正在思考...</div>
                        <MessageItem message={{ role: 'assistant', content: streamingReply() }} />
                    </>
                )}
            </div>

            <form class={styles.inputForm} onSubmit={sendMessage}>
                <textarea
                    ref={textareaRef}
                    value={input()}
                    onInput={(e) => {
                        input.update(e.currentTarget.value);
                        adjustTextareaHeight(e);
                    }}
                    placeholder="输入消息..."
                    class={`${styles.input}`}
                    onKeyDown={onKeyDown}
                    style={{
                        'resize': 'none'
                    }}
                />
                <button type="submit" class={`${styles.sendButton} b3-button`} disabled={loading()}>
                    🚀
                </button>
            </form>
        </div>
    );

    return (
        <div style={{
            "display": "flex",
            "justify-content": "center",
            "width": "100%",
            "height": "100%"
        }}>
            <ChatContainer />
        </div>
    );
};

export default ChatSession;
