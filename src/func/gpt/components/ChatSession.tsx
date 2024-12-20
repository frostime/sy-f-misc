import { Component, For, Match, onMount, Switch } from 'solid-js';
import { ISignalRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

import MessageItem from './MessageItem';
import styles from './ChatSession.module.scss';

import * as gpt from '../gpt';

/**
 * 
 */
const useSessionMessages = (props: {
    config: ISignalRef<IChatSessionConfig>;
}) => {
    const messages = useStoreRef<IChatSessionMsgItem[]>([]);
    const loading = useSignalRef<boolean>(false);
    const streamingReply = useSignalRef<string>('');

    const newID = () => {
        return window.Lute.NewNodeID();
    }

    const appendUserMsg = (msg: string) => {
        messages.update(prev => [...prev, {
            type: 'message',
            id: newID(),
            message: {
                role: 'user',
                content: msg
            }
        }]);
    }

    const appendAssistantMsg = (msg: string) => {
        messages.update(prev => [...prev, {
            type: 'message',
            id: newID(),
            message: {
                role: 'assistant',
                content: msg
            }
        }]);
    }

    const appendSeperatorMsg = () => {
        messages.update(prev => [...prev, {
            type: 'seperator',
            id: newID()
        }]);
    }

    const getAttachedHistory = () => {
        const { attachedHistory } = props.config();
        const history = messages();
        const lastMessages = history.slice(-attachedHistory);
        const lastSeperatorIndex = lastMessages.findIndex(item => item.type === 'seperator');

        if (lastSeperatorIndex === -1) {
            return lastMessages.filter(item => item.type === 'message')
                .map(item => item.message!);
        } else {
            return lastMessages.slice(lastSeperatorIndex + 1)
                .filter(item => item.type === 'message')
                .map(item => item.message!);
        }
    }

    const sendMessage = async (userMessage: string) => {
        if (!userMessage.trim()) return;

        appendUserMsg(userMessage);
        loading.update(true);
        streamingReply.update('');

        try {
            const reply = await gpt.complete(getAttachedHistory(), {
                returnRaw: false,
                stream: true,
                streamInterval: 2,
                streamMsg(msg) {
                    streamingReply.update(msg);
                }
            });
            appendAssistantMsg(reply);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            loading.update(false);
            streamingReply.update('');
        }
    }

    return {
        messages,
        loading,
        streamingReply,
        sendMessage,
        appendSeperatorMsg
    }
}

const Seperator = (props: { title: string }) => (
    <div class={styles['text-seperator']}>
        {props.title}
    </div>
);

const ChatSession: Component = () => {
    const config = useSignalRef<IChatSessionConfig>({
        provider: null,
        attachedHistory: 3
    });

    const input = useSignalRef<string>('');
    const { messages, loading, streamingReply, sendMessage } = useSessionMessages({ config });

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

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        const userMessage = input().trim();
        if (!userMessage) return;

        input.update('');
        adjustTextareaHeight();
        await sendMessage(userMessage);
        scrollToBottom();
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleSubmit(e);
        }
    }

    const ChatContainer = () => (
        <div class={styles.chatContainer}>
            <div class={styles.messageList} ref={messageListRef}>
                <For each={messages()}>
                    {(item: IChatSessionMsgItem) => (
                        <Switch fallback={<></>}>
                            <Match when={item.type === 'message'}>
                                <MessageItem message={item.message!} markdown={true} />
                            </Match>
                            <Match when={item.type === 'seperator'}>
                                <Seperator title="新的对话" />
                            </Match>
                        </Switch>
                    )

                    }
                </For>
                {loading() && (
                    <>
                        <Seperator title="正在思考中..." />
                        <MessageItem message={{ role: 'assistant', content: streamingReply() }} />
                    </>
                )}
            </div>

            <section class={styles.inputContainer} onSubmit={handleSubmit}>
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
            </section>
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
