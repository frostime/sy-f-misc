import { Accessor, Component, createMemo, For, Match, on, onMount, Show, Switch, createRenderEffect, batch, JSX, onCleanup } from 'solid-js';
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
import { render } from 'solid-js/web';
import * as persist from '../persistence';
import HistoryList from './HistoryList';
import { SvgSymbol } from './Elements';


interface ISimpleContext {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    session: ReturnType<typeof useSession>;
}

const { SimpleProvider, useSimpleContext } = createSimpleContext<ISimpleContext>();

/**
 * 
 */
const useSession = (props: {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    scrollToBottom: () => void;
}) => {
    let sessionId = window.Lute.NewNodeID();

    const systemPrompt = useSignalRef<string>('');

    let timestamp = new Date().getTime();
    const title = useSignalRef<string>('新的对话');
    const messages = useStoreRef<IChatSessionMsgItem[]>([]);
    const loading = useSignalRef<boolean>(false);
    const streamingReply = useSignalRef<string>('');

    let hasStarted = false;

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
            timestamp: new Date().getTime(),
            author: 'user',
            message: {
                role: 'user',
                content: msg
            }
        }]);
    }

    const appendAssistantMsg = (model: string, msg: string) => {
        messages.update(prev => [...prev, {
            type: 'message',
            id: newID(),
            timestamp: new Date().getTime(),
            author: model,
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

    const getAttachedHistory = (attachedHistory?: number) => {
        if (attachedHistory === undefined) {
            attachedHistory = props.config().attachedHistory;
        }
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

    // src/func/gpt/components/ChatSession.tsx
    const gptOption = () => {
        let option = { ...props.config().chatOption };
        return option;
    }

    const customComplete = async (messageToSend: IMessage[] | string, stream: boolean = false) => {
        try {
            let model = props.model();
            const { content } = await gpt.complete(messageToSend, {
                model: model,
                option: gptOption(),
                stream: stream,
            });
            return content;
        } catch (error) {
            console.error('Error:', error);
        }
    }

    const autoGenerateTitle = async () => {
        let attachedHistory = props.config().attachedHistory;
        attachedHistory = Math.max(attachedHistory, 2);
        attachedHistory = Math.min(attachedHistory, 6);
        const histories = getAttachedHistory(attachedHistory);
        if (histories.length == 0) return;
        let sizeLimit = props.config().maxInputLenForAutoTitle;
        let averageLimit = Math.floor(sizeLimit / histories.length);

        let inputContent = histories.map(item => {
            let clippedContent = item.content.substring(0, averageLimit);
            if (clippedContent.length < item.content.length) {
                clippedContent += '...(clipped as too long)'
            }
            return `<${item.role}>:\n${clippedContent}`;
        }).join('\n\n');
        const messageToSend = `
请根据以下对话生成唯一一个最合适的对话主题标题，字数控制在 15 字之内; 除了标题之外不要回复任何别的信息
---
${inputContent}
`.trim();
        const newTitle = await customComplete(messageToSend);
        if (newTitle?.trim()) {
            title.update(newTitle.trim());
        }
    }

    /**
     * 首先检查 index 是否在合法范围内
     * 确认无误
     * 如果为 user 信息，则同 sendMessage 逻辑一样，把 user 消息当作最新的输入，获得的 gpt 结果
     *  - 如果下一条本来就是 assistant 信息，则直接替换
     *  - 如果下一条是 user 信息，则插入一条新的 assistant 信息
     * 如果为 assistant 信息
     *  - 如果他的上一条为 user 信息，则等价于上面的情况，也就是最后会更新他自己
     *  - 如果他的上一条为 assistant 信息，则拒绝执行 rerun，并showMessage 报错
     */
    const reRunMessage = async (atIndex: number) => {

    };

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
            let model = props.model();
            let option = gptOption();
            if (option.stream === false) {
                streamingReply.update('请求中，请耐心等等');
            }
            const { content, usage } = await gpt.complete(msgToSend, {
                model: model,
                systemPrompt: sysPrompt || undefined,
                stream: option.stream ?? true,
                streamInterval: 2,
                streamMsg(msg) {
                    streamingReply.update(msg);
                    props.scrollToBottom();
                },
                abortControler: controller,
                option: option,
            });
            appendAssistantMsg(model.model, content);

            if (usage) {
                // 为前面两个记录添加 token 信息
                batch(() => {
                    const lastIdx = messages().length - 1;
                    if (lastIdx < 1) return;
                    messages.update(lastIdx, 'token', usage?.completion_tokens);
                    messages.update(lastIdx - 1, 'token', usage?.prompt_tokens);
                });
            }

            props.scrollToBottom();

            //创建标题
            if (!hasStarted) {
                hasStarted = true;
                if (messages().length <= 2) {
                    setTimeout(autoGenerateTitle, 100);
                }
            }

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
        title,
        autoGenerateTitle,
        sendMessage,
        abortMessage,
        toggleClearContext: () => {
            if (endWithSeperator()) {
                removeSeperator();
            } else {
                appendSeperator();
            }
            props.scrollToBottom();
        },
        sessionHistory: (): IChatSessionHistory => {
            return {
                id: sessionId,
                timestamp,
                title: title(),
                items: messages.unwrap()
            }
        },
        applyHistory: (history: IChatSessionHistory) => {
            history.id && (sessionId = history.id);
            history.timestamp && (timestamp = history.timestamp);
            history.title && (title.update(history.title));
            history.items && (messages.update(history.items));
        },
        newSession: () => {
            sessionId = window.Lute.NewNodeID();
            systemPrompt.update('');
            timestamp = new Date().getTime();
            title.update('新的对话');
            messages.update([]);
            loading.update(false);
            streamingReply.update('');
            hasStarted = false;
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

    let textareaRefMaxHeight: number;
    const adjustTextareaHeight = () => {
        if (!textareaRef) return;
        textareaRef.style.height = 'auto'; // 临时设置为 auto，以便获取正确的 scrollHeight
        textareaRef.style.height = textareaRef.scrollHeight + 'px';

        // 获取 max-height 并进行比较
        if (textareaRefMaxHeight === undefined) {
            textareaRefMaxHeight = parseInt(getComputedStyle(textareaRef).maxHeight);
        }
        if (textareaRef.scrollHeight > textareaRefMaxHeight) {
            textareaRef.style.height = textareaRefMaxHeight + 'px';
        }
    };

    const input = useSignalRef<string>('');
    const session = useSession({ model, config, scrollToBottom });

    if (props.systemPrompt) {
        session.systemPrompt(props.systemPrompt);
    }

    const newChatSession = () => {
        if (session.messages().length > 0) {
            persist.saveToLocalStorage(session.sessionHistory());
        }
        session.newSession();
        input.update('');
        adjustTextareaHeight();
        scrollToBottom();
    }

    /**
     * 当外部的 input signal 变化的时候，自动添加到文本框内
     */
    createRenderEffect(on(props.input.signal, (text: string) => {
        if (!text) return;
        input.value += text;
        //刚刚创建的时候，可能还没有 textarea 元素
        if (!textareaRef) return;
        //获取当前 selection 位置
        const selectionStart = textareaRef.selectionStart;
        //需要等待 textarea 调整高度后再设置值
        setTimeout(() => {
            adjustTextareaHeight();
            textareaRef?.focus();
            //重新设置当前光标位置
            textareaRef.setSelectionRange(selectionStart, selectionStart);
        }, 0);
    }));

    onMount(() => {
        adjustTextareaHeight();
        textareaRef.focus();
        //scroll 到当前光标的位置
        textareaRef.scrollTop = 0;
        // 将光标设置在开头位置
        textareaRef.setSelectionRange(0, 0);
    });

    onCleanup(() => {
        if (session.messages().length > 0) {
            persist.saveToLocalStorage(session.sessionHistory());
        }
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
                    v = parseInt(v);
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
        let btn = contaner.closest('button.b3-menu__item') as HTMLButtonElement;
        btn.style.background = 'var(--b3-menu-background) !important';

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

    const ToolbarLabel = (props: {
        children: any, maxWidth?: string,
        onclick?: (e: MouseEvent) => void,
        forceClick?: boolean,
        label?: string,
        styles?: JSX.CSSProperties
    }) => (
        <span
            onclick={(e: MouseEvent) => {
                if (session.loading() && props.forceClick !== true) {
                    return;
                }
                props.onclick(e);
            }}
            class="b3-label__text b3-button b3-button--outline ariaLabel"
            aria-label={props.label}
            style={{
                'box-shadow': 'inset 0 0 0 .6px var(--b3-theme-primary)',
                'max-width': props.maxWidth || '15em',
                'overflow': 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap',
                display: 'flex',
                "align-items": "center",
                ...props.styles
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

    const openHistoryList = () => {
        const { close } = solidDialog({
            title: '历史记录',
            loader: () => (
                <SimpleProvider state={{ model, config, session }}>
                    <HistoryList
                        history={persist.listFromLocalStorage()}
                        onclick={(history: IChatSessionHistory) => {
                            if (session.messages().length > 0) {
                                persist.saveToLocalStorage(session.sessionHistory());
                            }
                            session.applyHistory(history);
                            close();
                        }} />
                </SimpleProvider>
            ),
            width: '600px',
            height: '600px'
        });
    }

    const styleVars = () => {
        return {
            '--chat-input-font-size': `${UIConfig().inputFontsize}px`,
            '--chat-message-font-size': `${UIConfig().msgFontsize}px`,
            '--chat-max-width': `${UIConfig().maxWidth}px`,
        };
    };

    const Topbar = () => {

        const Item = (props: any) => (
            <ToolbarLabel
                onclick={props.onclick ?? (() => { })}
                label={props.label}
                styles={{
                    background: 'var(--chat-bg-color)',
                    color: 'var(--chat-text-color)',
                    border: 'none',
                    'box-shadow': 'none',
                    cursor: props.placeholder ? 'default' : 'pointer',
                }}
            >
                <SvgSymbol size="20px">{props.icon}</SvgSymbol>
            </ToolbarLabel>
        );

        return (
            <div class={styles.topToolbar}>
                <Item
                    onclick={() => {
                        persist.persistHistory(session.sessionHistory())
                    }}
                    label='保存对话'
                    icon='iconDownload'
                />
                {/* Placeholder, 为了保证左右对称 */}
                <Item
                    onclick={() => {
                        session.autoGenerateTitle()
                    }}
                    label='自动生成标题'
                    icon='iconH1'
                />
                <div style={{
                    "display": "flex",
                    flex: 1,
                    "align-items": "center",
                    "justify-content": "center"
                }} onclick={() => {
                    inputDialog({
                        title: '更改标题',
                        defaultText: session.title(),
                        confirm: (text) => {
                            session.title(text);
                        },
                        width: '600px',
                    })
                }}>
                    {session.title()}
                </div>
                <Item
                    onclick={openHistoryList}
                    label='历史记录'
                    icon='iconHistory'
                />
                <Item
                    onclick={newChatSession}
                    label='新建对话'
                    icon='iconAdd'
                />
            </div>
        )
    };

    const ChatContainer = () => (
        <div class={styles.chatContainer} style={styleVars()}>
            {/* 添加顶部工具栏 */}
            <Topbar />

            <div class={styles.messageList} ref={messageListRef}>
                <For each={session.messages()}>
                    {(item: IChatSessionMsgItem, index: Accessor<number>) => (
                        <Switch fallback={<></>}>
                            <Match when={item.type === 'message'}>
                                <MessageItem
                                    messageItem={item}
                                    markdown={true}
                                    updateIt={(message) => {
                                        session.messages.update(index(), 'message', 'content', message);
                                    }}
                                    deleteIt={() => {
                                        session.messages.update((oldList: IChatSessionMsgItem[]) => {
                                            return oldList.filter((i) => i.id !== item.id);
                                        })
                                    }}
                                    rerunIt={() => {
                                        //TODO
                                    }}
                                />
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
                        <MessageItem messageItem={{
                            type: 'message',
                            id: '',
                            token: null,
                            message: { role: 'assistant', content: session.streamingReply() },
                            author: model().model,
                            timestamp: new Date().getTime()
                        }} />
                    </>
                )}
            </div>

            <section class={styles.inputContainer} onSubmit={handleSubmit}>
                <div class={styles.toolbar}>
                    <Show when={session.loading()}>
                        <ToolbarLabel onclick={session.abortMessage} label='暂停' forceClick={true} >
                            <SvgSymbol size="15px">iconPause</SvgSymbol>
                        </ToolbarLabel>
                    </Show>
                    <ToolbarLabel onclick={openSetting} label='设置' >
                        <SvgSymbol size="15px">iconSettings</SvgSymbol>
                    </ToolbarLabel>
                    <ToolbarLabel onclick={session.toggleClearContext} label='清除上下文' >
                        <SvgSymbol size="15px">iconTrashcan</SvgSymbol>
                    </ToolbarLabel>
                    <ToolbarLabel onclick={useUserPrompt} label='使用模板 Prompt' >
                        <SvgSymbol size="15px">iconEdit</SvgSymbol>
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
                    }} label='系统提示' >
                        {session.systemPrompt().length > 0 ? `✅ ` : ''}System
                    </ToolbarLabel>
                    <ToolbarLabel>
                        字数: {input().length}
                    </ToolbarLabel>
                    <ToolbarLabel onclick={slideAttachHistoryCnt} label='更改附带消息条数' >
                        附带消息: {config().attachedHistory}
                    </ToolbarLabel>
                    <ToolbarLabel maxWidth='10em' label='切换模型'
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
                    <SvgSymbol>iconSparkles</SvgSymbol>
                </button>
            </section>
        </div>
    );

    return (
        <div style={{
            "display": "flex",
            // "flex-direction": "column",  //加了之后可能会在 tab 变窄的时候导致溢出..
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
