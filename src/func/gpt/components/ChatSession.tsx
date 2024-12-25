/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 17:13:44
 * @FilePath     : /src/func/gpt/components/ChatSession.tsx
 * @LastEditTime : 2024-12-26 00:47:20
 * @Description  : 
 */
import { Accessor, Component, createMemo, For, Match, on, onMount, Show, Switch, createRenderEffect, JSX, onCleanup, createEffect } from 'solid-js';
import { ISignalRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

import MessageItem from './MessageItem';
import styles from './ChatSession.module.scss';

import { defaultConfig, UIConfig, useModel, defaultModelId, listAvialableModels, promptTemplates } from '../setting/store';
import { solidDialog } from '@/libs/dialog';
import Form from '@/libs/components/Form';
import { Menu } from 'siyuan';
import { confirmDialog, inputDialog } from '@frostime/siyuan-plugin-kits';
import { render } from 'solid-js/web';
import * as persist from '../persistence';
import HistoryList from './HistoryList';
import { SvgSymbol } from './Elements';
import { removeDoc } from '@/api';

import { useSession, useSessionSetting, SimpleProvider } from './UseSession';



const ChatSession: Component = (props: {
    input?: ISignalRef<string>;
    systemPrompt?: string;
    history?: IChatSessionHistory;
    updateTitleCallback?: (title: string) => void;
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

    if (props.history) {
        session.applyHistory(props.history);
    }

    createEffect(() => {
        if (props.updateTitleCallback) {
            props.updateTitleCallback(session.title());
        }
    });

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

    const openHistoryList = (e: MouseEvent) => {
        const showHistory = (historyList: IChatSessionHistory[], onremove?: (id: string, callback: () => void) => void) => {
            const { close } = solidDialog({
                title: '历史记录',
                loader: () => (
                    <SimpleProvider state={{ model, config, session }}>
                        <HistoryList
                            history={historyList}
                            onclick={(history: IChatSessionHistory) => {

                                if (session.messages().length > 0) {
                                    persist.saveToLocalStorage(session.sessionHistory());
                                }
                                session.applyHistory(history);
                                close();
                            }}
                            onremove={onremove}
                        />
                    </SimpleProvider>
                ),
                width: '600px',
                height: '600px'
            });
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        let menu = new Menu();
        menu.addItem({
            icon: 'iconHistory',
            label: '缓存记录',
            click: () => {
                let historyList = persist.listFromLocalStorage()
                showHistory(historyList, (id: string, callback: Function) => {
                    persist.removeFromLocalStorage(id);
                    callback();
                });
            }
        });
        menu.addItem({
            icon: 'iconSiYuan',
            label: '归档记录',
            click: async () => {
                let historyList = await persist.listFromJson();
                showHistory(historyList, async (id: string, callback: Function) => {
                    let history = historyList.find(history => history.id === id);
                    let title = history.title;
                    let syDoc = await persist.findBindDoc(id);

                    confirmDialog({
                        title: `确认删除记录 ${title}@${id}?`,
                        content: `<div class="fn__flex" style="gap: 10px;">
                            <p style="flex: 1;">同时删除思源文档 ${syDoc?.hpath ?? '未绑定'}?</p>
                            <input type="checkbox" class="b3-switch" />
                        </div>
                        `,
                        confirm: async (ele: HTMLElement) => {
                            persist.removeFromJson(id);
                            const checkbox = ele.querySelector('input') as HTMLInputElement;
                            if (checkbox.checked) {
                                // showMessage(`正在删除思源文档 ${id}...`);
                                if (syDoc.id) {
                                    await removeDoc(syDoc.box, syDoc.path);
                                }
                            }
                            callback();
                        }
                    })
                });
            }
        });
        menu.open({
            x: e.clientX,
            y: e.clientY,
            isLeft: true
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
                    onclick={(e: MouseEvent) => {
                        // persist.persistHistory(session.sessionHistory())
                        e.stopPropagation();
                        e.preventDefault();
                        let menu = new Menu();
                        menu.addItem({
                            icon: 'iconSiYuan',
                            label: '保存到思源中',
                            click: () => {
                                persist.persistHistory(session.sessionHistory());
                            }
                        });
                        menu.addItem({
                            icon: 'iconMarkdown',
                            label: '显示为 Markdown',
                            click: () => {
                                inputDialog({
                                    title: '导出对话',
                                    defaultText: persist.itemsToMarkdown(session.messages()),
                                    type: 'textarea',
                                    'width': '800px',
                                    'height': '700px'
                                })
                            }
                        });
                        const target = e.target as HTMLElement;
                        const rect = target.getBoundingClientRect();
                        menu.open({
                            x: rect.left,
                            y: rect.bottom
                        })
                    }}
                    label='导出对话'
                    icon='iconUpload'
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

    const Seperator = (props: { title: string, id?: string }) => (
        <div class={styles['text-seperator']}>
            {props.title}
            {
                (props.id && (
                    <span data-type="button" onclick={() => {
                        //删除指定 id 的 seperator
                        session.messages.update((oldList: IChatSessionMsgItem[]) => {
                            return oldList.filter((i) => i.id !== props.id);
                        });
                    }}>
                        <SvgSymbol size="10px">iconClose</SvgSymbol>
                    </span>
                ))
            }
        </div>
    );

    const ChatContainer = () => (
        <div class={styles.chatContainer} style={styleVars()}>
            {/* 添加顶部工具栏 */}
            <Topbar />

            <div class={styles.messageList} ref={messageListRef}>
                <For each={session.messages()}>
                    {(item: IChatSessionMsgItem, index: Accessor<number>) => (
                        <Switch fallback={<></>}>
                            <Match when={item.type === 'message'}>
                                {/* 如果是正在流式输出的消息，在其上方显示分隔符 */}
                                {item.loading === true && (
                                    <Seperator title="正在思考中..." />
                                )}
                                <MessageItem
                                    messageItem={item}
                                    markdown={item.loading !== true} // 流式输出时禁用 markdown
                                    updateIt={(message) => {
                                        if (session.loading()) return;
                                        session.messages.update(index(), 'message', 'content', message);
                                    }}
                                    deleteIt={() => {
                                        if (session.loading()) return;
                                        session.messages.update((oldList: IChatSessionMsgItem[]) => {
                                            return oldList.filter((i) => i.id !== item.id);
                                        })
                                    }}
                                    rerunIt={() => {
                                        if (session.loading()) return;
                                        session.reRunMessage(index());
                                    }}
                                />
                            </Match>
                            <Match when={item.type === 'seperator'}>
                                <Seperator title="新的对话" id={item.id} />
                            </Match>
                        </Switch>
                    )}
                </For>
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
