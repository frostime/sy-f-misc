import { Component, For, onMount } from 'solid-js';
import { useSignalRef } from '@frostime/solid-signal-ref';

import MessageItem from './MessageItem';
import styles from './ChatBox.module.scss';

import * as gpt from '../gpt';


const useSessionMessages = () => {
    
}


const ChatSession: Component = () => {
    const input = useSignalRef<string>('');
    const messages = useSignalRef<IMessage[]>([]);
    const loading = useSignalRef<boolean>(false);

    const streamingReply = useSignalRef<string>('');

    let textareaRef: HTMLTextAreaElement;
    let messageListRef: HTMLDivElement;

    const scrollToBottom = () => {
        if (messageListRef) {
            messageListRef.scrollTop = messageListRef.scrollHeight;
        }
    };

    const adjustTextareaHeight = () => {
        const textarea = textareaRef;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };


    onMount(() => {
        adjustTextareaHeight();
        textareaRef?.focus();
    });

    const sendMessage = async (e: Event) => {
        e.preventDefault();
        const userMessage = input().trim();
        if (!userMessage) return;

        messages.update(prev => [...prev, { role: 'user', content: userMessage }]);
        scrollToBottom();
        input.update('');
        loading.update(true);
        adjustTextareaHeight();

        try {
            const reply = await gpt.complete(userMessage, {
                returnRaw: false,
                stream: true,
                streamInterval: 2,
                streamMsg(msg) {
                    streamingReply(msg);
                    scrollToBottom();
                },
            });
            messages.update(prev => [...prev, { role: 'assistant', content: reply }]);
            scrollToBottom();
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

    const ChatContainer = () => (
        <div class={styles.chatContainer}>
            <div class={styles.messageList} ref={messageListRef}>
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

            <form class={styles.inputContainer} onSubmit={sendMessage}>
                <textarea
                    ref={textareaRef}
                    value={input()}
                    onInput={(e) => {
                        input.update(e.currentTarget.value);
                        adjustTextareaHeight();
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
