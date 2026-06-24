/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-24
 * @FilePath     : /src/func/gpt/chat/components/TurnEditPanel.tsx
 * @Description  : Standard 模式 turn 多段编辑面板。
 *                 列出所有 assistant 文本段（中间段 + 最终段）可编辑，tool 消息只读展示。
 *                 确认时产出 { finalMessageContent, intermediateEdits }。
 */
import { Component, createSignal, For, Show, createMemo } from 'solid-js';
import { extractContentText, getPayload } from '@gpt/chat-utils';
import ToolCallRow from './ToolCallRow';
import styles from './ToolChainTimeline.module.scss';

export interface TurnEdits {
    finalMessageContent: string;
    intermediateEdits?: Record<number, string>;
}

interface TurnEditPanelProps {
    messageItem: IChatSessionMsgItemV2;
    onConfirm: (edits: TurnEdits) => void;
    onCancel?: () => void;
}

const TurnEditPanel: Component<TurnEditPanelProps> = (props) => {
    const toolChainMessages = createMemo(() => getPayload(props.messageItem, 'toolChainMessages') ?? []);
    const finalMessage = createMemo(() => getPayload(props.messageItem, 'message')!);
    const toolChainResult = createMemo(() => getPayload(props.messageItem, 'toolChainResult'));

    const toolResultMap = createMemo(() => {
        const map = new Map<string, any>();
        const history = toolChainResult()?.toolCallHistory;
        if (history) {
            for (const entry of history) map.set(entry.callId, entry);
        }
        return map;
    });

    // 序列: [...toolChainMessages, message]; 末索引 = 最终段
    const sequence = createMemo(() => [...toolChainMessages(), finalMessage()]);
    const lastIndex = createMemo(() => sequence().length - 1);

    // 各 assistant 文本段的编辑 signal
    const [editBuffer, setEditBuffer] = createSignal<Record<number, string>>({});
    const [finalBuffer, setFinalBuffer] = createSignal<string>(
        extractContentText(finalMessage().content)
    );

    const setIntermediate = (idx: number, val: string) => {
        setEditBuffer(prev => ({ ...prev, [idx]: val }));
    };

    const handleConfirm = () => {
        const intermediateEdits: Record<number, string> = {};
        for (const [idx, val] of Object.entries(editBuffer())) {
            intermediateEdits[Number(idx)] = val;
        }
        props.onConfirm({
            finalMessageContent: finalBuffer(),
            intermediateEdits: Object.keys(intermediateEdits).length > 0 ? intermediateEdits : undefined
        });
    };

    return (
        <div style={{
            width: '100%',
            height: '100%',
            "max-height": "70vh",
            "overflow-y": "auto",
            padding: '12px',
            "box-sizing": 'border-box'
        }}>
            <For each={sequence()}>
                {(msg, index) => {
                    const isLast = createMemo(() => index() === lastIndex());
                    const text = createMemo(() => {
                        if (msg.role !== 'assistant') return '';
                        return extractContentText(msg.content);
                    });
                    const toolCalls = createMemo(() =>
                        msg.role === 'assistant' ? (msg as any).tool_calls as IToolCallResponse[] | undefined : undefined
                    );
                    const hasText = createMemo(() => text().trim().length > 0);
                    const hasToolCalls = createMemo(() => (toolCalls()?.length ?? 0) > 0);

                    return (
                        <div style={{ "margin-bottom": '12px', width: '100%', "box-sizing": 'border-box' }}>
                            <Show when={hasText()}>
                                <div style={{ "font-size": '12px', color: 'var(--b3-theme-on-surface)', "margin-bottom": '4px' }}>
                                    {isLast() ? '最终回复' : `中间文本段 #${index()}`}
                                </div>
                                <textarea
                                    value={isLast() ? finalBuffer() : (editBuffer()[index()] ?? text())}
                                    onInput={(e) => {
                                        if (isLast()) setFinalBuffer(e.currentTarget.value);
                                        else setIntermediate(index(), e.currentTarget.value);
                                    }}
                                    style={{
                                        width: '100%',
                                        "min-height": isLast() ? '120px' : '60px',
                                        "font-size": '14px',
                                        padding: '6px',
                                        resize: 'vertical',
                                        "box-sizing": 'border-box'
                                    }}
                                />
                            </Show>
                            <Show when={hasToolCalls()}>
                                <div style={{ "font-size": '12px', color: 'var(--b3-theme-on-surface)', "margin": '8px 0 4px' }}>
                                    工具调用（只读）
                                </div>
                                <div class={styles.timelineList}>
                                    <For each={toolCalls()!}>
                                        {(tc) => {
                                            const entry = createMemo(() => toolResultMap().get(tc.id));
                                            return (
                                                <Show when={entry()}>
                                                    <ToolCallRow entry={entry()} />
                                                </Show>
                                            );
                                        }}
                                    </For>
                                </div>
                            </Show>
                        </div>
                    );
                }}
            </For>

            <div style={{ "text-align": 'right', "margin-top": '12px' }}>
                <button
                    class="b3-button b3-button--text"
                    onclick={() => props.onCancel?.()}
                >
                    取消
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onclick={handleConfirm}
                >
                    保存
                </button>
            </div>
        </div>
    );
};

export default TurnEditPanel;
