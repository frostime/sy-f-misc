/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-22
 * @FilePath     : /src/func/gpt/components/SessionItemsManager.tsx
 * @Description  : 会话消息管理器组件
 */

import { Accessor, batch, Component, createEffect, createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { formatDateTime } from "@frostime/siyuan-plugin-kits";
import { confirm } from "siyuan";

import styles from './SessionItemsManager.module.scss';
import { adaptIMessageContent } from '../data-utils';
import Markdown from '@/libs/components/Elements/Markdown';
import { ButtonInput } from '@/libs/components/Elements';
import { createSignalRef } from '@frostime/solid-signal-ref';
import { UIConfig } from '@gpt/setting/store';
import { type useSession } from './UseSession';

const MAX_PREVIEW_LENGTH = 1000;

/**
 * 会话消息管理器组件
 */
const SessionItemsManager: Component<{
    session: ReturnType<typeof useSession>;
    onClose: () => void;
}> = (props) => {
    // 字体大小设置
    const fontSize = createSignalRef(UIConfig().inputFontsize);

    // 消息列表
    const messages = createMemo(() => props.session.messages());

    // 选中的消息ID列表
    const [selectedIds, setSelectedIds] = createSignal<string[]>([]);

    // 预览的消息ID
    const [previewId, setPreviewId] = createSignal<string | null>(null);

    // 预览消息内容
    const previewContent = createMemo(() => {
        const id = previewId();
        if (!id) return null;

        const msg = messages().find(item => item.id === id);
        if (!msg) return null;

        const { text } = adaptIMessageContent(msg.message.content);
        return {
            text,
            reasoning: msg.message.reasoning_content,
            role: msg.message.role,
            author: msg.author,
            timestamp: msg.timestamp,
            hidden: msg.hidden
        };
    });

    // 选择消息
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(item => item !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    // 全选
    const selectAll = () => {
        setSelectedIds(messages().map(item => item.id));
    };

    // 取消全选
    const deselectAll = () => {
        setSelectedIds([]);
    };

    // 选择指定消息之前的所有消息
    const selectBefore = (id: string) => {
        const index = messages().findIndex(item => item.id === id);
        if (index === -1) return;

        setSelectedIds(messages().slice(0, index + 1).map(item => item.id));
    };

    // 选择指定消息之后的所有消息
    const selectAfter = (id: string) => {
        const index = messages().findIndex(item => item.id === id);
        if (index === -1) return;

        setSelectedIds(messages().slice(index).map(item => item.id));
    };

    // 批量删除选中的消息
    const deleteSelected = () => {
        if (selectedIds().length === 0) return;

        confirm('确认删除', `是否删除选中的 ${selectedIds().length} 条消息？`, () => {
            // 按照索引从大到小排序，避免删除时索引变化
            const idsToDelete = [...selectedIds()];
            const indexMap = new Map<string, number>();

            messages().forEach((item, index) => {
                if (idsToDelete.includes(item.id)) {
                    indexMap.set(item.id, index);
                }
            });

            // 按索引从大到小排序
            idsToDelete.sort((a, b) => {
                const indexA = indexMap.get(a) ?? 0;
                const indexB = indexMap.get(b) ?? 0;
                return indexB - indexA;
            });

            // 依次删除
            batch(() => {
                idsToDelete.forEach(id => {
                    // props.session.delMsgItem(id);
                    props.session.messages.update((oldList: IChatSessionMsgItem[]) => {
                        return oldList.filter((i) => i.id !== id);
                    })
                });
            });

            setSelectedIds([]);
        });
    };

    // 批量隐藏/显示选中的消息
    const toggleHiddenSelected = (hidden: boolean) => {
        if (selectedIds().length === 0) return;

        const action = hidden ? '隐藏' : '显示';
        confirm(`确认${action}`, `是否${action}选中的 ${selectedIds().length} 条消息？`, () => {
            selectedIds().forEach(id => {
                // props.session.toggleMsgItemHidden(id, hidden);
                const idx = props.session.msgId2Index().get(id);
                props.session.toggleHidden(idx, hidden);
            });
        });
    };

    // 提取选中的消息创建新会话
    const extractToNewSession = () => {
        if (selectedIds().length === 0) return;

        confirm('确认提取', `是否将选中的 ${selectedIds().length} 条消息提取到新会话？`, () => {
            // 获取所有选中的消息
            const selectedMessages = messages().filter(item => selectedIds().includes(item.id));

            // 创建新会话
            const newSession = {
                title: props.session.title() + ' - 提取的会话',
                items: selectedMessages,
                sysPrompt: props.session.systemPrompt()
            };

            props.session.newSession();
            props.session.applyHistory(newSession);
            props.onClose();
        });
    };

    // 初始化预览第一条消息
    createEffect(() => {
        if (messages().length > 0 && !previewId()) {
            setPreviewId(messages()[0].id);
        }
    });

    const MessageItemCard = (props: { item: IChatSessionMsgItem, index: Accessor<number> }) => {
        const textContent = (() => {
            const { text } = adaptIMessageContent(props.item.message.content);
            return text.length > MAX_PREVIEW_LENGTH ? text.substring(0, MAX_PREVIEW_LENGTH) + '...' : text;
        });
        return (
            <div
                class={styles.messageItem}
                classList={{
                    [styles.selected]: selectedIds().includes(props.item.id),
                    [styles.previewing]: previewId() === props.item.id,
                    [styles.hidden]: props.item.hidden
                }}
                onClick={() => setPreviewId(props.item.id)}
            >
                <div class={styles.messageHeader}>
                    <div class={styles.messageRole}>
                        <span class={styles.roleLabel}>
                            {props.item?.message?.role === 'user' ? '用户' : '助手'}
                        </span>
                        <span class={styles.messageIndex}>#{props.index() + 1}</span>
                        {props.item.hidden && <span class={styles.hiddenLabel}>隐藏</span>}
                    </div>
                    <div class={styles.messageActions}>
                        <input
                            type="checkbox"
                            class="b3-switch"
                            checked={selectedIds().includes(props.item.id)}
                            onchange={() => toggleSelect(props.item.id)}
                        />
                        <button
                            class="b3-button b3-button--text"
                            onClick={(e) => {
                                e.stopPropagation();
                                selectBefore(props.item.id);
                            }}
                            title="选择此条及之前的消息"
                        >
                            <svg><use href="#iconUp"></use></svg>
                        </button>
                        <button
                            class="b3-button b3-button--text"
                            onClick={(e) => {
                                e.stopPropagation();
                                selectAfter(props.item.id);
                            }}
                            title="选择此条及之后的消息"
                        >
                            <svg><use href="#iconDown"></use></svg>
                        </button>
                    </div>
                </div>
                <div
                    classList={{
                        [styles.messagePreview]: true,
                        "ariaLabel": true
                    }}
                    aria-label={textContent()}
                >
                    {textContent()}
                </div>
                <div class={styles.messageFooter}>
                    <span>{formatDateTime(null, new Date(props.item.timestamp))}</span>
                    {props.item.message.reasoning_content && (
                        <span class={styles.reasoningBadge}>包含推理</span>
                    )}
                </div>
            </div>

        );
    }

    // 消息列表组件
    const MessageList = () => (
        <div class={styles.messageList}>
            <For each={messages()}>
                {(item, index) => (
                    <Switch>
                        <Match when={item.type === 'message'}>
                            <MessageItemCard item={item} index={index} />
                        </Match>
                        <Match when={item.type === 'seperator'}>
                            <div
                                class="b3-label__text"
                                style={{
                                    'text-align': 'center',
                                    'margin': '10px 0',
                                }}>
                                新的对话
                            </div>
                        </Match>
                    </Switch>
                )}
            </For>
        </div>
    );

    // 预览面板组件
    const PreviewPanel = () => (
        <div class={styles.previewPanel}>
            <Show when={previewContent()}>
                <div class={styles.previewHeader}>
                    <div class={styles.previewInfo}>
                        <span class={styles.previewRole}>
                            {previewContent()?.role === 'user' ? '用户' : '助手'}
                        </span>
                        <span class={styles.previewAuthor}>{previewContent()?.author}</span>
                        <span class={styles.previewTime}>
                            {formatDateTime(null, new Date(previewContent()?.timestamp || 0))}
                        </span>
                        {previewContent()?.hidden && <span class={styles.hiddenBadge}>在上下文中隐藏</span>}
                    </div>
                    <div class={styles.previewActions}>
                        <ButtonInput classText={true} onClick={() => { fontSize.value += 1; }} label="增大字体">
                            +
                        </ButtonInput>
                        <span class='b3-label__text'>/</span>
                        <ButtonInput classText={true} onClick={() => { fontSize.value -= 1; }} label="减小字体">
                            -
                        </ButtonInput>
                    </div>
                </div>
                <div class={styles.previewContent}>
                    <Show when={previewContent()?.reasoning}>
                        <details class={styles.reasoningDetails}>
                            <summary>推理过程</summary>
                            <Markdown markdown={previewContent()?.reasoning} fontSize={fontSize() + 'px'} />
                            <br />
                        </details>
                    </Show>
                    <Markdown markdown={previewContent()?.text} fontSize={fontSize() + 'px'} />
                </div>
            </Show>
        </div>
    );

    return (
        <div class={styles.container}>
            <div class={styles.toolbar}>
                <div class={styles.toolbarInfo}>
                    <span class={styles.sessionTitle}>{props.session.title()}</span>
                    <span class={styles.messageCount}>共 {messages().length} 条消息</span>
                    <span class={styles.selectedCount}>已选择 {selectedIds().length} 条</span>
                </div>
                <div class={styles.toolbarActions}>
                    <button
                        class="b3-button b3-button--outline"
                        onClick={selectAll}
                        title="全选"
                    >
                        <svg><use href="#iconCheck"></use></svg>
                        全选
                    </button>
                    <button
                        class="b3-button b3-button--outline"
                        onClick={deselectAll}
                        disabled={selectedIds().length === 0}
                        title="取消全选"
                    >
                        <svg><use href="#iconUncheck"></use></svg>
                        取消全选
                    </button>
                    <button
                        class="b3-button b3-button--outline"
                        onClick={() => toggleHiddenSelected(true)}
                        disabled={selectedIds().length === 0}
                        title="在上下文中隐藏选中的消息"
                    >
                        <svg><use href="#iconEyeoff"></use></svg>
                        批量隐藏
                    </button>
                    <button
                        class="b3-button b3-button--outline"
                        onClick={() => toggleHiddenSelected(false)}
                        disabled={selectedIds().length === 0}
                        title="在上下文中显示选中的消息"
                    >
                        <svg><use href="#iconEye"></use></svg>
                        批量显示
                    </button>
                    <button
                        class="b3-button b3-button--outline"
                        onClick={deleteSelected}
                        disabled={selectedIds().length === 0}
                        title="删除选中的消息"
                    >
                        <svg><use href="#iconTrashcan"></use></svg>
                        批量删除
                    </button>
                    <button
                        class="b3-button b3-button--outline"
                        onClick={extractToNewSession}
                        disabled={selectedIds().length === 0}
                        title="提取选中的消息到新会话"
                    >
                        <svg><use href="#iconCut"></use></svg>
                        提取到新会话
                    </button>
                </div>
            </div>
            <div class={styles.content}>
                <MessageList />
                <PreviewPanel />
            </div>
        </div>
    );
};

export default SessionItemsManager;
