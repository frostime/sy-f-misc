import { showMessage, confirm, Menu } from 'siyuan';
import { Component, createEffect, createMemo, on, Show } from 'solid-js';
import { formatDateTime, getLute, inputDialog } from "@frostime/siyuan-plugin-kits";

import { solidDialog } from '@/libs/dialog';
import { floatingEditor } from '@/libs/components/floating-editor';

import { convertMathFormulas } from '@gpt/utils';
import { adaptIMessageContent } from '@gpt/data-utils';
import { defaultConfig } from '@gpt/setting/store';

import styles from './MessageItem.module.scss';
import AttachmentList from './AttachmentList';
import { useSimpleContext } from './ChatSession.helper';
import MessageVersionView from './MessageVersionView';

import { createMarkdownRenderer } from './MessageItem.helper';



const MessageItem: Component<{
    messageItem: IChatSessionMsgItem,
    loading?: boolean; // 替换 markdown 参数为 loading
    index?: number,
    totalCount?: number;
    updateIt?: (text: string) => void;
    deleteIt?: () => void;
    rerunIt?: () => void;
    toggleHidden?: () => void;
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
        let { text } = adaptIMessageContent(props.messageItem.message.content);
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
        let { images } = adaptIMessageContent(props.messageItem.message.content);
        images = images || [];
        images = images.map(image => {
            if (image.startsWith('data:image')) {
                // 解析 data URL
                const [header, base64data] = image.split(',');
                // 将 base64 转换为二进制数组
                const binaryData = atob(base64data);
                const bytes = new Uint8Array(binaryData.length);
                for (let i = 0; i < binaryData.length; i++) {
                    bytes[i] = binaryData.charCodeAt(i);
                }
                // 从 header 中获取 MIME 类型
                const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
                // 创建 Blob
                const blob = new Blob([bytes], { type: mimeType });
                return URL.createObjectURL(blob);
            }
            return image;
        });
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
        let { text } = adaptIMessageContent(props.messageItem.message.content);
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
                        messageItemId={props.messageItem.id}
                        versions={props.messageItem.versions ?? {}}
                        currentVersion={props.messageItem.currentVersion ?? ''}
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

    const editMessage = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
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
        const messages = session.messages();
        const currentIndex = messages.findIndex(m => m.id === props.messageItem.id);
        if (currentIndex === -1) return;

        confirm('确认?', '保留以上记录，创建一个新的对话分支', () => {
            const branchMessages = messages.slice(0, currentIndex + 1);
            const newSession = {
                title: session.title() + ' - 新的分支',
                items: branchMessages,
                sysPrompt: session.systemPrompt()
            };
            session.newSession();
            session.applyHistory(newSession);
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
        menu.addItem({
            icon: 'iconAdd',
            label: '下方添加空白消息',
            click: () => {
                const timestamp = new Date().getTime();
                const newMessage: IChatSessionMsgItem = {
                    type: 'message',
                    id: window.Lute.NewNodeID(),
                    timestamp: timestamp,
                    author: 'user',
                    message: {
                        role: 'user',
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
        });
        menu.addItem({
            icon: props.messageItem.hidden ? 'iconEyeoff' : 'iconEye',
            label: props.messageItem.hidden ? '在上下文中显示' : '在上下文中隐藏',
            click: () => props.toggleHidden?.()
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
                const { text } = adaptIMessageContent(props.messageItem.message.content);
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
        if (props.messageItem.token) {
            submenus.push({
                label: `Token: ${props.messageItem.token}`,
                type: 'readonly'
            });
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
            {props.messageItem.message.role === 'user' ? (
                <div class={styles.icon}><IconUser /></div>
            ) : (
                <div class={styles.icon}><IconAssistant /></div>
            )}
            <div class={styles.messageContainer}>
                <Show when={props.messageItem.message.reasoning_content}>
                    <details class={styles.reasoningDetails}>
                        <summary>推理过程</summary>
                        <div
                            class={`${styles.reasoningContent} b3-typography`}
                            innerHTML={
                                // @ts-ignore
                                lute.Md2HTML(props.messageItem.message.reasoning_content)
                            }
                        />
                    </details>
                </Show>
                <div
                    oncontextmenu={onContextMenu}
                    classList={{
                        [styles.message]: true,
                        [styles[props.messageItem.message.role]]: true,
                        'b3-typography': true,
                        [styles.hidden]: props.messageItem.hidden
                    }}
                    // style={{
                    //     'white-space': props.loading ? 'pre-wrap' : '',
                    // }}
                    innerHTML={messageAsHTML()}
                    ref={msgRef}
                />
                <Show when={imageUrls().length > 0 || props.messageItem.context?.length > 0}>
                    <AttachmentList
                        images={imageUrls()}
                        contexts={props.messageItem.context}
                        size="small"
                    />
                </Show>
                <div class={styles.toolbar}>
                    {/* <span data-label="index">
                        {props.index}
                    </span>
                    <span>|</span> */}
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
                        {props.messageItem.attachedItems ? `上下文条目: ${props.messageItem.attachedItems}` : ''}
                    </span>
                    <span data-label="attachedChars">
                        {props.messageItem.attachedChars ? `上下文字数: ${props.messageItem.attachedChars}` : ''}
                    </span>
                    <Show when={props.messageItem.token}>
                        <span data-label="token" class="counter" style={{ padding: 0 }}>Token: {props.messageItem.token}</span>
                    </Show>

                    <div class="fn__flex-1" />

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
                        title={props.messageItem.hidden ? "在上下文中显示" : "在上下文中隐藏"}
                        onclick={(e: MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            props.toggleHidden?.();
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
        </div>
    )
}

export default MessageItem;
