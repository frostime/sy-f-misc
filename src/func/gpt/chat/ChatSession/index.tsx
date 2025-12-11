/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 17:13:44
 * @FilePath     : /src/func/gpt/chat/ChatSession/index.tsx
 * @LastEditTime : 2025-08-24 16:52:55
 * @Description  :
 */
// External libraries
import {
    Accessor, Component, JSX,
    createMemo, createEffect, createRenderEffect,
    For, Match, Show, Switch,
    on, onMount, onCleanup, batch
} from 'solid-js';
import { render } from 'solid-js/web';
import { createSignalRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';
import { Constants, Menu, showMessage } from 'siyuan';
import { inputDialog, thisPlugin } from '@frostime/siyuan-plugin-kits';

// UI Components
import Form from '@/libs/components/Form';
import { SliderInput } from '@/libs/components/Elements';
import { solidDialog } from '@/libs/dialog';

// Local components
import MessageItem from '../MessageItem';
import AttachmentList from '../AttachmentList';
import TitleTagEditor from '../TitleTagEditor';
import HistoryList from '../HistoryList';
import { DeleteHistoryPanel } from './DeleteHistory';
import { SvgSymbol } from '../Elements';
import SessionItemsManager from '../SessionItemsManager';
import { SessionToolsManager } from '../SessionToolsManager';

import { useSession, SimpleProvider } from './ChatSession.helper';
import { useSessionSetting } from './ChatSessionSetting';
import { floatSiYuanTextEditor } from './utils';
import styles from './ChatSession.module.scss';

// GPT and settings related
import {
    defaultConfig, UIConfig, useModel, defaultModelId,
    listAvialableModels, promptTemplates, globalMiscConfigs, checkSupportsModality
} from '@/func/gpt/model/store';
import * as persist from '@gpt/persistence';
import { getContextProviders, executeContextProvider, executeContextProviderDirect } from '@gpt/context-provider';
import SelectedTextProvider from '@gpt/context-provider/SelectedTextProvider';
// import {
//     adaptIMessageContentGetter,
//     isMsgItemWithMultiVersion
// } from '@gpt/data-utils';
import BlocksProvider from '@gpt/context-provider/BlocksProvider';
import { truncateContent } from '../../tools/utils';


const ChatSession: Component<{
    input?: ReturnType<typeof useSignalRef<string>>;
    systemPrompt?: string;
    history?: IChatSessionHistory;
    config?: IChatSessionConfig;
    uiStyle?: {
        maxWidth?: string;
    };
    updateTitleCallback?: (title: string) => void;
}> = (props) => {
    const modelId = useSignalRef(defaultModelId());
    const model = createMemo(() => useModel(modelId()));
    //Detach from the solidjs store's reactive system
    let defaultConfigVal = JSON.parse(JSON.stringify(defaultConfig.unwrap()));
    defaultConfigVal = { ...defaultConfigVal, ...props.config };
    const config = useStoreRef<IChatSessionConfig>(defaultConfigVal);
    const multiSelect = useSignalRef(false);
    const isReadingMode = useSignalRef(false);  // 改为阅读模式状态控制
    // const webSearchEnabled = useSignalRef(false); // 控制是否启用网络搜索

    // 删除历史面板状态管理
    // const showDeleteHistoryPanel = useSignalRef(false);

    const modelDisplayLable = createMemo(() => {
        const runtimeLLM = model();
        if (!runtimeLLM) return '';
        return runtimeLLM.config?.displayName || runtimeLLM.model;
    });

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

    const hasToolEnabled = createSignalRef(session.toolExecutor.hasEnabledTools());

    // 移除 useSiYuanEditor，改用 floatSiYuanTextEditor
    // const siyuanEditor = useSiYuanEditor({
    //     id: session.sessionId(),
    //     input,
    //     fontSize: `${UIConfig().inputFontsize}px`,
    //     title: () => session.title(),
    //     useTextarea: () => textareaRef,
    //     submit: () => {
    //         handleSubmit(new Event('submit'));
    //     }
    // });

    const openFloatEditor = () => {
        floatSiYuanTextEditor({
            initialText: input(),
            fontSize: `${UIConfig().inputFontsize}px`,
            customButtons: {
                '填充': (text: string) => {
                    input(text);
                    adjustTextareaHeight();
                }
            },
            onConfirm: (text: string) => {
                input(text);
                adjustTextareaHeight();
                handleSubmit(new Event('submit'));
            },
            onClose: () => {
                // 清理逻辑如果需要的话
            }
        });
    };

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
        if (session.messages().length > 0 && session.hasUpdated()) {
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
    if (props.input) {
        createRenderEffect(on(props.input.signal, (text: string) => {
            if (!text) return;
            // //刚刚创建的时候，可能还没有 textarea 元素
            // if (!textareaRef) return;
            //需要等待 textarea 调整高度后再设置值
            executeContextProvider(SelectedTextProvider, {
                verbose: false
            }).then(context => {
                if (!context) return;
                if (context.contextItems.length === 0) return;
                session.setContext(context);
            });
        }));
    }


    onMount(() => {
        adjustTextareaHeight();
        textareaRef.focus();
        //scroll 到当前光标的位置
        textareaRef.scrollTop = 0;
        // 将光标设置在开头位置
        textareaRef.setSelectionRange(0, 0);
        // if (props.input && props.input()) {
        //     executeContextProvider(SelectedTextProvider, {
        //         verbose: false
        //     }).then(context => {
        //         if (!context) return;
        //         if (context.contextItems.length === 0) return;
        //         session.setContext(context);
        //     });
        // }
    });

    onCleanup(() => {
        // 移除 siyuanEditor.cleanUp()，因为 floatSiYuanTextEditor 会自动清理
        if (session.messages().length > 0 && session.hasUpdated()) {
            persist.saveToLocalStorage(session.sessionHistory());
        }
    });

    let AddContextButton: HTMLDivElement;

    const addContext = (e: MouseEvent) => {
        e.stopImmediatePropagation();
        e.preventDefault();

        let menu = new Menu();
        getContextProviders().forEach((provider) => {
            menu.addItem({
                icon: provider?.icon, // 你可以为每个 provider 添加图标
                label: provider.displayTitle,
                click: async () => {
                    const context = await executeContextProvider(provider);
                    if (!context) return;
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
                    // const oldLen = input().length;
                    input.value = (input.value + '\n' + prompt.content).trim();
                    let pos = -1;
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

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        const userMessage = input().trim();
        if (!userMessage) return;

        input.update('');
        adjustTextareaHeight();
        scrollToBottom(true);
        userHasScrolled = false; // 重置滚动状态

        await session.sendMessage(userMessage);
        // Send the message with web search if enabled
        // await session.sendMessage(userMessage, {
        //     tavily: webSearchEnabled()
        // });

        // // Reset web search after using it once
        // if (webSearchEnabled()) {
        //     webSearchEnabled.update(false);
        // }

        if (!userHasScrolled) {
            scrollToBottom(true);
        }
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
            const cursorPosition = textareaRef.selectionStart;

            // Check if cursor is at the end of a line
            const isAtLineEnd = cursorPosition === text.length ||
                (cursorPosition < text.length && text[cursorPosition] === '\n') ||
                (cursorPosition > 0 && text[cursorPosition - 1] === '\n');

            if (isAtLineEnd) {
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
            width: '1500px',
            height: '1000px',
            maxHeight: '85%',
            maxWidth: '90%'
        });
    }

    const styleVars = () => {
        return {
            '--chat-input-font-size': `${UIConfig().inputFontsize}px`,
            '--chat-message-font-size': `${UIConfig().msgFontsize}px`,
            '--chat-max-width': props.uiStyle?.maxWidth || `${UIConfig().maxWidth}px`,
        };
    };

    // 使用单独的 TitleTagEditor 组件

    const Topbar = () => {
        const Item = (props: any) => (
            <ToolbarLabel
                onclick={props.onclick ?? (() => { })}
                label={props.label}
                role={props?.role}
                styles={{
                    background: 'var(--chat-bg-color)',
                    color: 'var(--chat-text-color)',
                    border: 'none',
                    'box-shadow': 'none',
                    cursor: props.placeholder ? 'default' : 'pointer',
                    ...(props.styles ?? {})
                }}
            >
                <SvgSymbol size="var(--topbar-btn-size)">{props.icon}</SvgSymbol>
            </ToolbarLabel>
        );

        const openToolsMenu = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            let menu = new Menu("tools-menu");

            // 复制链接选项
            menu.addItem({
                icon: 'iconLink',
                label: '复制链接',
                click: () => {
                    persist.persistHistory(session.sessionHistory());
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
                }
            });

            // 多选选项
            // menu.addItem({
            //     icon: 'iconCheck',
            //     label: '多选',
            //     click: () => {
            //         multiSelect.update(!multiSelect());
            //     },
            //     checked: multiSelect()
            // });

            // 删除历史选项
            menu.addItem({
                icon: 'iconHistory',
                label: `删除历史 (${session.deleteHistory.count()})`,
                click: () => {
                    solidDialog({
                        title: '删除历史记录',
                        width: '720px',
                        height: '640px',
                        loader: () => (
                            <DeleteHistoryPanel
                                records={session.deleteHistory.records()}
                                onClearHistory={() => {
                                    session.deleteHistory.clearRecords();
                                }}
                                onRemoveRecord={(recordId: string) => {
                                    session.deleteHistory.removeRecord(recordId);
                                }}
                            />
                        )
                    });
                }
            });

            // 自动生成标题选项
            menu.addItem({
                icon: 'iconH1',
                label: '自动生成标题',
                click: () => {
                    session.autoGenerateTitle();
                }
            });

            // 阅读模式选项
            menu.addItem({
                icon: 'iconEye',
                label: isReadingMode() ? '退出阅读' : '阅读模式',
                checked: isReadingMode(),
                click: () => {
                    isReadingMode.update(!isReadingMode());
                }
            });

            // 添加管理消息选项
            menu.addItem({
                icon: 'iconList',
                label: '管理消息',
                click: () => {
                    const { close } = solidDialog({
                        loader: () => (
                            <SessionItemsManager
                                session={session}
                                onClose={() => close()}
                                focusTo={(id: IChatSessionMsgItem['id']) => {
                                    close();
                                    setTimeout(() => {
                                        const targetElement = messageListRef.querySelector(`div[data-msg-id="${id}"]`) as HTMLElement;
                                        if (targetElement) {
                                            targetElement.focus();
                                            targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
                                        }
                                    }, 100)
                                }}
                            />
                        ),
                        title: '管理消息',
                        width: '1200px',
                        height: '800px',
                        maxHeight: '90%',
                        maxWidth: '90%'
                    });
                }
            });

            const target = e.target as HTMLElement;
            const rect = target.getBoundingClientRect();
            menu.open({
                x: rect.left,
                y: rect.bottom
            });
        };

        return (
            <div class={styles.topToolbar}>
                {/* 左侧 - 工具按钮 */}
                <Item
                    onclick={openToolsMenu}
                    label='更多功能'
                    icon='iconPlugin'
                />

                {/* 左侧 - 保存导出按钮 */}
                <Item
                    onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        e.preventDefault();
                        let menu = new Menu();
                        menu.addItem({
                            icon: 'iconDatabase',
                            label: '归档对话记录',
                            click: () => {
                                persist.persistHistory(session.sessionHistory(), {
                                    verbose: '保存成功'
                                });
                            }
                        });
                        menu.addItem({
                            icon: 'iconSiYuan',
                            label: '导出到笔记中',
                            click: () => {
                                persist.persistHistory(session.sessionHistory(), {
                                    saveTo: 'document',
                                    verbose: '导出成功'
                                });
                            }
                        });
                        menu.addItem({
                            icon: 'iconSiYuan',
                            label: '导出为附件',
                            click: () => {
                                persist.persistHistory(session.sessionHistory(), {
                                    saveTo: 'asset',
                                    verbose: '导出成功'
                                });
                            },
                            submenu: [
                                {
                                    icon: 'iconSiYuan',
                                    label: '导出附件但不归档',
                                    click: () => {
                                        persist.persistHistory(session.sessionHistory(), {
                                            saveJson: false,
                                            saveTo: 'asset',
                                            verbose: '导出成功'
                                        });
                                    },
                                }
                            ]
                        });
                        menu.addItem({
                            icon: 'iconMarkdown',
                            label: '显示为 Markdown',
                            click: () => {
                                inputDialog({
                                    title: '导出对话',
                                    defaultText: persist.chatHistoryToMarkdown(session.sessionHistory()),
                                    type: 'textarea',
                                    'width': '800px',
                                    'height': '700px'
                                })
                            }
                        });
                        // 下载 md
                        menu.addItem({
                            icon: 'iconDownload',
                            label: '下载 Markdown',
                            click: () => {
                                const mdText = persist.chatHistoryToMarkdown(session.sessionHistory());
                                const title = `${session.title()}.md`;
                                const a = document.createElement('a');
                                a.href = `data:text/markdown;charset=utf-8,${encodeURIComponent(mdText)}`;
                                a.download = title;
                                a.click();
                                showMessage('下载到' + title);
                            }
                        });
                        menu.addSeparator();
                        menu.addItem({
                            icon: 'iconEye',
                            checked: globalMiscConfigs().exportMDSkipHidden,
                            label: '跳过隐藏消息',
                            click: () => {
                                const newValue = !globalMiscConfigs().exportMDSkipHidden;
                                globalMiscConfigs.update('exportMDSkipHidden', newValue);
                                showMessage(`导出时将${newValue ? '跳过' : '包含'}隐藏消息`);
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

                {/* 中间 - 标题 */}
                <div
                    classList={{
                        [styles.chatTitle]: true,
                        'ariaLabel': true
                    }}
                    onclick={() => {
                        // 获取当前会话的标题和标签
                        const currentTitle = session.title();
                        const currentTags = session.sessionHistory().tags || [];

                        // 创建一个更现代化的对话框
                        const { close } = solidDialog({
                            title: '编辑会话信息',
                            width: '750px',
                            loader: () => (
                                <TitleTagEditor
                                    title={currentTitle}
                                    tags={currentTags}
                                    onSave={(title, tags) => {
                                        // 更新标题
                                        session.title(title);
                                        session.sessionTags.update(tags);
                                        // 关闭对话框
                                        close();
                                    }}
                                    onClose={() => close()}
                                />
                            )
                        });
                    }}
                    aria-label={session.title()}
                >
                    {session.title()}
                    <Show when={session.sessionTags().length > 0}>
                        <div class="b3-chips">
                            <For each={session.sessionTags()}>
                                {(tag) => <span class="b3-chip b3-chip--middle b3-chip--info">{tag}</span>}
                            </For>
                        </div>
                    </Show>
                </div>

                {/* 右侧 - 历史记录 */}
                <Item
                    onclick={openHistoryList}
                    label='历史记录'
                    icon='iconHistory'
                    role="history"
                />

                {/* 右侧 - 新建对话 */}
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

    const editSystemPrompt = () => {
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
    }

    const ChatContainer = () => (
        <div class={`${styles.chatContainer} ${isReadingMode() ? styles.readingMode : ''}`} style={styleVars()}>
            {/* 添加顶部工具栏 */}
            <Topbar />

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
                                    loading={item.loading === true} // 使用 loading 参数替代 markdown
                                    updateIt={(message) => {
                                        session.updateMessage(index(), message);
                                    }}
                                    deleteIt={() => {
                                        session.deleteMessage(index());
                                    }}
                                    rerunIt={() => {
                                        if (session.loading()) return;
                                        session.reRunMessage(index());
                                    }}
                                    multiSelect={multiSelect()}
                                    onSelect={(id) => {
                                        // This function is now only used in the SessionItemsManager component
                                    }}
                                    toggleSeperator={() => {
                                        if (session.loading()) return;
                                        session.toggleSeperatorAt(index());
                                    }}
                                    toggleHidden={() => {
                                        if (session.loading()) return;
                                        session.toggleHidden(index());
                                    }}
                                    togglePinned={() => {
                                        if (session.loading()) return;
                                        session.togglePinned(index());
                                    }}
                                    index={index()}
                                    totalCount={session.messages().length}
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
                    {/* 新增工具按钮 */}
                    <ToolbarLabel onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        e.preventDefault();

                        const attachedHistoryContainer = document.createElement('div');
                        const dispose = render(() => (
                            <div style={{ display: 'inline-flex', 'align-items': 'center', 'gap': '2px' }}>
                                <SliderInput
                                    value={config().attachedHistory}
                                    changed={(v) => {
                                        config.update('attachedHistory', v);
                                    }}
                                    min={-1}
                                    max={24}
                                    step={1}
                                />
                                <span>{config().attachedHistory} 条</span>
                            </div>
                        ), attachedHistoryContainer);

                        const temperatureContainer = document.createElement('div');
                        const disposeTemp = render(() => (
                            <div style={{ display: 'inline-flex', 'align-items': 'center', 'gap': '2px' }}>
                                <SliderInput
                                    value={config().chatOption.temperature}
                                    changed={(v) => {
                                        config.update('chatOption', 'temperature', v);
                                    }}
                                    min={0}
                                    max={2}
                                    step={0.05}
                                />
                                <span>{config().chatOption.temperature.toFixed(2)}</span>
                            </div>
                        ), temperatureContainer);

                        let menu = new Menu("tools-menu", () => {
                            dispose();
                            disposeTemp();
                        });

                        // 新的上下文选项
                        menu.addItem({
                            icon: 'iconLine',
                            label: '新的上下文',
                            click: () => {
                                session.toggleNewThread();
                            }
                        });

                        // 字数选项
                        menu.addItem({
                            icon: 'iconFont',
                            label: '字数: ' + input().length
                        });

                        // 附带消息选项
                        menu.addItem({
                            icon: 'iconList',
                            label: '附带消息: ' + config().attachedHistory,
                            submenu: [
                                {
                                    element: attachedHistoryContainer
                                }
                            ]
                        });

                        // 温度选项
                        menu.addItem({
                            icon: 'iconLight',
                            label: '温度: ' + config().chatOption.temperature.toFixed(2),
                            submenu: [
                                {
                                    element: temperatureContainer
                                }
                            ]
                        });

                        // System Prompt
                        menu.addItem({
                            icon: 'iconUsers',
                            label: 'System Prompt',
                            click: editSystemPrompt,
                            checked: session.systemPrompt().length > 0
                        });

                        menu.addSeparator();
                        // 设置
                        menu.addItem({
                            icon: 'iconSettings',
                            label: '打开设置',
                            click: () => {
                                openSetting();
                            }
                        });

                        const target = e.target as HTMLElement;
                        const rect = target.getBoundingClientRect();
                        menu.open({
                            x: rect.left,
                            y: rect.top
                        });
                    }} label='工具' >
                        <SvgSymbol size="15px">iconMenu</SvgSymbol>
                    </ToolbarLabel>
                    <ToolbarLabel onclick={useUserPrompt} label='使用模板 Prompt' >
                        <SvgSymbol size="15px">iconEdit</SvgSymbol>
                    </ToolbarLabel>
                    <div style={{ display: 'contents' }} ref={AddContextButton}>
                        <ToolbarLabel onclick={addContext} label='Use Context'>
                            <SvgSymbol size="15px">iconSymbolAt</SvgSymbol>
                        </ToolbarLabel>
                    </div>
                    <ToolbarLabel
                        onclick={(e: MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const { container } = solidDialog({
                                title: '可用工具',
                                loader: () => (
                                    <SessionToolsManager
                                        toolExecutor={session.toolExecutor}
                                        onToggleGroup={(_groupName, _enabled) => {
                                            // 工具组状态已在组件内部更新，这里可以添加额外逻辑
                                        }}
                                        onToggleTool={(_toolName, _enabled) => {
                                            // 工具状态已在组件内部更新，这里可以添加额外逻辑
                                        }}
                                    />
                                ),
                                width: '840px',
                                height: '640px',
                                callback: () => {
                                    hasToolEnabled.update(session.toolExecutor.hasEnabledTools());
                                }
                            });
                            (container.querySelector('.dialog-content') as HTMLElement).style.height = 'unset';
                        }}
                        label='工具'
                        role='tool-calls'
                        styles={
                            hasToolEnabled() ? {
                                'background-color': 'var(--b3-theme-primary)',
                                'color': 'var(--b3-theme-on-primary)'
                            } : {}
                        }
                    >
                        <SvgSymbol size="15px">iconBazaar</SvgSymbol>
                    </ToolbarLabel>
                    <div data-role="spacer" style={{ flex: 1 }}></div>
                    <ToolbarLabel onclick={editSystemPrompt} label='系统提示' role="system-prompt" >
                        {session.systemPrompt().length > 0 ? `✅ ` : ''}System
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
                        {modelDisplayLable()}
                    </ToolbarLabel>
                    <ToolbarLabel onclick={openSetting} label='设置' role='setting' >
                        <SvgSymbol size="15px">iconSettings</SvgSymbol>
                    </ToolbarLabel>
                </div>
                <div class={styles.inputWrapper}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.add(styles.dropTarget);
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.remove(styles.dropTarget);
                    }}
                    onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.remove(styles.dropTarget);

                        if (!e.dataTransfer.types.length) return;

                        const type = e.dataTransfer.types[0];
                        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
                            let meta = type.replace(Constants.SIYUAN_DROP_GUTTER, '');
                            const info = meta.split(Constants.ZWSP);
                            const nodeIds = info[2].split(',');
                            if (nodeIds.length > 1) {
                                const context = await executeContextProviderDirect(SelectedTextProvider, {
                                    query: ''
                                });
                                session.setContext(context);
                            } else if (nodeIds.length === 1) {
                                const id = nodeIds[0];
                                const context = await executeContextProviderDirect(BlocksProvider, {
                                    query: id
                                });
                                session.setContext(context);
                            }

                        } else if (e.dataTransfer.types.includes(Constants.SIYUAN_DROP_TAB)) {
                            const data = e.dataTransfer.getData(Constants.SIYUAN_DROP_TAB)
                            const payload = JSON.parse(data);
                            const rootId = payload?.children?.rootId;
                            if (rootId) {
                                const context = await executeContextProviderDirect(BlocksProvider, {
                                    query: rootId
                                });
                                session.setContext(context);
                            }
                            const tab = document.querySelector(`li[data-type="tab-header"][data-id="${payload.id}"]`) as HTMLElement;
                            if (tab) {
                                tab.style.opacity = 'unset';
                            }
                        } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            const files = Array.from(e.dataTransfer.files);

                            // 过滤支持的文件类型
                            const supportedFiles = files.filter(file => {
                                if (file.size > 2 * 1024 * 1024) {
                                    return false;  //限制 2MB 以内
                                }
                                const ext = file.name.split('.').pop()?.toLowerCase();
                                return ['txt', 'md', 'py', 'ts', 'js', 'json', 'yaml', 'toml', 'xml', 'html'].includes(ext || '');
                            });

                            if (supportedFiles.length === 0) {
                                return;
                            }

                            const readTextContent = async (file: File): Promise<string> => {
                                return new Promise((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onload = (e) => {
                                        const result = e.target?.result as string;
                                        resolve(result);
                                    }
                                    reader.onerror = () => {
                                        reject(reader.error);
                                    }
                                    // 关键：添加这一行！
                                    reader.readAsText(file);
                                });
                            }


                            for (const file of supportedFiles) {
                                try {
                                    let content = await readTextContent(file);
                                    if (content.length > 10000) {
                                        const len = content.length;
                                        const result = truncateContent(content, 10000);
                                        content = result.content;
                                        if (result.isTruncated) {
                                            content += `\n\n...（内容过长，已截断，原始长度 ${len} 字符）`;
                                        }
                                    }
                                    const context: IProvidedContext = {
                                        id: `file-${Date.now()}-${file.name}`,
                                        name: 'ReadLocalFile',
                                        displayTitle: '本地文件',
                                        description: '用户提交的本地文件内容',
                                        contextItems: [
                                            {
                                                name: file.name,
                                                description: `${file.name}的内容`,
                                                content: content
                                            }
                                        ]
                                    };
                                    session.setContext(context);
                                } catch (error) {
                                    console.error('文件读取失败:', error);
                                }
                            }
                        }
                    }}>
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
                            if (!checkSupportsModality(modelId(), 'image')) {
                                showMessage('当前模型不支持图片输入');
                                return;
                            }

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
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Add visual feedback for drag over textarea
                            const wrapper = e.currentTarget.closest(`.${styles.inputWrapper}`);
                            if (wrapper) wrapper.classList.add(styles.dropTarget);
                        }}
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
                                openFloatEditor();
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
        <div
            data-session-id={session.sessionId()}
            style={{
                "display": "flex",
                // "flex-direction": "column",  //加了之后可能会在 tab 变窄的时候导致溢出..
                "justify-content": "center",
                "width": "100%",
                "height": "100%"
            }}>
            <SimpleProvider state={{
                model,
                config,
                session,
            }}>
                <ChatContainer />

            </SimpleProvider>
        </div>
    );
};

export default ChatSession;
