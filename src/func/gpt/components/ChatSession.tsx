import { Component, createRenderEffect, For, Match, on, onMount, Show, Switch } from 'solid-js';
import { ISignalRef, IStoreRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

import MessageItem from './MessageItem';
import styles from './ChatSession.module.scss';

import * as gpt from '../gpt';
import { defaultConfig, UIConfig, useModel } from '../setting/store';
import { solidDialog } from '@/libs/dialog';
import { ChatSetting } from '../setting';
import Form from '@/libs/components/Form';
import { createSimpleContext } from '@/libs/simple-context';


interface ISimpleContext {
    model: IStoreRef<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    session: ReturnType<typeof useSessionMessages>;
}

const { SimpleProvider, useSimpleContext } = createSimpleContext<ISimpleContext>();

/**
 * 
 */
const useSessionMessages = (props: {
    model: IStoreRef<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    scrollToBottom: () => void;
}) => {
    const systemPrompt = useSignalRef<string>('');
    const messages = useStoreRef<IChatSessionMsgItem[]>([]);
    const loading = useSignalRef<boolean>(false);
    const streamingReply = useSignalRef<string>('');

    const newID = () => {
        return window.Lute.NewNodeID();
    }

    const endWithSeperator = () => {
        if (messages().length === 0) return false;
        return messages()[messages().length - 1].type === 'seperator';
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

    const appendSeperator = () => {
        if (messages().length === 0) return;
        const last = messages()[messages().length - 1];
        if (last.type === 'seperator') return;
        messages.update(prev => [...prev, {
            type: 'seperator',
            id: newID()
        }]);
    }

    const removeSeperator = () => {
        if (messages().length === 0) return;
        const last = messages()[messages().length - 1];
        if (last.type === 'seperator') {
            messages.update(prev => prev.slice(0, -1));
        }
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


    let controller: AbortController;

    const sendMessage = async (userMessage: string) => {
        if (!userMessage.trim()) return;

        appendUserMsg(userMessage);
        loading.update(true);
        streamingReply.update('');
        props.scrollToBottom();

        try {
            controller = new AbortController();
            const reply = await gpt.complete(getAttachedHistory(), {
                model: props.model(),
                systemPrompt: systemPrompt().trim() || undefined,
                returnRaw: false,
                stream: true,
                streamInterval: 2,
                streamMsg(msg) {
                    streamingReply.update(msg);
                    props.scrollToBottom();
                },
                abortControler: controller
            });
            appendAssistantMsg(reply);
            props.scrollToBottom();
        } catch (error) {
            console.error('Error:', error);
        } finally {
            loading.update(false);
            streamingReply.update('');
            controller = null;
        }
    }

    const abortMessage = () => {
        if (loading()) {
            controller && controller.abort();
        }
    }

    return {
        systemPrompt,
        messages,
        loading,
        streamingReply,
        sendMessage,
        abortMessage,
        toggleClearContext: () => {
            if (endWithSeperator()) {
                removeSeperator();
            } else {
                appendSeperator();
            }
            props.scrollToBottom();
        }
    }
}

const Seperator = (props: { title: string }) => (
    <div class={styles['text-seperator']}>
        {props.title}
    </div>
);

const useSessionSetting = () => {
    let context = useSimpleContext();
    let { config, session } = context;

    return (
        <>
            <Form.Wrap
                title="System Prompt"
                description="附带的系统级提示消息"
                direction="row"
            >
                <Form.Input
                    type="textarea"
                    value={session.systemPrompt()}
                    changed={(v) => {
                        session.systemPrompt(v);
                    }}
                    style={{
                        height: '5em'
                    }}
                />
            </Form.Wrap>
            <ChatSetting config={config} />
        </>
    )

}

const ChatSession: Component = (props: {
    input?: ISignalRef<string>;
    systemPrompt?: string;
}) => {
    const model = useModel('siyuan');
    const config = useStoreRef<IChatSessionConfig>({ ...defaultConfig() });

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


    const input = useSignalRef<string>('');
    const session = useSessionMessages({ model, config, scrollToBottom });

    if (props.systemPrompt) {
        session.systemPrompt(props.systemPrompt);
    }

    /**
     * 当外部的 input signal 变化的时候，自动添加到文本框内
     */
    createRenderEffect(on(props.input.signal, (text: string) => {
        if (!text) return;
        input.value += text;
        //可能在 DOM 创建之前被调用
        if (textareaRef) {
            focusTextarea();
        }
    }));


    /**
     * 外部输入的
     * @returns 
     */
    const focusTextarea = () => {
        adjustTextareaHeight();
        setTimeout(() => {
            textareaRef.focus();
            //scroll 到当前光标的位置
            textareaRef.scrollTop = 0;
            textareaRef.selectionStart = 0;
            textareaRef.selectionEnd = 0;
        }, 0);
    }

    onMount(() => {
        focusTextarea();
    });

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        const userMessage = input().trim();
        if (!userMessage) return;

        input.update('');
        adjustTextareaHeight();
        await session.sendMessage(userMessage);
        scrollToBottom();
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleSubmit(e);
        }
    }

    const ToolbarLabel = (props: { children: any }) => (
        <span class="b3-label__text b3-button b3-button--outline" style={{
            'box-shadow': 'inset 0 0 0 .6px var(--b3-theme-primary)',
        }}>
            {props.children}
        </span>
    )

    const openSetting = () => {
        solidDialog({
            title: '当前对话设置',
            loader: () => (
                <SimpleProvider state={{ model, config, session }}>
                    {useSessionSetting()}
                </SimpleProvider>
            ),
            width: '1000px',
            height: '600px'
        })
    }

    const styleVars = () => {
        return {
            '--chat-input-font-size': `${UIConfig().inputFontsize}px`,
            '--chat-message-font-size': `${UIConfig().msgFontsize}px`,
            '--chat-max-width': `${UIConfig().maxWidth}px`,
        };
    };

    const ChatContainer = () => (
        <div class={styles.chatContainer} style={styleVars()}>
            <div class={styles.messageList} ref={messageListRef}>
                <For each={session.messages()}>
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
                {session.loading() && (
                    <>
                        <Seperator title="正在思考中..." />
                        <MessageItem message={{ role: 'assistant', content: session.streamingReply() }} />
                    </>
                )}
            </div>

            <section class={styles.inputContainer} onSubmit={handleSubmit}>
                <div class={styles.toolbar}>
                    <Show when={session.loading()}>
                        <button class="b3-button b3-button--outline" onClick={session.abortMessage} >
                            <svg>
                                <use href="#iconPause" />
                            </svg>
                        </button>
                    </Show>
                    <button class="b3-button b3-button--outline" onClick={session.toggleClearContext} >
                        🧹
                    </button>
                    <button class="b3-button b3-button--outline" onClick={openSetting}>
                        ⚙️
                    </button>
                    <div style={{ flex: 1 }}></div>
                    <Show when={session.systemPrompt().trim()}>
                        <ToolbarLabel>✅ System Prompt</ToolbarLabel>
                    </Show>
                    <ToolbarLabel>{input().length}</ToolbarLabel>
                    <ToolbarLabel>附带消息: {config().attachedHistory}</ToolbarLabel>
                    <ToolbarLabel>{model().model}</ToolbarLabel>
                </div>
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
                <button
                    type="submit"
                    class={`${styles.sendButton} b3-button`}
                    disabled={session.loading()}
                    onclick={handleSubmit}
                >
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
            <SimpleProvider state={{
                model,
                config,
                session
            }}>
                <ChatContainer />
            </SimpleProvider>
        </div>
    );
};

export default ChatSession;
