import { Accessor, Component, createMemo, createRenderEffect, For, Match, on, onMount, Show, Switch } from 'solid-js';
import { ISignalRef, IStoreRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

import MessageItem from './MessageItem';
import styles from './ChatSession.module.scss';

import * as gpt from '../gpt';
import { defaultConfig, UIConfig, useModel, defaultModelId, listAvialableModels, promptTemplates } from '../setting/store';
import { solidDialog } from '@/libs/dialog';
import { ChatSetting } from '../setting';
import Form from '@/libs/components/Form';
import { createSimpleContext } from '@/libs/simple-context';
import { Menu } from 'siyuan';
import { inputDialog } from '@frostime/siyuan-plugin-kits';
import { get } from 'http';
import { render } from 'solid-js/web';


interface ISimpleContext {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    session: ReturnType<typeof useSessionMessages>;
}

const { SimpleProvider, useSimpleContext } = createSimpleContext<ISimpleContext>();

/**
 * 
 */
const useSessionMessages = (props: {
    model: Accessor<IGPTModel>;
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
        const history = [...messages()];
        const lastMessage = history.pop(); // 弹出最后一条消息（当前输入）

        if (attachedHistory === 0) {
            return [lastMessage!.message!]; // 只返回当前输入的消息
        }

        // 根据 attachedHistory 截取历史消息
        const lastMessages = attachedHistory > 0 ? history.slice(-attachedHistory) : history;
        const lastSeperatorIndex = lastMessages.findIndex(item => item.type === 'seperator');

        let attachedMessages: IChatSessionMsgItem[] = [];

        if (lastSeperatorIndex === -1) {
            attachedMessages = lastMessages.filter(item => item.type === 'message');
        } else {
            attachedMessages = lastMessages.slice(lastSeperatorIndex + 1).filter(item => item.type === 'message');
        }

        return [...attachedMessages, lastMessage].map(item => item.message!);
    }


    let controller: AbortController;

    const sendMessage = async (userMessage: string) => {
        if (!userMessage.trim()) return;

        // 里面有 </Context>
        const hasContext = userMessage.includes('</Context>');

        let sysPrompt = systemPrompt().trim() || '';
        if (hasContext) {
            sysPrompt += 'Note: <Context>...</Context> 是附带的上下文信息，只关注其内容，不要将 <Context> 标签作为正文的一部分';
        }

        appendUserMsg(userMessage);
        loading.update(true);
        streamingReply.update('');
        props.scrollToBottom();

        try {
            controller = new AbortController();
            const msgToSend = getAttachedHistory();
            // console.log(msgToSend);
            const reply = await gpt.complete(msgToSend, {
                model: props.model(),
                systemPrompt: sysPrompt || undefined,
                returnRaw: false,
                stream: true,
                streamInterval: 2,
                streamMsg(msg) {
                    streamingReply.update(msg);
                    props.scrollToBottom();
                },
                abortControler: controller,
                option: props.config()
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

    const availableSystemPrompts = (): Record<string, string> => {
        const systemPrompts = promptTemplates().filter(item => item.type === 'system');
        return systemPrompts.reduce((acc, cur) => {
            acc[cur.content] = cur.name;
            return acc;
        }, { '': 'No Prompt' });
    }

    return (
        <div class="fn__flex-1">
            <Form.Wrap
                title="System Prompt"
                description="附带的系统级提示消息"
                direction="row"
                action={
                    <Form.Input
                        type="select"
                        value={""}
                        changed={(v) => {
                            v = v.trim();
                            if (v) {
                                session.systemPrompt(v);
                            }
                        }}
                        options={availableSystemPrompts()}
                    />
                }
            >
                <Form.Input
                    type="textarea"
                    value={session.systemPrompt()}
                    changed={(v) => {
                        session.systemPrompt(v);
                    }}
                    style={{
                        height: '7em',
                        "font-size": UIConfig().inputFontsize + "px",
                        "line-height": "1.35"
                    }}
                />
            </Form.Wrap>
            <ChatSetting config={config} />
        </div>
    )

}

const ChatSession: Component = (props: {
    input?: ISignalRef<string>;
    systemPrompt?: string;
}) => {
    const modelId = useSignalRef(defaultModelId());
    const model = createMemo(() => useModel(modelId()));
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

    const useUserPrompt = (e: MouseEvent) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        const userPrompts = promptTemplates().filter(item => item.type === 'user');
        if (userPrompts.length === 0) return;

        let menu = new Menu();
        userPrompts.forEach((prompt) => {
            menu.addItem({
                icon: null,
                label: prompt.name,
                click: () => {
                    input.value = (prompt.content + '\n\n' + input.value).trim();
                    let pos = prompt.content.length + 2;
                    textareaRef.focus();
                    textareaRef.setSelectionRange(pos, pos);
                    adjustTextareaHeight();
                }
            });
        });
        menu.open({
            x: e.clientX,
            y: e.clientY,
            isLeft: false
        });
    }

    const slideAttachHistoryCnt = (e: MouseEvent) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        const contaner = document.createElement('div');
        render(() => (
            <Form.Input
                type="slider"
                fn_size={false}
                value={config().attachedHistory}
                changed={(v) => {
                    config.update('attachedHistory', v);
                }}
                slider={{
                    min: -1,
                    max: 16,
                    step: 1,
                }}
            />
        ), contaner);
        let menu = new Menu();
        menu.addItem({
            element: contaner
        });
        let targetElement = e.target as HTMLElement;
        let rect = targetElement.getBoundingClientRect();
        menu.open({
            x: rect.left,
            y: rect.bottom,
            isLeft: false
        });
    }

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

    const ToolbarLabel = (props: { children: any, maxWidth?: string, onclick?: (e: MouseEvent) => void }) => (
        <span
            onclick={props.onclick}
            class="b3-label__text b3-button b3-button--outline"
            style={{
                'box-shadow': 'inset 0 0 0 .6px var(--b3-theme-primary)',
                'max-width': props.maxWidth || '15em',
                'overflow': 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap',
                display: 'inline-block',
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
                        <ToolbarLabel onclick={session.abortMessage} >
                            <svg>
                                <use href="#iconPause" />
                            </svg>
                        </ToolbarLabel>
                    </Show>
                    <ToolbarLabel onclick={openSetting}>
                        ⚙️ 设置
                    </ToolbarLabel>
                    <ToolbarLabel onclick={session.toggleClearContext} >
                        🧹 清空上下文
                    </ToolbarLabel>
                    <ToolbarLabel onclick={useUserPrompt}>
                        🖋️ 快速 Prompt
                    </ToolbarLabel>
                    <div style={{ flex: 1 }}></div>
                    <ToolbarLabel onclick={() => {
                        const { dialog } = inputDialog({
                            title: '系统提示',
                            defaultText: session.systemPrompt(),
                            type: 'textarea',
                            confirm: (text) => {
                                session.systemPrompt(text);
                            },
                            width: '600px',
                            height: '400px'
                        });
                        const textarea = dialog.element.querySelector('textarea');
                        if (textarea) {
                            textarea.style.fontSize = `${UIConfig().inputFontsize}px`;
                            textarea.style.lineHeight = '1.35';
                            textarea.focus();
                        }
                    }}>
                        {session.systemPrompt().length > 0 ? `✅ ` : ''}System
                    </ToolbarLabel>
                    <ToolbarLabel>
                        字数: {input().length}
                    </ToolbarLabel>
                    <ToolbarLabel onclick={slideAttachHistoryCnt}>
                        附带消息: {config().attachedHistory}
                    </ToolbarLabel>
                    <ToolbarLabel maxWidth='10em'
                        onclick={(e: MouseEvent) => {
                            e.stopImmediatePropagation();
                            e.preventDefault();
                            let menu = new Menu();
                            Object.entries(listAvialableModels()).forEach(([id, name]) => {
                                menu.addItem({
                                    icon: id === modelId() ? 'iconSelect' : null,
                                    label: name,
                                    click: () => {
                                        modelId.value = id;
                                    }
                                });
                            });
                            menu.open({
                                x: e.clientX,
                                y: e.clientY
                            });
                        }}
                    >
                        {model().model}
                    </ToolbarLabel>
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
