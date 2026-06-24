/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-24
 * @FilePath     : /src/func/gpt/chat/components/ToolCallRow.tsx
 * @Description  : 单个工具调用行（CodeX 式单行可展开），从 ToolChainTimeline 渲染单元抽取。
 *                 用于 StandardTurnView 内联交错渲染；ToolChainTimeline（legacy 折叠区）仍独立保留。
 */
import { Component, createSignal, Show } from 'solid-js';
import { inputDialog } from '@frostime/siyuan-plugin-kits';
import { ToolExecuteStatus } from '@gpt/tools/types';
import styles from './ToolChainTimeline.module.scss';

export interface ToolCallEntry {
    callId: string;
    toolName: string;
    args: any;
    result: {
        status: any;
        data?: any;
        error?: string;
        rejectReason?: string;
    };
    startTime: number;
    endTime: number;
    roundIndex: number;
    resultRejected?: boolean;
    resultRejectReason?: string;
    llmUsage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface ToolCallRowProps {
    entry: ToolCallEntry;
}

const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
};

const getStatusIcon = (status: any) => {
    switch (status) {
        case ToolExecuteStatus.SUCCESS:
            return '#iconCheck';
        case ToolExecuteStatus.ERROR:
            return '#iconClose';
        case ToolExecuteStatus.EXECUTION_REJECTED:
        case ToolExecuteStatus.RESULT_REJECTED:
            return '#iconInfo';
        default:
            return '#iconHelp';
    }
};

const getStatusClass = (status: any) => {
    switch (status) {
        case ToolExecuteStatus.SUCCESS:
            return styles.success;
        case ToolExecuteStatus.ERROR:
            return styles.error;
        default:
            return styles.rejected;
    }
};

const formatData = (data: any): string => {
    if (data === null || data === undefined) return 'null';
    if (typeof data === 'string') {
        if (data.length > 500) {
            return data.substring(0, 500) + '\n... (truncated)';
        }
        return data;
    }
    try {
        const str = JSON.stringify(data, null, 2);
        if (str.length > 1000) {
            return str.substring(0, 1000) + '\n... (truncated)';
        }
        return str;
    } catch (e) {
        return String(data);
    }
};

const viewDetailData = (title: string, data: any) => {
    let dataStr: string;
    if (data === null || data === undefined) {
        dataStr = 'null';
    } else if (typeof data === 'string') {
        dataStr = data;
    } else {
        try {
            dataStr = JSON.stringify(data, null, 2);
        } catch (e) {
            dataStr = String(data);
        }
    }
    inputDialog({
        title: title,
        defaultText: dataStr,
        type: 'textarea',
        width: '900px',
        height: '600px'
    });
};

/**
 * 单行可展开 tool 调用行。
 * 折叠态：状态图标 + toolName + 耗时（单行）。
 * 展开态：参数 + 结果 + 拒绝原因（复用 ToolChainTimeline 样式）。
 */
const ToolCallRow: Component<ToolCallRowProps> = (props) => {
    const [expanded, setExpanded] = createSignal(false);
    const entry = () => props.entry;

    return (
        <div class={styles.timelineItem}>
            <div
                class={styles.timelineMarker}
                onClick={() => setExpanded(!expanded())}
                style={{ cursor: 'pointer' }}
                title={expanded() ? '点击折叠' : '点击展开'}
            >
                <svg class={getStatusClass(entry().result.status)}>
                    <use href={getStatusIcon(entry().result.status)} />
                </svg>
            </div>

            <div class={styles.timelineContent}>
                <div
                    class={styles.header}
                    onClick={() => setExpanded(!expanded())}
                    style={{ cursor: 'pointer' }}
                >
                    <span class={styles.toolName}>
                        {entry().toolName}
                    </span>
                    <span class={styles.time}>
                        {formatTime(entry().endTime - entry().startTime)}
                    </span>
                </div>

                <Show when={expanded()}>
                    {/* Token 使用情况 */}
                    <Show when={entry().llmUsage}>
                        <div class={styles.tokenInfo}>
                            <span class={styles.tokenLabel}>Token:</span>
                            <span class={styles.tokenValue}>
                                总计 {entry().llmUsage.total_tokens} =
                                输入 {entry().llmUsage.prompt_tokens} +
                                输出 {entry().llmUsage.completion_tokens}
                            </span>
                        </div>
                    </Show>

                    <div class={styles.details}>
                        <div class={styles.section}>
                            <div class={styles.sectionHeader}>
                                <span class={styles.label}>参数:</span>
                                <button
                                    class={`${styles.viewDetailButton} b3-button b3-button--text`}
                                    onclick={() => viewDetailData(`${entry().toolName} - 参数`, entry().args)}
                                    title="查看完整参数"
                                >
                                    <svg><use href="#iconEye" /></svg>
                                </button>
                            </div>
                            <pre class={styles.code}>
                                {formatData(entry().args)}
                            </pre>
                        </div>

                        <div class={styles.section}>
                            <div class={styles.sectionHeader}>
                                <span class={styles.label}>结果:</span>
                                <button
                                    class={`${styles.viewDetailButton} b3-button b3-button--text`}
                                    onclick={() => viewDetailData(
                                        `${entry().toolName} - 结果`,
                                        entry().result.status === ToolExecuteStatus.SUCCESS
                                            ? entry().result.data
                                            : (entry().result.error || entry().result.rejectReason || '未知错误')
                                    )}
                                    title="查看完整结果"
                                >
                                    <svg><use href="#iconEye" /></svg>
                                </button>
                            </div>
                            <Show
                                when={entry().result.status === ToolExecuteStatus.SUCCESS}
                                fallback={
                                    <div class={styles.errorText}>
                                        {entry().result.error || entry().result.rejectReason || '未知错误'}
                                    </div>
                                }
                            >
                                <pre class={styles.code}>
                                    {formatData(entry().result.data)}
                                </pre>
                            </Show>
                        </div>

                        <Show when={entry().resultRejected}>
                            <div class={styles.rejection}>
                                <svg><use href="#iconInfo" /></svg>
                                结果被用户拒绝: {entry().resultRejectReason}
                            </div>
                        </Show>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default ToolCallRow;
