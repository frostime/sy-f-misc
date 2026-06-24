/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-24
 * @FilePath     : /src/func/gpt/chat/components/StandardTurnView.tsx
 * @Description  : Standard 模式 turn 视图（CodeX 式交错渲染）。
 *                 遍历 [...toolChainMessages, message] 产出 assistant 文本段 + tool 行交错 DOM。
 *                 中间 assistant 文本段默认折叠摘要可展开；末条 assistant（message）默认展开。
 *                 共享单根 ref 供 runMarkdownPostRender 全 DOM 后处理（hljs/katex/mermaid）。
 */
import { Component, createMemo, For, Show, createSignal, createEffect, on } from 'solid-js';
import { getLute } from '@frostime/siyuan-plugin-kits';

import { extractContentText, getPayload } from '@gpt/chat-utils';
import { convertMathFormulas } from '@gpt/utils';
import { defaultConfig } from '@/func/gpt/model/store';

import { createMarkdownRenderer } from './MessageItem.helper';
import ToolCallRow, { ToolCallEntry } from './ToolCallRow';
import styles from './MessageItem.module.scss';

interface StandardTurnViewProps {
    messageItem: IChatSessionMsgItemV2;
    loading?: boolean;
}

// 折叠摘要长度
const SUMMARY_LEN = 80;

const StandardTurnView: Component<StandardTurnViewProps> = (props) => {
    const markdownRenderer = createMarkdownRenderer();
    const lute = getLute();
    let turnRootRef: HTMLDivElement | undefined;

    const toolChainMessages = createMemo(() => getPayload(props.messageItem, 'toolChainMessages') ?? []);
    const finalMessage = createMemo(() => getPayload(props.messageItem, 'message')!);
    const toolChainResult = createMemo(() => getPayload(props.messageItem, 'toolChainResult'));

    // tool_call_id → toolCallHistory entry 映射（ToolCallRow 结果数据源）
    const toolResultMap = createMemo(() => {
        const map = new Map<string, ToolCallEntry>();
        const history = toolChainResult()?.toolCallHistory;
        if (history) {
            for (const entry of history) {
                map.set(entry.callId, entry as ToolCallEntry);
            }
        }
        return map;
    });

    // 拼接完整序列：[...toolChainMessages, message]
    const sequence = createMemo(() => {
        const tcm = toolChainMessages();
        const msg = finalMessage();
        return [...tcm, msg];
    });

    // 是否最后一条 assistant（message）—— 默认展开；中间段默认折叠
    const isLastSegment = (index: number) => index === sequence().length - 1;

    const renderText = (text: string): string => {
        if (defaultConfig().convertMathSyntax) {
            text = convertMathFormulas(text);
        }
        return markdownRenderer.renderMarkdown(text, props.loading ?? false);
    };

    const makeSummary = (text: string): string => {
        const clean = text.trim();
        if (clean.length <= SUMMARY_LEN) return clean;
        return clean.substring(0, SUMMARY_LEN) + '...';
    };

    // 后处理：完成后统一扫描 turnRootRef 下的代码块/数学/mermaid
    createEffect(on(
        () => [sequence(), props.loading] as const,
        () => {
            if (turnRootRef && !props.loading) {
                markdownRenderer.renderHTMLBlock(turnRootRef);
            }
        }
    ));

    return (
        <div class={styles.messageBody}>
            {/* Reasoning（turn 头部，仅末条 assistant 的 reasoning） */}
            <Show when={finalMessage().reasoning_content}>
                <details class="b3-typography" style={{ "margin-bottom": "8px" }}>
                    <summary style={{ "font-size": "12px", color: 'var(--b3-theme-on-surface)', cursor: 'pointer' }}>
                        推理过程
                    </summary>
                    <div
                        innerHTML={
                            // @ts-ignore
                            lute.Md2HTML(finalMessage().reasoning_content!)
                        }
                    />
                </details>
            </Show>

            <div
                ref={turnRootRef}
                class="b3-typography"
            >
                <For each={sequence()}>
                    {(msg, index) => {
                        const text = createMemo(() => {
                            if (msg.role !== 'assistant') return '';
                            const t = extractContentText(msg.content);
                            return t;
                        });

                        const toolCalls = createMemo(() =>
                            msg.role === 'assistant' ? (msg as any).tool_calls as IToolCallResponse[] | undefined : undefined
                        );

                        const hasText = createMemo(() => text().trim().length > 0);
                        const hasToolCalls = createMemo(() => (toolCalls()?.length ?? 0) > 0);

                        return (
                            <Show when={hasText() || hasToolCalls()}>
                                <Show when={hasText()}>
                                    <AssistantTextBlock
                                        html={createMemo(() => hasText() ? renderText(text()) : '')}
                                        isLast={isLastSegment(index())}
                                        summary={createMemo(() => makeSummary(text()))}
                                    />
                                </Show>
                                <Show when={hasToolCalls()}>
                                    <For each={toolCalls()!}>
                                        {(tc) => {
                                            const entry = createMemo(() => toolResultMap().get(tc.id));
                                            return (
                                                <Show when={entry()}>
                                                    <ToolCallRow entry={entry()!} />
                                                </Show>
                                            );
                                        }}
                                    </For>
                                </Show>
                            </Show>
                        );
                    }}
                </For>
            </div>
        </div>
    );
};

/**
 * assistant 文本段：末条默认展开；中间段默认折叠摘要，点击展开。
 */
const AssistantTextBlock: Component<{
    html: () => string;
    isLast: boolean;
    summary: () => string;
}> = (props) => {
    const [expanded, setExpanded] = createSignal(props.isLast);

    return (
        <Show
            when={props.isLast || expanded()}
            fallback={
                <div
                    class={styles.message}
                    style={{
                        "font-size": "12px",
                        color: 'var(--b3-theme-on-surface)',
                        cursor: 'pointer',
                        "margin-bottom": "6px",
                        "white-space": "pre-wrap"
                    }}
                    onClick={() => setExpanded(true)}
                    title="点击展开"
                >
                    {props.summary()}
                </div>
            }
        >
            <div
                class={styles.message}
                classList={{ 'b3-typography': true }}
                innerHTML={props.html()}
            />
        </Show>
    );
};

export default StandardTurnView;
