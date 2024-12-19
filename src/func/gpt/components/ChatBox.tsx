import { Component, For } from 'solid-js';
import { useSignalRef } from '@frostime/solid-signal-ref';

import styles from './ChatBox.module.scss';

import { gpt } from '../gpt';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

const ChatSession: Component = () => {
    const input = useSignalRef<string>('');
    const messages = useSignalRef<Message[]>([]);
    const loading = useSignalRef<boolean>(false);

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
                returnRaw: false
            });

            messages.update(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            loading.update(false);
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
                        <div class={`${styles.message} ${styles[message.role]}`}>
                            {message.content}
                        </div>
                    )}
                </For>
                {loading() && <div class={styles.loading}>正在思考...</div>}
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
                    发送
                </button>
            </form>
        </div>
    );

    return (
        <div style={{
            "display": "flex",
            "justify-content": "center",
            "width": "100%",
            "height": "95%"
        }}>
            <ChatContainer />
        </div>
    );
};

export default ChatSession;
