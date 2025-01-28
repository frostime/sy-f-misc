/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 17:13:44
 * @FilePath     : /src/func/gpt/components/ChatSession.tsx
 * @LastEditTime : 2025-01-28 21:53:47
 * @Description  : 
 */
import { Accessor, Component, createMemo, For, Match, on, onMount, Show, Switch, createRenderEffect, JSX, onCleanup, createEffect, batch } from 'solid-js';
import { ISignalRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';

import MessageItem from './MessageItem';
import AttachmentList from './AttachmentList';
import styles from './ChatSession.module.scss';

import { defaultConfig, UIConfig, useModel, defaultModelId, listAvialableModels, promptTemplates, visualModel } from '../setting/store';
import { solidDialog } from '@/libs/dialog';
import Form from '@/libs/components/Form';
import { Menu, Protyle, showMessage } from 'siyuan';
import { getMarkdown, inputDialog, thisPlugin, useDocumentWithAttr } from '@frostime/siyuan-plugin-kits';
import { render } from 'solid-js/web';
import * as persist from '../persistence';
import HistoryList from './HistoryList';
import { SvgSymbol } from './Elements';

import { useSession, useSessionSetting, SimpleProvider } from './UseSession';


import * as syDoc from '../persistence/sy-doc';
import { contextProviders, executeContextProvider } from '../context-provider';
import { adaptIMessageContent } from '../utils';

const useSiYuanEditor = (props: {
    id: string;
    input: ISignalRef<string>;
    fontSize?: string;
    title?: () => string;
    useTextarea: () => HTMLTextAreaElement;
    submit: () => void;
}) => {
    let document: Awaited<ReturnType<typeof useDocumentWithAttr>> = null;
    const prepareDocument = async () => {
        if (document) return;
        const root = await syDoc.ensureRootDocument('GPT 导出文档');
        let configs = {};
        if (root) {
            configs = {
                notebook: root.box,
                dir: root.hpath,
            }
        }
        document = await useDocumentWithAttr({
            name: 'custom-gpt-input-dialog',
            value: props.id,
            createOptions: {
                content: props.input(),
                title: props.title ? props.title() : `gpt-input-${props.id}`,
                ...configs
            }
        });
        // document.setAttrs({
        //     'custom-hidden': 'true'
        // });
    }
    const getText = async () => {
        const content = await getMarkdown(document.id);
        let lines = content.trim().split('\n');
        if (lines.length === 0) return '';

        // 去除 YAML frontmatter
        if (lines[0] === '---') {
            const endIndex = lines.slice(1).indexOf('---') + 1;
            if (endIndex > 0) {
                lines = lines.slice(endIndex + 1);
            }
        }

        lines = lines.join('\n').trim().split('\n');

        // 去除开头的标题
        if (lines[0].startsWith('# ')) {
            lines.shift();
        }

        return lines.join('\n').trim();
    }

    const InputDialog = (p: { close: () => void }) => {
        let ref: HTMLDivElement = null;
        onMount(() => {
            new Protyle(
                thisPlugin().app,
                ref,
                {
                    rootId: document.id,
                    blockId: document.id,
                    render: {
                        background: false,
                        title: false,
                        breadcrumb: false,
                    }
                }
            );

            if (props.fontSize) {
                const wysiwygElement: HTMLElement = ref.querySelector('.protyle-wysiwyg');
                setTimeout(() => {
                    wysiwygElement.style.fontSize = `var(--input-font-size) !important;`;
                }, 250);
            }
        });
        onCleanup(() => {
            if (!document) return;
            document?.setContent('');
        });
        return (
            <div style={{
                display: 'flex',
                "flex-direction": 'column',
                flex: 1,
                background: 'var(--b3-theme-background)'
            }}>
                <div style={{
                    display: 'flex',
                    "justify-content": 'space-between',
                    margin: '10px 12px',
                    gap: '10px',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--b3-theme-background)',
                    'z-index': 1
                }}>
                    <div style={{
                        flex: 1,
                    }} />
                    <button class="b3-button b3-button--outline" onclick={async () => {
                        const content = await getText();
                        // const textarea = props.useTextarea();
                        // textarea.value = content;
                        props.input(content);
                    }}>
                        填充
                    </button>
                    <button class="b3-button" onclick={async () => {
                        const content = await getText();
                        props.input(content);
                        // const textarea = props.useTextarea();
                        // textarea.value = content;
                        if (props.title) {
                            document.setTitle(props.title());
                        }
                        document.setContent('');
                        props.submit();
                        p.close();
                    }}>
                        Submit
                    </button>
                </div>
                <div class={styles['protyle-container']} ref={ref} style={{
                    flex: 1,
                    '--input-font-size': props.fontSize
                }} />
            </div>
        )
    }

    const showDialog = async () => {
        if (!document) {
            await prepareDocument();
        }
        const { close } = solidDialog({
            title: '高级编辑',
            loader: () => (
                <InputDialog close={() => close()} />
            ),
            width: '720px',
            maxWidth: '80%',
            maxHeight: '80%',
        });
    }

    return {
        showDialog,
        cleanUp: async () => {
            if (!document) return;
            await document.delete();
            document = null;
        }
    }
}


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
    const isReadingMode = useSignalRef(false);  // 改为阅读模式状态控制

    let textareaRef: HTMLTextAreaElement;
    let messageListRef: HTMLDivElement;
    let userHasScrolled = false;  //用于控制在发送新消息的时候的滚动行为; 允许用户的手动滚动行为覆盖默认的自动滚动

    const scrollToBottom = (force: boolean = false) => {
        if (messageListRef && (!userHasScrolled || force)) {
            messageListRef.scrollTop = messageListRef.scrollHeight;
        }
    };

    const input = useSignalRef<string>('');
    const session = useSession({ model, config, scrollToBottom });

    const siyuanEditor = useSiYuanEditor({
        id: session.sessionId,
        input,
        fontSize: `${UIConfig().inputFontsize}px`,
        title: () => session.title(),
        useTextarea: () => textareaRef,
        submit: () => {
            handleSubmit(new Event('submit'));
        }
    });

    const handleScroll = () => {
        if (!messageListRef) return;
        const { scrollTop, scrollHeight, clientHeight } = messageListRef;
        // 如果用户向上滚动超过20px，标记为已手动滚动
        if (scrollHeight - (scrollTop + clientHeight) > 50) {
            userHasScrolled = true;
        }
        // 如果滚动到底部，重置手动滚动标记
        if (scrollHeight - (scrollTop + clientHeight) < 2) {
            userHasScrolled = false;
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

    if (props.systemPrompt) {
        session.systemPrompt(props.systemPrompt);
    }

    if (props.history) {
        session.applyHistory(props.history);
    }

    createEffect(on(session.title, () => {
        if (props.updateTitleCallback) {
            props.updateTitleCallback(session.title());
        }
    }));

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
        //需要等待 textarea 调整高度后再设置值
        setTimeout(() => {
            adjustTextareaHeight();
            textareaRef?.focus();
            //设置 textarea 滚动到顶部
            textareaRef.scrollTop = 0;
            //重新设置当前光标位置
            textareaRef.setSelectionRange(textareaRef.selectionStart, textareaRef.selectionStart);
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
        siyuanEditor.cleanUp();
        if (session.messages().length > 0) {
            persist.saveToLocalStorage(session.sessionHistory());
        }
    });

    let AddContextButton: HTMLDivElement;

    const addContext = (e: MouseEvent) => {
        e.stopImmediatePropagation();
        e.preventDefault();

        let menu = new Menu();
        contextProviders.forEach((provider) => {
            menu.addItem({
                icon: provider?.icon, // 你可以为每个 provider 添加图标
                label: provider.displayTitle,
                click: async () => {
                    const context = await executeContextProvider(provider);
                    if (context.contextItems.length === 0) return;
                    // 将上下文添加到 UseSession 中
                    session.setContext(context);
                }
            });
        });

        // const targetElement = (e.target as HTMLElement).closest(`.${styles.toolbarLabel}`);
        // const rect = targetElement.getBoundingClientRect();

        const targetElement = AddContextButton;
        const rect = targetElement.firstElementChild.getBoundingClientRect();

        menu.open({
            x: rect.left,
            y: rect.top,
            isLeft: false
        });
        return menu;
    };

    const useUserPrompt = (e: MouseEvent) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        const userPrompts = promptTemplates().filter(item => item.type === 'user');
        // if (userPrompts.length === 0) return;

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
        menu.addItem({
            icon: 'iconAdd',
            label: '添加当前内容',
            click: () => {
                let content = input.value.trim();
                if (!content) return;
                inputDialog({
                    title: '添加模板',
                    defaultText: '新模板',
                    confirm: (text) => {
                        promptTemplates.update((oldList: IPromptTemplate[]) => {
                            return [...oldList, {
                                type: 'user',
                                name: text,
                                content: content
                            }];
                        });
                    }
                })
            }
        });
        const targetElement = (e.target as HTMLElement).closest(`.${styles.toolbarLabel}`);
        const rect = targetElement.getBoundingClientRect();
        menu.open({
            x: rect.left,
            y: rect.top,
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

        let targetElement = (e.target as HTMLElement).closest(`.${styles.toolbarLabel}`);
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
        scrollToBottom(true);
        userHasScrolled = false; // 重置滚动状态
        await session.sendMessage(userMessage);
        scrollToBottom(true); // 发送新消息时强制滚动到底部
    };

    let menu: Menu;

    /**
     * 在通过 @ 触发了 ContextMenu 弹出时临时监听键盘事件
     * @returns 
     */
    const useTempKeyPressListener = () => {
        const listener = (e: KeyboardEvent) => {
            //至少不是 up 或者 down 按钮（上下选择），就直接退出
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') {
                // e.preventDefault();
                // e.stopImmediatePropagation();
                menu?.close();
                menu = undefined;
                textareaRef.focus();
                release();
                return;
            }

            if (e.key === 'Enter') {
                const btn = menu.element.querySelector('.b3-menu__item--current') as HTMLElement;
                if (btn) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    btn?.click();
                    //检查 textareaRef 最后是不是为 @ 符号
                    //如果是就删掉 @ 符号
                    const value = textareaRef?.value;
                    if (value?.endsWith('@')) {
                        textareaRef.value = value.slice(0, -1);
                        input.update(textareaRef.value);
                    }
                }
                menu?.close();
                menu = undefined;
                textareaRef.focus();
                release();
                return;
            }
        }

        let isListening = false;

        const listen = () => {
            if (isListening) return;
            isListening = true;
            // 捕获阶段
            document.addEventListener('keydown', listener);
        }
        const release = () => {
            if (!isListening) return;
            isListening = false;
            // 取消阶段
            document.removeEventListener('keydown', listener);
        }
        return {
            listen,
            release,
        }
    }

    const tempListener = useTempKeyPressListener();

    const onKeyDown = (e: KeyboardEvent) => {

        if (e.key === '@') {
            const text = textareaRef.value;
            // 检查当前的光标是否在最后的位置
            if (text.length === textareaRef.selectionStart) {
                const event = new MouseEvent('context-provider-open');
                menu = addContext(event);
                menu.element.querySelector('.b3-menu__item')?.classList.add('b3-menu__item--current');
                setTimeout(() => {
                    //@ts-ignore
                    menu.element.querySelector('.b3-menu__item')?.focus();
                    tempListener.listen();
                }, 0);
                return;
            }
        } else if (menu !== undefined) {
            menu.close();
            menu = undefined;
        }

        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleSubmit(e);
            return;
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
            class={`b3-label__text b3-button b3-button--outline ariaLabel ${styles.toolbarLabel}`}
            data-role={props.role}
            aria-label={props.label}
            style={{
                'max-width': props.maxWidth,
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
                            label: '保存对话记录',
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
                    label="复制链接"
                    icon="iconLink"
                    onclick={() => {
                        persist.persistHistory(session.sessionHistory(), { onlyJson: true, verbose: false });
                        const plugin = thisPlugin();
                        const prefix = `siyuan://plugins/${plugin.name}/chat-session-history`;
                        let urlObj = new URLSearchParams();
                        urlObj.set("historyId", session.sessionHistory().id);
                        urlObj.set("historyTitle", session.title());
                        let url = `${prefix}?${urlObj.toString()}`;
                        let markdown = `[${session.title()}](${url})`;
                        navigator.clipboard.writeText(markdown).then(() => {
                            showMessage("Copy links to clipboard!");
                            console.debug("Copy links to clipboard!", markdown);
                        });
                    }}
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
                    styles={
                        multiSelect() ? {
                            'background-color': 'var(--b3-theme-primary)',
                            'color': 'var(--b3-theme-on-primary)'
                        } : {}
                    }
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
                <Item placeholder={true} />
                <Item
                    onclick={openHistoryList}
                    label='历史记录'
                    icon='iconHistory'
                />
                <Item
                    onclick={() => isReadingMode.update(!isReadingMode())}
                    label={isReadingMode() ? '退出阅读' : '阅读模式'}
                    icon={'iconEye'}
                    styles={
                        isReadingMode() ? {
                            'background-color': 'var(--b3-theme-primary)',
                            'color': 'var(--b3-theme-on-primary)'
                        } : {}
                    }
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
        <div class={`${styles.chatContainer} ${isReadingMode() ? styles.readingMode : ''}`} style={styleVars()}>
            {/* 添加顶部工具栏 */}
            <Topbar />
            <BatchOperationBar />

            <div
                class={styles.messageList}
                ref={messageListRef}
                onScroll={handleScroll}
            >
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
                                        const content = session.messages()[index()].message.content;
                                        let { text } = adaptIMessageContent(content);
                                        let userText = text;
                                        let contextText = '';
                                        if (session.messages()[index()].userPromptSlice) {
                                            const [beg, end] = session.messages()[index()].userPromptSlice;
                                            userText = text.slice(beg, end);
                                            contextText = text.slice(end);
                                        }
                                        const newText = message + contextText;
                                        if (Array.isArray(content)) {
                                            // 找到 item.type === 'text'
                                            const idx = content.findIndex(item => item.type === 'text');
                                            if (idx !== -1) {
                                                content[idx].text = newText;
                                                batch(() => {
                                                    session.messages.update(index(), 'message', 'content', content);
                                                    if (contextText && contextText.length > 0) {
                                                        session.messages.update(index(), 'userPromptSlice', [0, message.length]);
                                                    }
                                                });
                                            }
                                        } else if (typeof content === 'string') {
                                            //is string
                                            batch(() => {
                                                session.messages.update(index(), 'message', 'content', newText);
                                                if (contextText && contextText.length > 0) {
                                                    session.messages.update(index(), 'userPromptSlice', [0, message.length]);
                                                }
                                            });
                                        }
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
                    <div style={{ display: 'contents' }} ref={AddContextButton}>
                        <ToolbarLabel onclick={addContext} label='Use Context'>
                            <SvgSymbol size="15px">iconSymbolAt</SvgSymbol>
                        </ToolbarLabel>
                    </div>
                    <div data-role="spacer" style={{ flex: 1 }}></div>
                    <ToolbarLabel onclick={() => {
                        const availableSystemPrompts = (): Record<string, string> => {
                            const systemPrompts = promptTemplates().filter(item => item.type === 'system');
                            return systemPrompts.reduce((acc, cur) => {
                                acc[cur.content] = cur.name;
                                return acc;
                            }, { '': 'No Prompt' });
                        }
                        solidDialog({
                            title: '系统提示',
                            loader: () => (
                                <Form.Wrap
                                    title="System Prompt"
                                    description="附带的系统级提示消息"
                                    direction="row"
                                    action={
                                        <Form.Input
                                            type="select"
                                            value={session.systemPrompt()}
                                            changed={(v) => {
                                                v = v.trim();
                                                if (v) {
                                                    session.systemPrompt(v);
                                                }
                                            }}
                                            options={availableSystemPrompts()}
                                        />
                                    }
                                    style={{
                                        flex: 1
                                    }}
                                >
                                    <Form.Input
                                        type="textarea"
                                        value={session.systemPrompt()}
                                        changed={(v) => {
                                            session.systemPrompt(v);
                                        }}
                                        style={{
                                            "font-size": Math.min(UIConfig().inputFontsize, 17) + "px",
                                            "line-height": "1.25",
                                            'white-space': 'pre-line',
                                            height: '320px'
                                        }}
                                    />
                                </Form.Wrap>
                            ),
                            width: '680px',
                            height: '480px'
                        });
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
                            const targetElement = (e.target as HTMLElement).closest(`.${styles.toolbarLabel}`);
                            let rect = targetElement.getBoundingClientRect();
                            menu.open({
                                x: rect.left,
                                y: rect.top
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
                    <div style={{
                        position: 'absolute',
                        right: '8px',
                        bottom: '8px',
                        display: 'flex',
                        padding: '0px',
                        margin: '0px',
                        "align-items": 'center',
                        gap: '7px'
                    }}>
                        <button
                            type="submit"
                            class={`${styles.primaryButton} b3-button b3-button--text ariaLabel`}
                            aria-label="高级编辑"
                            disabled={session.loading()}
                            onclick={() => {
                                siyuanEditor.showDialog();
                            }}
                        >
                            <SvgSymbol>iconEdit</SvgSymbol>
                        </button>
                        <button
                            type="submit"
                            class={`${styles.primaryButton} b3-button ariaLabel`}
                            classList={{
                                'b3-button--text': session.loading(),
                            }}
                            aria-label="发送消息"
                            disabled={session.loading()}
                            onclick={handleSubmit}
                        >
                            <SvgSymbol>iconSendGpt</SvgSymbol>
                        </button>
                    </div>
                </div>
                <div class={styles.attachmentArea} style={{
                    display: session.attachments()?.length > 0 || session.contexts()?.length > 0 ? "block" : "none",
                }}>
                    <AttachmentList
                        images={session.attachments()}
                        contexts={session.contexts()}
                        showDelete={true}
                        size="medium"
                        onDelete={(key: string | number, type: 'image' | 'context') => {
                            if (type === 'image') {
                                const attachments = session.attachments();
                                session.removeAttachment(attachments[key]);
                            } else {
                                // const contexts = session.contexts();
                                session.delContext(key as IProvidedContext['id']);
                            }
                        }}
                    />
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
