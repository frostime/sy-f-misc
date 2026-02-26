/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 17:13:44
 * @FilePath     : /src/func/gpt/chat/main.tsx
 * @LastEditTime : 2026-02-26 20:44:12
 * @Description  :
 */
// External libraries
import {
    Accessor, Component, JSX,
    createMemo, createEffect, createRenderEffect,
    For, Match, Show, Switch,
    on, onMount, onCleanup
} from 'solid-js';
import { render } from 'solid-js/web';
import { createSignalRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';
import { Menu, showMessage } from 'siyuan';
import { debounce, inputDialog, thisPlugin } from '@frostime/siyuan-plugin-kits';

// UI Components
import Form from '@/libs/components/Form';
import { SliderInput } from '@/libs/components/Elements';
import { solidDialog } from '@/libs/dialog';

// Local components
import MessageItem from './components/MessageItem';
import AttachmentList from './components/AttachmentList';
import TitleTagEditor from './components/TitleTagEditor';
import HistoryList from './components/HistoryList';
import { openIframeDialog } from '@/func/html-pages/core';
import SvgSymbol from '@/libs/components/Elements/IconSymbol';
import SessionItemsManager from './components/SessionItemsManager';
import { SessionToolsManager } from './components/SessionToolsManager';

import { InlineApprovalCard } from '@gpt/tools/approval-ui';
import { useSession, SimpleProvider } from './ChatSession/use-chat-session';
import { useSessionSetting } from './session-setting';
import { floatSiYuanTextEditor } from './utils';
import { useAttachmentInputHandler } from './ChatSession/use-attachment-input';
import styles from './main.module.scss';

// GPT and settings related
import {
    defaultConfig, UIConfig, useModel, defaultModelId,
    listAvialableModels, promptTemplates, globalMiscConfigs
} from '@/func/gpt/model/store';
import * as persist from '@gpt/persistence';
import { getContextProviders, executeContextProvider } from '@gpt/context-provider';
import SelectedTextProvider from '@gpt/context-provider/SelectedTextProvider';

import { TextAreaWithActionButton } from '@/libs/components/Elements/TextArea';
import { jsonAgent } from '../openai/tiny-agent';
import { showChatWorldTree } from './ChatSession/world-tree';
import { openVarsManager } from '../tools/vars';
import Markdown from '@/libs/components/Elements/Markdown';


export const ChatSession: Component<{
    input?: ReturnType<typeof useSignalRef<string>>;
    systemPrompt?: string;
    history?: IChatSessionHistoryV2;
    config?: IChatSessionConfig;
    uiStyle?: {
        maxWidth?: string;
    };
    updateTitleCallback?: (title: string) => void;
}> = (props) => {
    const modelId = useSignalRef(defaultModelId());


    const model: Accessor<IRuntimeLLM> = createMemo(() => {
        const llm = useModel(modelId(), 'null');
        if (llm !== null) return llm;  // 如果正在对话的模型突然在面板中被删掉就会出现这种奇葩情况

        const defaultModel = useModel(defaultModelId(), 'null');
        if (defaultModel !== null) {
            setTimeout(() => {
                modelId(defaultModelId());
            });
            showMessage('当前模型不可用，已切换回默认模型');
            return defaultModel;
        }

        const siyuanModel = useModel('siyuan', 'null');
        if (siyuanModel !== null) {
            // 避免在 memo 重复更改 modelId()
            setTimeout(() => {
                modelId('siyuan');
            });
            showMessage('当前模型不可用，已切换回 SiYuan 内置模型');
            return siyuanModel;
        }

        const utilModel = defaultConfig().utilityModelId;
        const utilLLM = useModel(utilModel, 'null');
        if (utilLLM !== null) {
            setTimeout(() => {
                modelId(utilModel);
            });
            showMessage('当前模型不可用，已切换回备用工具模型');
            return utilLLM;
        }

        showMessage('当前模型不可用，请重新手动指定模型');

        return {
            bareId: 'none',
            url: 'http://api.openai.com/v1/chat/completions',
            model: 'gpt-3.5-turbo',
            apiKey: '',
            type: 'chat',
            // config: null
        } satisfies IRuntimeLLM;
    });

    //Detach from the solidjs store's reactive system
    let defaultConfigVal = JSON.parse(JSON.stringify(defaultConfig.unwrap()));
    defaultConfigVal = { ...defaultConfigVal, ...props.config };
    const config = useStoreRef<IChatSessionConfig>(defaultConfigVal);
    const multiSelect = useSignalRef(false);
    const isReadingMode = useSignalRef(false);  // 改为阅读模式状态控制
    const isInputFolded = useSignalRef(false);
    // const webSearchEnabled = useSignalRef(false); // 控制是否启用网络搜索

    createEffect(on(isInputFolded.signal, (folded) => {
        if (!folded) {
            setTimeout(adjustTextareaHeight, 0);
        }
    }));

    // 删除历史面板状态管理
    // const showDeleteHistoryPanel = useSignalRef(false);

    createEffect(() => {
        let customOptions = model().config?.options?.customOverride;
        if (customOptions) {
            // 避免从 Store 中获取一个 Proxy, 会导致后续 structuredClone 失败
            customOptions = JSON.parse(JSON.stringify(customOptions));
            session.modelCustomOptions(customOptions);
        }
    })

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

    // ========== 新增：自动滚动到审批卡片 ==========
    createEffect(on(
        () => session.pendingApprovals().length,
        (len, prevLen) => {
            if (len > (prevLen ?? 0)) {
                // 有新审批，滚动到底部
                setTimeout(() => scrollToBottom(true), 50);
            }
        }
    ));

    const hasToolEnabled = createSignalRef(session.toolExecutor.hasEnabledTools());

    // 文件输入处理 Hook
    const attachmentInputHandler = useAttachmentInputHandler({
        modelId,
        addAttachment: (file) => session.addAttachment(file),
        setContext: (context) => session.setContext(context)
    });

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
            fontSize: `${UIConfig().msgFontsize}px`,
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

    const newChatSession = (history?: Partial<IChatSessionHistoryV2>) => {
        if (session.hasMessages() && session.hasUpdated()) {
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
        if (session.hasMessages() && session.hasUpdated()) {
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

        menu.addSeparator();

        menu.addItem({
            icon: 'iconFile',
            label: '上传文件',
            click: () => {
                // const currentModelId = modelId();

                // 检查模型是否支持文件输入
                // if (!attachmentInputHandler.checkSupportsFileInput(currentModelId)) {
                //     showMessage('当前模型不支持任何文件输入');
                //     return;
                // }

                // 创建隐藏的文件输入元素
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.multiple = true;

                // 根据模型支持的类型动态设置 accept
                fileInput.accept = attachmentInputHandler.getAcceptPattern();

                fileInput.onchange = async () => {
                    if (fileInput.files && fileInput.files.length > 0) {
                        await attachmentInputHandler.handleFileSelect(fileInput.files);
                    }
                    // 清理
                    fileInput.remove();
                };

                // 触发文件选择
                fileInput.click();
            }
        });

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
            class={`ariaLabel ${styles.toolbarLabel}`}
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
                        onclick={(history: IChatSessionHistoryV2) => {
                            if (session.hasMessages()) {
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
                    background: 'transparent',
                    color: 'var(--b3-theme-on-background)',
                    border: 'none',
                    'box-shadow': 'none',
                    cursor: props.placeholder ? 'default' : 'pointer',
                    padding: '8px',
                    ...(props.styles ?? {})
                }}
            >
                <SvgSymbol size="18px">{props.icon}</SvgSymbol>
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
                    openIframeDialog({
                        title: '删除历史记录',
                        width: '720px',
                        height: '640px',
                        iframeConfig: {
                            type: 'url',
                            source: '/plugins/sy-f-misc/pages/delete-history.html',
                            inject: {
                                presetSdk: true,
                                siyuanCss: true,
                                customSdk: {
                                    getRecords: async () => {
                                        return JSON.parse(JSON.stringify(session.deleteHistory.records()));
                                    },
                                    removeRecord: async (id: string) => {
                                        session.deleteHistory.removeRecord(id);
                                        return JSON.parse(JSON.stringify(session.deleteHistory.records()));
                                    },
                                    clearRecords: async () => {
                                        session.deleteHistory.clearRecords();
                                        return [];
                                    },
                                    copyToClipboard: async (text: string) => {
                                        await navigator.clipboard.writeText(text);
                                        showMessage('已复制');
                                    }
                                }
                            }
                        }
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

            menu.addItem({
                icon: 'iconSpreadEven',
                label: '变量管理',
                click: () => {
                    openVarsManager(session.toolExecutor);
                }
            });

            // 添加管理消息选项
            menu.addItem({
                icon: 'iconList',
                label: '当前世界线',
                click: () => {
                    const { close } = solidDialog({
                        loader: () => (
                            <SessionItemsManager
                                session={session}
                                onClose={() => close()}
                                focusTo={(id: IChatSessionMsgItemV2['id']) => {
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
                        title: '当前世界线 - 对话管理',
                        width: '1200px',
                        height: '800px',
                        maxHeight: '90%',
                        maxWidth: '90%'
                    });
                }
            });
            menu.addItem({
                icon: 'iconGraph',
                label: '完整对话结构',
                click: () => {
                    showChatWorldTree({
                        treeModel: session.treeModel
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
                            label: '下载为 Markdown',
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
                        menu.addItem({
                            icon: 'iconArrowDown',
                            label: '下载原始对话文件',
                            click: () => {
                                persist.downloadJsonFile(session.sessionHistory());
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
                        // 删除指定 id 的 seperator
                        session.deleteMessages([{ id: props.id }]);
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
            title: '用户定义系统规则',
            loader: () => (
                <Form.Wrap
                    title="User Rule"
                    description="用户编辑的规则，会被编入 System Prompt 中"
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

    const editCustomOptions = () => {

        const _updateOption = (text: string) => {
            try {
                const parsed = text.trim() ? JSON.parse(text) : {};
                session.modelCustomOptions(parsed);
            } catch (e) {
                showMessage('自定义参数格式错误，请使用 JSON 格式');
            }
        }

        const updateOption = debounce(_updateOption, 1000);

        solidDialog({
            title: '自定义对话 Options',
            loader: () => (
                <Form.Wrap
                    title="Options"
                    description="自定义对话中的 Option (JSON 格式), 作为最高优先级覆盖所有默认设置; 你可以使用 'Json' 按钮辅助格式化"
                    direction="row"
                >
                    <TextAreaWithActionButton
                        value={(function () {
                            const value = session.modelCustomOptions() || {};
                            if (!value || Object.keys(value).length === 0) {
                                return ''
                            }
                            return JSON.stringify(value, null, 2);
                        })()}
                        onChanged={updateOption}
                        action={
                            async function (text: string) {
                                if (!text.trim()) return;
                                const formalized = await jsonAgent({
                                    text: text,
                                    schema: '遵循 OpenAI Completion Option 格式',
                                });
                                if (formalized.ok) {
                                    updateOption(formalized.content);
                                }
                            }
                        }
                        actionText="Json"
                        containerStyle={{
                            'flex': 1
                        }}
                        textareaStyle={{
                            'font-family': 'var(--b3-font-family-code)',
                            'font-size': '14px',
                            height: '320px'
                        }}
                    />
                </Form.Wrap>
            ),
            width: '680px',
            height: '480px'
        });
    }

    const MessageItems = () => (
        <div
            class={styles.messageList}
            ref={messageListRef}
            onScroll={handleScroll}
        >
            <For each={session.getActiveMessages()}>
                {(item: IChatSessionMsgItemV2, index: Accessor<number>) => (
                    <Switch fallback={<>错误匹配类型</>}>
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
                                onSelect={(_id) => {
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
                                totalCount={session.getMessageCount()}
                            />

                            {/* 工具审批 */}
                            <Show when={item.loading === true}>
                                <For each={session.pendingApprovals()}>
                                    {(approval) => (
                                        <InlineApprovalCard
                                            approval={approval}
                                            onApprove={() => {
                                                session.resolvePendingApproval(approval.id, { approved: true });
                                                scrollToBottom(false);
                                            }}
                                            onReject={(reason) => {
                                                session.resolvePendingApproval(approval.id, {
                                                    approved: false,
                                                    rejectReason: reason || '用户拒绝'
                                                });
                                                scrollToBottom(false);
                                            }}
                                        />
                                    )}
                                </For>
                            </Show>
                        </Match>
                        <Match when={item.type === 'separator'}>
                            <Seperator title="新的对话" id={item.id} />
                        </Match>
                    </Switch>
                )}
            </For>

        </div>
    );

    const InputContainer = () => (
        <section class={styles.inputContainer} onSubmit={handleSubmit}>
            <div class={styles.toolbar}>
                <div style={{ display: 'flex', gap: '4px' }}>
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
                            label: 'User Rule',
                            click: editSystemPrompt,
                            checked: session.systemPrompt().length > 0,
                        });

                        menu.addSeparator();
                        //#if [PRIVATE_ADD]
                        menu.addItem({
                            icon: 'iconUsers',
                            label: 'System Prompt',
                            click: () => {
                                const text = session.buildSystemPrompt();
                                solidDialog({
                                    title: `预览完整 System Prompt —— 共 ${text.length} 字符`,
                                    loader: () => (
                                        <Markdown markdown={text} style={{
                                            padding: '10px'
                                        }}/>
                                    ),
                                    width: '720px',
                                    maxHeight: '70%',
                                });
                            },
                        });
                        //#endif
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
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                    <ToolbarLabel onclick={editCustomOptions} label='自定义对话参数' role='chat-options' >
                        <SvgSymbol size="15px">iconKeymap</SvgSymbol>
                    </ToolbarLabel>
                    <ToolbarLabel onclick={editSystemPrompt} label='用户定义规则' role="system-prompt" >
                        {session.systemPrompt().length > 0 ? `✅ ` : ''}Rule
                    </ToolbarLabel>
                    <ToolbarLabel
                        label={`模型 ${model().model} | ${model().type ?? 'chat'}`}
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
                        <span data-role="full-name">
                            {modelDisplayLable()}
                        </span>
                        <span data-role="symbol">
                            <SvgSymbol size="15px">iconSparkles</SvgSymbol>
                        </span>
                    </ToolbarLabel>
                    <ToolbarLabel onclick={openSetting} label='设置' role='setting' >
                        <SvgSymbol size="15px">iconSettings</SvgSymbol>
                    </ToolbarLabel>
                </div>
            </div>
            <div class={styles.inputWrapper}
                classList={{
                    [styles.folded]: isInputFolded()
                }}
                {...attachmentInputHandler.createDropHandlers(styles.dropTarget)}>
                <div class={styles.foldHandle} onclick={() => isInputFolded.update(!isInputFolded())}>
                    <div class={styles.foldButton}>
                        <SvgSymbol size="12px">{isInputFolded() ? 'iconUp' : 'iconDown'}</SvgSymbol>
                    </div>
                </div>
                <textarea
                    ref={textareaRef}
                    value={input()}
                    onInput={(e) => {
                        input.update(e.currentTarget.value);
                        adjustTextareaHeight();
                    }}
                    onPaste={(e) => {
                        attachmentInputHandler.handlePaste(e);
                    }}
                    placeholder="输入消息..."
                    class={`${styles.input}`}
                    onKeyDown={onKeyDown}
                    style={{ display: isInputFolded() ? 'none' : 'block' }}
                />
                <div class={styles.inputButtons} style={{
                    display: isInputFolded() ? 'none' : 'flex',
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
                display: session.multiModalAttachments()?.length > 0 || session.contexts()?.length > 0 ? "block" : "none",
                padding: '8px 16px',
                'border-top': 'none'
            }}>
                <AttachmentList
                    multiModalAttachments={session.multiModalAttachments()}
                    contexts={session.contexts()}
                    showDelete={true}
                    size="small"
                    onDelete={(key: number | string, type: 'attachment' | 'context') => {
                        if (type === 'attachment') {
                            session.removeAttachment(key as number);
                        } else {
                            session.delContext(key as IProvidedContext['id']);
                        }
                    }}
                />
            </div>
        </section>
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
                <div class={`${styles.chatContainer} ${isReadingMode() ? styles.readingMode : ''}`} style={styleVars()}>

                    <Topbar />
                    <MessageItems />
                    <InputContainer />

                </div>

            </SimpleProvider>
        </div>
    );
};
