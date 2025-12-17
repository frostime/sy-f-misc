import { showMessage, confirm, Menu } from 'siyuan';
import { Component, createEffect, createMemo, on, Show } from 'solid-js';
import { formatDateTime, getLute, inputDialog } from "@frostime/siyuan-plugin-kits";

import { solidDialog } from '@/libs/dialog';
import { floatingEditor } from '@/libs/components/floating-editor';

import { convertMathFormulas } from '@gpt/utils';
import { extractMessageContent } from '@gpt/chat-utils';
import { defaultConfig } from '@/func/gpt/model/store';
import * as persist from '@gpt/persistence';

import styles from './MessageItem.module.scss';
import AttachmentList from './AttachmentList';
import { useSimpleContext } from '../ChatSession/ChatSession.helper';
import MessageVersionView from './MessageVersionView';
import ToolChainIndicator from './ToolChainIndicator';

import { createMarkdownRenderer } from './MessageItem.helper';
import { floatSiYuanTextEditor } from '../utils';



const MessageItem: Component<{
    messageItem: IChatSessionMsgItem,
    loading?: boolean; // 替换 markdown 参数为 loading
    index?: number,
    totalCount?: number;
    updateIt?: (text: string) => void;
    deleteIt?: () => void;
    rerunIt?: () => void;
    toggleHidden?: () => void;
    togglePinned?: () => void;
    toggleSeperator?: () => void;
    multiSelect?: boolean;
    // Remove the selected prop and simplify onSelect
    onSelect?: (id: string) => void;
}> = (props) => {

    let lute = getLute();
    let msgRef: HTMLDivElement;
    const { session } = useSimpleContext();

    // Create markdown renderer hook
    const markdownRenderer = createMarkdownRenderer();

    const textContent = createMemo(() => {
        let { text } = extractMessageContent(props.messageItem.message.content);
        if (props.messageItem.userPromptSlice) {
            //隐藏 context prompt，现在 context 在用户输入前面
            text = text.slice(props.messageItem.userPromptSlice[0], props.messageItem.userPromptSlice[1]);
        }

        if (defaultConfig().convertMathSyntax) {
            text = convertMathFormulas(text);
        }
        return text;
    });

    const imageUrls = createMemo(() => {
        let { images } = extractMessageContent(props.messageItem.message.content);
        if (!images || images.length === 0) {
            return [];
        }
        return images;
    });

    // Use the hook to render markdown
    const messageAsHTML = createMemo(() => {
        const currentText = textContent();
        const html = markdownRenderer.renderMarkdown(
            currentText,
            props.loading
        );
        return html;
    });

    const msgLength = createMemo(() => {
        let { text } = extractMessageContent(props.messageItem.message.content);
        return text.length;
    });

    createEffect(on(() => props.messageItem.message.content, () => {
        if (props.loading === true) return; // 在加载状态下不触发额外渲染; 主要给 edit message 导致消息发生变更的情况使用
        // console.log(`Msg.content changed: ${props.messageItem.message.content}`);
        markdownRenderer.renderHTMLBlock(msgRef);
    }));

    // 当加载状态从 true 变为 false 时，触发渲染并重置状态
    createEffect(on(() => props.loading, (loading, prevLoading) => {
        if (prevLoading === true && loading === false) {
            // 触发完整渲染
            markdownRenderer.renderHTMLBlock(msgRef);
        }
    }));

    const VersionHooks = {
        hasMultiVersion: () => {
            return props.messageItem.versions && Object.keys(props.messageItem.versions).length > 1;
        },
        versionKeys: () => {
            if (!VersionHooks.hasMultiVersion()) return [];
            return Object.keys(props.messageItem.versions).map((_, index) => `v${index + 1}`);
        },
        currentVersion: () => {
            let index = 1;
            if (props.messageItem.versions[props.messageItem.currentVersion]) {
                index = Object.keys(props.messageItem.versions).indexOf(props.messageItem.currentVersion) + 1;
            }
            return `v${index}`;
        },
        switchVersionMenu: () => {
            if (!VersionHooks.hasMultiVersion()) return [];
            return Object.keys(props.messageItem.versions).map((version, index) => {
                return {
                    icon: version === props.messageItem.currentVersion ? 'iconCheck' : '',
                    label: `v${index + 1}`,
                    click: (_: unknown, event: MouseEvent) => {
                        const target = event.target as HTMLElement;
                        if (target.closest('.b3-menu__action')) {
                            session.delMsgItemVersion(props.messageItem.id, version);
                        } else {
                            session.switchMsgItemVersion(props.messageItem.id, version);
                        }
                    },
                    action: `iconClose`
                }
            });
        },
        switchVersionDialog: () => {
            if (!VersionHooks.hasMultiVersion()) {
                showMessage('当前消息没有多版本');
                return;
            }
            const { dialog } = solidDialog({
                title: '多选版本',
                loader: () => (
                    <MessageVersionView
                        session={session}
                        messageItem={props.messageItem}
                        onClose={() => {
                            dialog.destroy();
                        }}
                    />
                ),
                width: '1600px',
                height: '1000px',
                maxHeight: '85%',
                maxWidth: '90%'
            });
        }
    }

    // #iconAccount
    const IconUser = () => (
        <svg>
            <use href="#iconAccount" />
        </svg>
    );

    const IconAssistant = () => (
        <svg>
            <use href="#iconGithub" />
        </svg>
    );

    const editMessage = (e: MouseEvent, useSiYuanEditor: boolean = false) => {
        e.stopPropagation();
        e.preventDefault();
        if (!useSiYuanEditor) {
            floatingEditor({
                initialText: textContent(),
                onConfirm: (text) => {
                    props.updateIt?.(text);
                },
                onCancel: () => {
                    // console.log('取消编辑');
                },
                title: '编辑消息',
                placeholder: '请输入消息内容',
                initialPosition: {
                    x: e.clientX,
                    y: e.clientY
                },
                style: {
                    width: '450px',
                    height: '320px'
                }
            })
        } else {
            floatSiYuanTextEditor({
                initialText: textContent(),
                onConfirm: (text) => {
                    props.updateIt?.(text);
                },
                onClose: () => {

                },
                initialPosition: {
                    x: e.clientX,
                    y: e.clientY
                },
                style: {
                    width: '700px',
                    height: '320px'
                }
            })
        }
    }

    const copyMessage = () => {
        try {
            // 强制将焦点设置到文档的 body 元素上
            document.body.focus();
            navigator.clipboard.writeText(textContent());
            showMessage('已复制到剪贴板');
        } catch (error) {
            console.error('剪贴板操作失败:', error);
            showMessage('复制失败，请重试');
        }
    };

    const deleteMessage = () => {
        props.deleteIt?.();
    }

    const createNewBranch = () => {
        const messages = session.messages.unwrap();
        const currentIndex = messages.findIndex(m => m.id === props.messageItem.id);
        if (currentIndex === -1) return;

        confirm('确认?', '保留以上记录，创建一个新的对话分支', () => {
            const sourceSessionId = session.sessionId();
            const sourceSessionTitle = session.title();
            const sourceMessageId = props.messageItem.id;
            const newSessionId = window.Lute.NewNodeID();
            const newSessionTitle = session.title() + ' - 新的分支';

            // 1. Update current session (Source)
            session.messages.update(currentIndex, (msg) => {
                const newBranch = {
                    sessionId: newSessionId,
                    sessionTitle: newSessionTitle,
                    messageId: sourceMessageId
                };
                const currentBranches = msg.branchTo || [];
                const branchTo = [...currentBranches, newBranch];
                //unique
                const uniqueBranchTo = Array.from(new Map(branchTo.map(item => [item.sessionId + item.messageId, item])).values());
                return { ...msg, branchTo: uniqueBranchTo };
            });

            // Save the source session immediately to persist the link
            persist.saveToLocalStorage(session.sessionHistory());

            // 2. Prepare new session (Target)
            const slices = messages.slice(0, currentIndex + 1);
            const branchMessages = structuredClone(slices);
            const lastMsg = branchMessages[branchMessages.length - 1];

            // Set branchFrom on the last message of the new session
            lastMsg.branchFrom = {
                sessionId: sourceSessionId,
                sessionTitle: sourceSessionTitle,
                messageId: sourceMessageId
            };
            // Clear branchTo in the new session's copy
            delete lastMsg.branchTo;

            const newSessionData: Partial<IChatSessionHistory> = {
                id: newSessionId,
                title: newSessionTitle,
                items: branchMessages,
                sysPrompt: session.systemPrompt(),
                customOptions: session.modelCustomOptions()
            };

            // 3. Switch
            session.newSession();
            session.applyHistory(newSessionData);

            // Save the new session
            persist.saveToLocalStorage(session.sessionHistory());
        });
    };

    const ToolbarButton = (props: {
        icon: string, title?: string, onclick: (e?: MouseEvent) => void
    }) => {
        return (
            <button
                class={`${styles.toolbarButton} b3-button b3-button--text`}
                onclick={(e) => {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    props.onclick(e);
                }}
                title={props.title}
            >
                <svg><use href={`#${props.icon}`} /></svg>
            </button>
        );
    }

    const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const menu = new Menu("message-item-menu");
        // Add action buttons
        menu.addItem({
            icon: 'iconEdit',
            label: '编辑',
            click: (_, e) => editMessage(e)
        });
        menu.addItem({
            icon: 'iconSiYuan',
            label: '思源编辑',
            click: (_, e) => editMessage(e, true)
        });
        menu.addItem({
            icon: 'iconCopy',
            label: '复制',
            click: copyMessage
        });
        menu.addItem({
            icon: 'iconFiles',
            label: '新的分支',
            click: createNewBranch
        });
        menu.addItem({
            icon: 'iconLine',
            label: '下方添加分隔',
            click: () => props.toggleSeperator?.()
        });
        const addBlank = (type: 'user' | 'assistant') => {
            const timestamp = new Date().getTime();
            const newMessage: IChatSessionMsgItem = {
                type: 'message',
                id: window.Lute.NewNodeID(),
                timestamp: timestamp,
                author: 'user',
                message: {
                    role: type,
                    content: ''
                },
                currentVersion: timestamp.toString(),
                versions: {}
            };
            session.messages.update((oldList: IChatSessionMsgItem[]) => {
                const index = oldList.findIndex(item => item.id === props.messageItem.id);
                if (index === -1) return oldList;
                const newList = [...oldList];
                newList.splice(index + 1, 0, newMessage);
                return newList;
            });
        }
        menu.addItem({
            icon: 'iconAdd',
            label: '下方添加空白消息',
            click: () => {
                addBlank('user');
            },
            submenu: [
                {
                    icon: 'iconUser',
                    label: '添加用户消息',
                    click: () => addBlank('user')
                },
                {
                    icon: 'iconAssistant',
                    label: '添加助手消息',
                    click: () => addBlank('assistant')
                }
            ]
        });
        menu.addItem({
            icon: props.messageItem.hidden ? 'iconEyeoff' : 'iconEye',
            label: props.messageItem.hidden ? '在上下文中显示' : '在上下文中隐藏',
            click: () => props.toggleHidden?.()
        });
        menu.addItem({
            icon: 'iconPin',
            label: props.messageItem.pinned ? '取消固定' : '固定消息',
            click: () => props.togglePinned?.()
        });
        menu.addItem({
            icon: 'iconTrashcan',
            label: '删除',
            click: () => {
                confirm('确认?', '是否删除此消息', () => {
                    deleteMessage();
                });
            }
        });
        menu.addItem({
            icon: 'iconRefresh',
            label: '重新运行',
            click: () => {
                confirm('确认?', '是否重新运行此消息', () => {
                    props.rerunIt?.();
                });
            }
        });
        menu.addItem({
            icon: 'iconAdd',
            label: '添加消息版本',
            click: (_, e) => {
                floatingEditor({
                    initialText: textContent(),
                    onConfirm: (text) => {
                        const originalText = textContent().trim();
                        const newText = text.trim();
                        if (!text || !text.trim()) {
                            showMessage('新版本内容不能为空');
                            return;
                        }
                        if (originalText === newText) {
                            showMessage('新版本内容与原内容相同，未添加新版本');
                            return;
                        }
                        session.addMsgItemVersion(props.messageItem.id, text.trim());
                        showMessage('已添加新的消息版本');
                    },
                    onCancel: () => {
                        // console.log('取消添加版本');
                    },
                    title: '添加消息版本',
                    placeholder: '请输入新版本的消息内容',
                    initialPosition: {
                        x: e.clientX,
                        y: e.clientY
                    },
                    style: {
                        width: '450px',
                        height: '320px'
                    }
                });
            }
        });
        if (VersionHooks.hasMultiVersion()) {
            menu.addItem({
                icon: 'iconHistory',
                label: '消息多版本',
                click: VersionHooks.switchVersionDialog
            });
        }

        menu.addSeparator();
        menu.addItem({
            icon: 'iconPreview',
            label: '查看原始 Prompt',
            click: () => {
                const { text } = extractMessageContent(props.messageItem.message.content);
                inputDialog({
                    title: '原始 Prompt',
                    defaultText: text,
                    type: 'textarea',
                    width: '700px',
                    height: '500px'
                });
            }
        })

        const submenus = [];

        submenus.push({
            label: `作者: ${props.messageItem.author}`,
            type: 'readonly'
        });
        submenus.push({
            label: `消息长度: ${msgLength()}`,
            type: 'readonly'
        });
        if (props.messageItem.attachedItems) {
            submenus.push({
                label: `上下文条目: ${props.messageItem.attachedItems}`,
                type: 'readonly'
            });
        }
        if (props.messageItem.attachedChars) {
            submenus.push({
                label: `上下文字数: ${props.messageItem.attachedChars}`,
                type: 'readonly'
            });
        }
        // if (props.messageItem.token) {
        //     submenus.push({
        //         label: `Token: ${props.messageItem.token}`,
        //         type: 'readonly'
        //     });
        // }
        if (props.messageItem.usage) {
            submenus.push({
                label: `Token: ${props.messageItem.usage?.total_tokens} ↑ ${props.messageItem.usage?.prompt_tokens} ↓ ${props.messageItem.usage?.completion_tokens}`,
                type: 'readonly'
            })
        }

        menu.addItem({
            icon: 'iconInfo',
            type: 'submenu',
            label: '相关信息',
            submenu: submenus
        });

        menu.open({
            x: e.clientX,
            y: e.clientY
        });
    }

    const VersionIndicator = () => {
        const showVersionMenu = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();

            const menu = new Menu("version-menu");

            // Add version switch items
            VersionHooks.switchVersionMenu().forEach((item) => {
                menu.addItem(item);
            });

            // Add view all versions option
            menu.addSeparator();
            menu.addItem({
                icon: 'iconList',
                label: '查看所有版本',
                click: VersionHooks.switchVersionDialog
            });

            const target = e.target as HTMLElement;
            const rect = target.getBoundingClientRect();
            menu.open({
                x: rect.left,
                y: rect.bottom
            });
        };

        return (
            <Show when={VersionHooks.hasMultiVersion()}>
                <div
                    class={styles.versionIndicator}
                    onClick={showVersionMenu}
                    title="消息版本"
                >
                    <svg><use href="#iconHistory" /></svg>
                    {VersionHooks.currentVersion()}
                </div>
            </Show>
        );
    };

    const PinIndicator = () => (
        <Show when={props.messageItem.pinned}>
            <div
                class={styles.pinIndicator}
                title="已固定"
                onClick={(e) => {
                    e.stopPropagation();
                    props.togglePinned?.();
                }}
            >
                <svg><use href="#iconPin" /></svg>
            </div>
        </Show>
    );

    const BranchIndicator = () => {
        const switchSession = (sessionId: string, targetMsgId?: string) => {
            // Save current
            persist.saveToLocalStorage(session.sessionHistory());

            // Load target
            const key = `gpt-chat-${sessionId}`;
            const data = localStorage.getItem(key);
            if (data) {
                const history = JSON.parse(data);
                session.newSession();
                session.applyHistory(history);

                if (targetMsgId) {
                    setTimeout(() => {
                        const selector = `[data-session-id="${sessionId}"] [data-msg-id="${targetMsgId}"]`;
                        const element = document.querySelector(selector) as HTMLElement;
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            element.classList.add(styles.highlight);
                            setTimeout(() => {
                                element.classList.remove(styles.highlight);
                            }, 2000);
                        }
                    }, 300);
                }
            } else {
                showMessage('无法找到目标会话');
            }
        };

        const showBranchMenu = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const menu = new Menu("branch-menu");

            if (props.messageItem.branchFrom) {
                const from = props.messageItem.branchFrom;
                menu.addItem({
                    icon: 'iconReply',
                    label: `来自: ${from.sessionTitle}`,
                    click: () => switchSession(from.sessionId, from.messageId)
                });
            }

            if (props.messageItem.branchTo && props.messageItem.branchTo.length > 0) {
                if (props.messageItem.branchFrom) menu.addSeparator();

                menu.addItem({
                    label: '分支列表',
                    type: 'readonly'
                });

                props.messageItem.branchTo.forEach(to => {
                    menu.addItem({
                        icon: 'iconSplitLR',
                        label: `前往: ${to.sessionTitle}`,
                        click: () => switchSession(to.sessionId, to.messageId)
                    });
                });
            }

            const target = e.target as HTMLElement;
            const rect = target.getBoundingClientRect();
            menu.open({
                x: rect.left,
                y: rect.bottom
            });
        };

        const hasBranch = props.messageItem.branchFrom || (props.messageItem.branchTo && props.messageItem.branchTo.length > 0);

        return (
            <Show when={hasBranch}>
                <div
                    class={styles.branchIndicator}
                    onClick={showBranchMenu}
                    title="分支信息"
                >
                    <svg><use href="#iconSplitLR" /></svg>
                    <Show when={props.messageItem.branchTo?.length}>
                        <span>{props.messageItem.branchTo?.length}</span>
                    </Show>
                </div>
            </Show>
        );
    };

    const ReasoningSection = () => {
        const isAssistant = () => props.messageItem.message?.role === 'assistant';

        const reasoningContent = () => {
            if (isAssistant()) {
                const message = props.messageItem.message;
                return message.reasoning_content;
            }
            return null;
        }

        const copyReasoningContent = (e: MouseEvent) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            try {
                document.body.focus();
                navigator.clipboard.writeText(reasoningContent());
                showMessage('已复制推理过程到剪贴板');
            } catch (error) {
                console.error('剪贴板操作失败:', error);
                showMessage('复制失败，请重试');
            }
        };

        return (
            <Show when={reasoningContent()}>
                <details class={styles.reasoningDetails}>
                    <summary>
                        推理过程
                        <button
                            class={`${styles.toolbarButton} b3-button b3-button--text`}
                            style={{ "margin-left": "8px" }}
                            onclick={copyReasoningContent}
                            title="复制推理过程"
                        >
                            <svg><use href="#iconCopy" /></svg>
                        </button>
                    </summary>
                    <div
                        class={`${styles.reasoningContent} b3-typography`}
                        innerHTML={
                            // @ts-ignore
                            lute.Md2HTML(props.messageItem.message.reasoning_content)
                        }
                    />
                </details>
            </Show>
        );
    };

    const attachedText = () => {
        const texts = [];
        if (props.messageItem.attachedItems) {
            texts.push(`${props.messageItem.attachedItems}条`);
        }
        if (props.messageItem.attachedChars) {
            texts.push(`${props.messageItem.attachedChars}字`);
        }
        return '上下文: ' + texts.join('/');
    }

    const MessageToolbar = () => {
        return (
            <div class={styles.toolbar}>
                <div class={styles['toolbar-text']}>
                    <span data-label="timestamp">
                        {formatDateTime(null, new Date(props.messageItem.timestamp))}
                    </span>
                    <span data-label="author">
                        {props.messageItem.author}
                    </span>
                    <span data-label="msgLength">
                        消息长度: {msgLength()}
                    </span>
                    <span data-label="attachedItems">
                        {/* {props.messageItem.attachedItems ? `上下文条目: ${props.messageItem.attachedItems}` : ''} */}
                        {attachedText()}
                    </span>
                    {/* <span data-label="attachedChars">
                    {props.messageItem.attachedChars ? `上下文字数: ${props.messageItem.attachedChars}` : ''}
                </span> */}
                    <Show when={props.messageItem.usage}>
                        <span data-label="token" class="counter"
                            style={{
                                padding: 0, 'line-height': 'unset', 'font-size': '12px'
                            }}
                        >
                            {/* Token: {props.messageItem.token} */}
                            Token: {props.messageItem.usage?.total_tokens} ↑ {props.messageItem.usage?.prompt_tokens} ↓ {props.messageItem.usage?.completion_tokens}
                        </span>
                    </Show>

                    <Show when={props.messageItem.time}>
                        <span data-label="time" class="counter"
                            style={{
                                padding: 0, 'line-height': 'unset', 'font-size': '12px'
                            }}
                        >
                            时延: {props.messageItem.time.latency} ms
                            <Show when={props.messageItem.time.throughput}>
                                &nbsp;|&nbsp;吞吐量: {props.messageItem.time.throughput.toFixed(2)} tokens/s
                            </Show>
                        </span>

                    </Show>
                </div>
                {/* 
                <div class="fn__flex-1" /> */}

                <div class={styles['toolbar-buttons']}>
                    <ToolbarButton icon="iconEdit" title="编辑" onclick={editMessage} />
                    <ToolbarButton icon="iconCopy" title="复制" onclick={copyMessage} />
                    <ToolbarButton icon="iconLine" title="下方添加分隔" onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        e.preventDefault();
                        props.toggleSeperator?.();
                    }} />
                    <ToolbarButton icon="iconSplitLR" title="新的分支" onclick={createNewBranch} />
                    <ToolbarButton
                        icon={props.messageItem.hidden ? "iconEyeoff" : "iconEye"}
                        title={props.messageItem.hidden ? "在上下文中显示" : "固定消息"}
                        onclick={(e: MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            props.toggleHidden?.();
                        }}
                    />
                    <ToolbarButton
                        icon="iconPin"
                        title={props.messageItem.pinned ? "取消固定" : "固定消息"}
                        onclick={(e: MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            props.togglePinned?.();
                        }}
                    />
                    <ToolbarButton icon="iconTrashcan" title="删除" onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // Ctrl + 点击
                        if (e.ctrlKey) {
                            deleteMessage();
                        } else {
                            showMessage('如果想要删除此消息，请按 Ctrl + 点击');
                        }
                    }} />
                    <ToolbarButton icon="iconRefresh" title="重新运行" onclick={(e: MouseEvent) => {
                        // Ctrl + 点击
                        if (e.ctrlKey) {
                            props.rerunIt?.();
                        } else {
                            showMessage('如果想要重新运行，请按 Ctrl + 点击');
                        }
                    }} />
                </div>
            </div>
        );
    };

    return (
        <div class={styles.messageItem} data-role={props.messageItem.message.role}
            data-msg-id={props.messageItem.id}
            tabindex={props.index ?? -1}
            onKeyDown={(e: KeyboardEvent & { currentTarget: HTMLElement }) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();

                    if (props.index === undefined || props.totalCount === undefined) return;

                    const direction = e.key === 'ArrowUp' ? -1 : 1;
                    const targetIndex = props.index + direction;

                    if (targetIndex >= 0 && targetIndex < props.totalCount) {
                        const targetElement = document.querySelector(`[data-session-id="${session.sessionId()}"] .${styles.messageItem}[tabindex="${targetIndex}"]`) as HTMLElement;
                        if (targetElement) {
                            targetElement.focus();
                            targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
                        }
                    }
                }
            }}
        >
            <Show when={props.multiSelect}>
                <div class={styles.checkbox} onclick={(e) => {
                    e.stopPropagation();
                    // Simplify the onSelect call since we're not tracking selection state here anymore
                    props.onSelect?.(props.messageItem.id);
                }}>
                    <svg>
                        <use href="#iconUncheck" />
                    </svg>
                </div>
            </Show>
            <VersionIndicator />
            <PinIndicator />
            <BranchIndicator />
            {props.messageItem.message.role === 'user' ? (
                <div class={styles.icon}><IconUser /></div>
            ) : (
                <div class={styles.icon}><IconAssistant /></div>
            )}
            <div class={styles.messageContainer}>
                <div class="message-content" style={{
                    'display': 'contents'
                }}>
                    <ReasoningSection />
                    <div
                        oncontextmenu={onContextMenu}
                        classList={{
                            [styles.message]: true,
                            [styles[props.messageItem.message.role]]: true,
                            'b3-typography': true,
                            [styles.hidden]: props.messageItem.hidden,
                            [styles.pinned]: props.messageItem.pinned
                        }}
                        // style={{
                        //     'white-space': props.loading ? 'pre-wrap' : '',
                        // }}
                        innerHTML={messageAsHTML()}
                        ref={msgRef}
                    />
                </div>
                <Show when={imageUrls().length > 0 || props.messageItem.context?.length > 0}>
                    <AttachmentList
                        images={imageUrls()}
                        contexts={props.messageItem.context}
                        size="small"
                    />
                </Show>
                {/* 只在 assistant 消息中显示工具调用指示器 */}
                <Show when={props.messageItem.message.role === 'assistant'}>
                    <ToolChainIndicator messageItem={props.messageItem} />
                </Show>
                <MessageToolbar />
            </div>
        </div>
    )
}

export default MessageItem;
