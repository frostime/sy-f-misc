/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-22
 * @FilePath     : /src/func/gpt/chat/components/SessionItemsManager.tsx
 * @Description  : 会话消息管理器组件
 */

import { Accessor, Component, createEffect, createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { formatDateTime } from "@frostime/siyuan-plugin-kits";
import { confirm } from "siyuan";

import Markdown from '@/libs/components/Elements/Markdown';
import { ButtonInput } from '@/libs/components/Elements';
import { createSignalRef } from '@frostime/solid-signal-ref';

import { extractMessageContent, getMeta, getPayload, getMessageProp } from '@gpt/chat-utils';
import { UIConfig } from '@/func/gpt/model/store';
import { type useSession } from '../ChatSession/use-chat-session';
import styles from './SessionItemsManager.module.scss';

const MAX_PREVIEW_LENGTH = 1000;

/**
 * 会话消息管理器组件
 */
const SessionItemsManager: Component<{
    session: ReturnType<typeof useSession>;
    onClose: () => void;
    focusTo: (id: IChatSessionMsgItemV2['id']) => void;
}> = (props) => {

    // 字体大小设置
    const fontSize = createSignalRef(UIConfig().inputFontsize);

    // 消息列表（使用封装接口）
    const messages = createMemo(() => props.session.getActiveMessages());

    // 选中的消息ID列表
    const [selectedIds, setSelectedIds] = createSignal<string[]>([]);

    // 预览的消息ID
    const [previewId, setPreviewId] = createSignal<string | null>(null);

    // 预览消息内容
    const previewContent = createMemo(() => {
        const id = previewId();
        if (!id) return null;

        const msg = props.session.getMessageAt({ id });
        if (!msg) return null;

        const { text } = extractMessageContent(getPayload(msg, 'message').content);
        return {
            text,
            reasoning: getMessageProp(msg, 'reasoning_content'),
            role: getMessageProp(msg, 'role'),
            author: getPayload(msg, 'author'),
            timestamp: getPayload(msg, 'timestamp'),
            hidden: getMeta(msg, 'hidden')
        };
    });

    // 选择消息
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) {
                return prev.filter((item: string) => item !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    // 全选
    const selectAll = () => {
        setSelectedIds(messages().map((item: IChatSessionMsgItemV2) => item.id));
    };

    // 取消全选
    const deselectAll = () => {
        setSelectedIds([]);
    };

    // 选择指定消息之前的所有消息
    const selectBefore = (id: string) => {
        const messagesToSelect = props.session.getMessagesBefore({ id }, true);
        const idsToSelect = messagesToSelect.map((item: IChatSessionMsgItemV2) => item.id);

        // 检查是否所有消息都已被选中
        const allSelected = idsToSelect.every(id => selectedIds().includes(id));

        // 如果所有消息都已被选中，则取消选择；否则选择这些消息
        if (allSelected) {
            setSelectedIds(prev => prev.filter(id => !idsToSelect.includes(id)));
        } else {
            setSelectedIds(idsToSelect);
        }
    };

    // 选择指定消息之后的所有消息
    const selectAfter = (id: string) => {
        const messagesToSelect = props.session.getMessagesAfter({ id }, true);
        const idsToSelect = messagesToSelect.map((item: IChatSessionMsgItemV2) => item.id);

        // 检查是否所有消息都已被选中
        const allSelected = idsToSelect.every(id => selectedIds().includes(id));

        // 如果所有消息都已被选中，则取消选择；否则选择这些消息
        if (allSelected) {
            setSelectedIds(prev => prev.filter(id => !idsToSelect.includes(id)));
        } else {
            setSelectedIds(idsToSelect);
        }
    };

    // 批量删除选中的消息
    const deleteSelected = () => {
        if (selectedIds().length === 0) return;

        confirm('确认删除', `是否删除选中的 ${selectedIds().length} 条消息？`, () => {
            // 批量删除选中的消息
            const idsToDelete = [...selectedIds()];

            // 使用新的封装接口批量删除消息
            props.session.deleteMessages(idsToDelete.map(id => ({ id })));

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

            // 重置选中状态
            setSelectedIds([]);
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
        if (props.session.hasMessages() && !previewId()) {
            const firstMessage = props.session.getActiveMessages()[0];
            setPreviewId(firstMessage.id);
        }
    });

    const MessageItemCard = (subProps: { item: IChatSessionMsgItemV2, index: Accessor<number> }) => {
        const textContent = (() => {
            const { text } = extractMessageContent(getPayload(subProps.item, 'message').content);
            const snapshot = text.length > MAX_PREVIEW_LENGTH ? text.substring(0, MAX_PREVIEW_LENGTH) + '...' : text;
            const length = text.length;
            return {
                text: snapshot,
                length: length
            }
        });
        return (
            <div
                class={styles.messageItem}
                classList={{
                    [styles.selected]: selectedIds().includes(getMeta(subProps.item, 'id')),
                    [styles.previewing]: previewId() === getMeta(subProps.item, 'id'),
                    [styles.hidden]: getMeta(subProps.item, 'hidden')
                }}
                onClick={() => setPreviewId(getMeta(subProps.item, 'id'))}
            >
                <div class={styles.messageHeader}>
                    <div class={styles.messageRole}>
                        <span class={styles.roleLabel}>
                            {/* {subProps.item?.message?.role === 'user' ? '用户' : '助手'} */}
                            {getMeta(subProps.item, 'role') === 'user' ? '用户' : '助手'}
                        </span>
                        <span class={styles.messageIndex}>#{subProps.index() + 1}</span>
                        {getMeta(subProps.item, 'hidden') && <span class={styles.hiddenLabel}>隐藏</span>}
                    </div>
                    <div class={styles.messageActions}>
                        <button
                            class="b3-button b3-button--text"
                            onClick={(e) => {
                                e.stopPropagation();
                                props.focusTo(subProps.item.id);
                            }}
                            title="聚焦到此消息"
                        >
                            <svg><use href="#iconFocus" /></svg>
                        </button>
                        <input
                            type="checkbox"
                            class="b3-switch"
                            checked={selectedIds().includes(subProps.item.id)}
                            onchange={() => toggleSelect(subProps.item.id)}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <button
                            class="b3-button b3-button--text"
                            onClick={(e) => {
                                e.stopPropagation();
                                selectBefore(subProps.item.id);
                            }}
                            title="选择此条及之前的消息"
                        >
                            <svg><use href="#iconUp"></use></svg>
                        </button>
                        <button
                            class="b3-button b3-button--text"
                            onClick={(e) => {
                                e.stopPropagation();
                                selectAfter(subProps.item.id);
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
                    aria-label={textContent().text}
                >
                    {textContent().text}
                </div>
                <div class={styles.messageFooter}>
                    <span>{formatDateTime(null, new Date(getPayload(subProps.item, 'timestamp')))}</span>
                    <span>{textContent().length}字</span>
                    {getMessageProp(subProps.item, 'reasoning_content') && (
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
                    <Switch fallback={
                        <div
                            class="b3-label__text"
                            style={{
                                'text-align': 'center',
                                'margin': '10px 0',
                            }}>
                            错误 - 未知消息类型
                        </div>
                    }>
                        <Match when={getMeta(item, 'type') === 'message'}>
                            <MessageItemCard item={item} index={index} />
                        </Match>
                        <Match when={getMeta(item, 'type') === 'separator'}>
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
                    <span class={styles.messageCount}>共 {props.session.getMessageCount()} 条消息</span>
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
