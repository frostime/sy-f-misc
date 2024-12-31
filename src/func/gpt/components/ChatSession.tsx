/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 17:13:44
 * @FilePath     : /src/func/gpt/components/ChatSession.tsx
 * @LastEditTime : 2024-12-31 13:21:39
 * @Description  : 
 */
import { Accessor, Component, createMemo, For, Match, on, onMount, Show, Switch, createRenderEffect, JSX, onCleanup, createEffect } from 'solid-js';
import { ISignalRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

import MessageItem from './MessageItem';
import styles from './ChatSession.module.scss';

import { defaultConfig, UIConfig, useModel, defaultModelId, listAvialableModels, promptTemplates, visualModel } from '../setting/store';
import { solidDialog } from '@/libs/dialog';
import Form from '@/libs/components/Form';
import { Menu } from 'siyuan';
import { inputDialog, simpleDialog } from '@frostime/siyuan-plugin-kits';
import { render } from 'solid-js/web';
import * as persist from '../persistence';
import HistoryList from './HistoryList';
import { SvgSymbol } from './Elements';

import { useSession, useSessionSetting, SimpleProvider } from './UseSession';



const ChatSession: Component = (props: {
    input?: ISignalRef<string>;
    systemPrompt?: string;
    history?: IChatSessionHistory;
    updateTitleCallback?: (title: string) => void;
}) => {
    const modelId = useSignalRef(defaultModelId());
    const model = createMemo(() => useModel(modelId()));
    //Detach from the solidjs store's reactive system
    let defaultConfigVal = JSON.parse(JSON.stringify(defaultConfig.unwrap()));
    const config = useStoreRef<IChatSessionConfig>(defaultConfigVal);
    const multiSelect = useSignalRef(false);
    const selectedMessages = useSignalRef<Set<string>>(new Set());

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

    const newChatSession = (history?: Partial<IChatSessionHistory>) => {
        if (session.messages().length > 0) {
            persist.saveToLocalStorage(session.sessionHistory());
        }
        session.newSession();
        history && session.applyHistory(history);
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
        styles?: JSX.CSSProperties,
        role?: string
    }) => (
        <span
            onclick={(e: MouseEvent) => {
                if (session.loading() && props.forceClick !== true) {
                    return;
                }
                props.onclick?.(e);
            }}
            class="b3-label__text b3-button b3-button--outline ariaLabel"
            data-role={props.role}
            aria-label={props.label}
            style={{
                'box-shadow': '0 0 3px 1px var(--b3-theme-primary-lighter)',
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
        e.stopImmediatePropagation();
        e.preventDefault();
        const { close } = solidDialog({
            title: '历史记录',
            loader: () => (
                <SimpleProvider state={{ model, config, session, close: () => close() }}>
                    <HistoryList
                        close={() => close()}
                        onclick={(history: IChatSessionHistory) => {
                            if (session.messages().length > 0) {
                                persist.saveToLocalStorage(session.sessionHistory());
                            }
                            session.applyHistory(history);
                        }}
                    />
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
                    ...(props.styles ?? {})
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
                <Item
                    onclick={() => {
                        multiSelect.update(!multiSelect());
                        if (!multiSelect()) {
                            selectedMessages.update(new Set<string>());
                        }
                    }}
                    label='多选'
                    icon='iconCheck'
                    styles={{
                        'background-color': multiSelect() ? 'var(--b3-theme-primary)' : '',
                        'color': multiSelect() ? 'var(--b3-theme-on-primary)' : ''
                    }}
                />
                <Item
                    onclick={() => {
                        session.autoGenerateTitle()
                    }}
                    label='自动生成标题'
                    icon='iconH1'
                />
                <div
                    class={styles.chatTitle}
                    onclick={() => {
                        inputDialog({
                            title: '更改标题',
                            defaultText: session.title(),
                            confirm: (text) => {
                                session.title(text);
                            },
                            width: '600px',
                        })
                    }}
                >
                    {session.title()}
                </div>
                {/* 为了左右对称 */}
                <Item placeholder={true} />
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

    const BatchOperationBar = () => {
        const Button = (props: {
            icon: string;
            label: string;
            onclick: () => void;
        }) => (
            <button
                class="b3-button b3-button--outline"
                onclick={props.onclick}
            >
                <SvgSymbol size="15px">{props.icon}</SvgSymbol>
                {props.label}
            </button>
        );

        const Body = (props: {
            selectedCount: number;
        }) => (
            <div class={styles.batchOperationBar}>
                <span class="counter">已选择 {props.selectedCount} 条消息</span>
                <div class="fn__flex-1" />
                <Button
                    icon="iconCheck"
                    label="全选"
                    onclick={() => {
                        const messageIds = session.messages().map(m => m.id);
                        selectedMessages.update(new Set(messageIds));
                    }}
                />
                <Button
                    icon="iconUndo"
                    label="反选"
                    onclick={() => {
                        const messageIds = session.messages().map(m => m.id);
                        const newSet = new Set(selectedMessages());
                        messageIds.forEach(id => {
                            if (newSet.has(id)) {
                                newSet.delete(id);
                            } else {
                                newSet.add(id);
                            }
                        });
                        selectedMessages.update(newSet);
                    }}
                />
                <Button
                    icon="iconAdd"
                    label="提取为新对话"
                    onclick={() => {
                        const messageIds = Array.from(selectedMessages());
                        const msgItems = session.messages().filter(m => messageIds.includes(m.id));
                        const newSession = {
                            title: '新对话',
                            items: msgItems
                        };
                        newChatSession(newSession);
                        multiSelect.update(false);
                        selectedMessages.update(new Set<string>());
                    }}
                />
                <Button
                    icon="iconTrashcan"
                    label="删除选中消息"
                    onclick={() => {
                        session.messages.update(msgs =>
                            msgs.filter(m => !selectedMessages().has(m.id))
                        );
                        selectedMessages.update(new Set<string>());
                    }}
                />
            </div>
        );

        return (
            <Show when={multiSelect()}>
                <Body selectedCount={selectedMessages().size} />
            </Show>
        )
    };

    const ChatContainer = () => (
        <div class={styles.chatContainer} style={styleVars()}>
            {/* 添加顶部工具栏 */}
            <Topbar />
            <BatchOperationBar />

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
                                        // session.messages.update(index(), 'msgChars', message.length);
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
                                    multiSelect={multiSelect()}
                                    selected={selectedMessages().has(item.id)}
                                    onSelect={(id, selected) => {
                                        const newSet = new Set(selectedMessages());
                                        if (selected) {
                                            newSet.add(id);
                                        } else {
                                            newSet.delete(id);
                                        }
                                        selectedMessages.update(newSet);
                                    }}
                                    toggleSeperator={() => {
                                        if (session.loading()) return;
                                        session.toggleSeperatorAt(index());
                                    }}
                                    toggleHidden={() => {
                                        if (session.loading()) return;
                                        session.toggleHidden(index());
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
                    <ToolbarLabel onclick={session.toggleClearContext} label='新的上下文' >
                        <SvgSymbol size="15px">iconLine</SvgSymbol>
                    </ToolbarLabel>
                    <ToolbarLabel onclick={useUserPrompt} label='使用模板 Prompt' >
                        <SvgSymbol size="15px">iconEdit</SvgSymbol>
                    </ToolbarLabel>
                    <div data-role="spacer" style={{ flex: 1 }}></div>
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
                    }} label='系统提示' data-role="system-prompt" >
                        {session.systemPrompt().length > 0 ? `✅ ` : ''}System
                    </ToolbarLabel>
                    <ToolbarLabel>
                        <span data-hint="true">字数: </span>{input().length}
                    </ToolbarLabel>
                    <ToolbarLabel onclick={slideAttachHistoryCnt} label='更改附带消息条数' >
                        <span data-hint="true">附带消息: </span>{config().attachedHistory}
                    </ToolbarLabel>
                    <ToolbarLabel
                        label={`模型 ${model().model}`}
                        role="model"
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
                <div class={styles.inputWrapper}>
                    <textarea
                        ref={textareaRef}
                        value={input()}
                        onInput={(e) => {
                            input.update(e.currentTarget.value);
                            adjustTextareaHeight();
                        }}
                        onPaste={(e) => {
                            const items = e.clipboardData?.items;
                            if (!items) return;
                            if (!visualModel().includes(model().model)) return;

                            for (let i = 0; i < items.length; i++) {
                                if (items[i].type.indexOf('image') !== -1) {
                                    const blob = items[i].getAsFile();
                                    if (blob) {
                                        session.addAttachment(blob);
                                    }
                                }
                            }
                        }}
                        placeholder="输入消息..."
                        class={`${styles.input}`}
                        onKeyDown={onKeyDown}
                    />
                    <button
                        type="submit"
                        class={`${styles.sendButton} b3-button`}
                        disabled={session.loading()}
                        onclick={handleSubmit}
                    >
                        <SvgSymbol>iconSparkles</SvgSymbol>
                    </button>
                </div>
                <div class={styles.attachmentArea} style={{
                    display: session.attachments()?.length > 0 ? "flex" : "none",
                    "flex-wrap": "wrap",
                    gap: "8px",
                    padding: "8px"
                }}>
                    <For each={session.attachments()}>
                        {(attachment) => (
                            <div class={styles.attachmentItem}>
                                <img
                                    src={URL.createObjectURL(attachment)}
                                    alt="Attachment"
                                    onclick={() => {
                                        // Show full image preview
                                        const img = document.createElement('img');
                                        img.src = URL.createObjectURL(attachment);
                                        img.style.maxWidth = '100%';
                                        img.style.maxHeight = '100%';
                                        simpleDialog({
                                            title: '图片预览',
                                            ele: img,
                                            width: '800px'
                                        });
                                    }}
                                />
                                <button
                                    class="b3-button b3-button--text"
                                    onclick={() => session.removeAttachment(attachment)}
                                >
                                    <svg><use href="#iconTrashcan" /></svg>
                                </button>
                            </div>
                        )}
                    </For>
                </div>
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
