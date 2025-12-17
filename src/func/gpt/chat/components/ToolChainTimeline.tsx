/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-10-31 00:00:00
 * @FilePath     : /src/func/gpt/chat/ToolChainTimeline.tsx
 * @Description  : 工具调用时间线组件
 */
import { Component, For, Show } from 'solid-js';
import { inputDialog } from '@frostime/siyuan-plugin-kits';
import { ToolExecuteStatus } from '@gpt/tools/types';
import styles from './ToolChainTimeline.module.scss';

interface ToolChainTimelineProps {
    toolCallHistory: {
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
    }[];
    stats: {
        totalRounds: number;
        totalCalls: number;
        totalTime: number;
        startTime: number;
        endTime: number;
    };
}

const ToolChainTimeline: Component<ToolChainTimelineProps> = (props) => {

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
            // 如果字符串太长，截断显示
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

    const viewFullData = () => {
        const fullData = {
            stats: props.stats,
            toolCallHistory: props.toolCallHistory.map(call => ({
                callId: call.callId,
                toolName: call.toolName,
                roundIndex: call.roundIndex,
                executionTime: call.endTime - call.startTime,
                args: call.args,
                result: call.result,
                llmUsage: call.llmUsage,
                resultRejected: call.resultRejected,
                resultRejectReason: call.resultRejectReason
            }))
        };

        const fullDataStr = JSON.stringify(fullData, null, 2);

        inputDialog({
            title: '工具调用完整数据',
            defaultText: fullDataStr,
            type: 'textarea',
            width: '1200px',
            height: '700px'
        });
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

    return (
        <div class={styles.timeline}>
            {/* 统计信息 */}
            <div class={styles.stats}>
                <div class={styles.statsInfo}>
                    <span>总轮次: {props.stats.totalRounds}</span>
                    <span>总调用: {props.stats.totalCalls}</span>
                    <span>总耗时: {formatTime(props.stats.totalTime)}</span>
                </div>
                <button
                    class={`${styles.viewFullButton} b3-button b3-button--text`}
                    onclick={viewFullData}
                    title="查看完整数据"
                >
                    <svg><use href="#iconPreview" /></svg>
                </button>
            </div>

            {/* 时间线 */}
            <div class={styles.timelineList}>
                <For each={props.toolCallHistory}>
                    {(call) => (
                        <div class={styles.timelineItem}>
                            <div class={styles.timelineMarker}>
                                <svg class={getStatusClass(call.result.status)}>
                                    <use href={getStatusIcon(call.result.status)} />
                                </svg>
                            </div>

                            <div class={styles.timelineContent}>
                                <div class={styles.header}>
                                    <span class={styles.toolName}>
                                        {call.toolName}
                                    </span>
                                    <span class={styles.time}>
                                        {formatTime(call.endTime - call.startTime)}
                                    </span>
                                </div>

                                {/* Token 使用情况 */}
                                <Show when={call.llmUsage}>
                                    <div class={styles.tokenInfo}>
                                        <span class={styles.tokenLabel}>Token:</span>
                                        <span class={styles.tokenValue}>
                                            总计 {call.llmUsage.total_tokens} =
                                            输入 {call.llmUsage.prompt_tokens} +
                                            输出 {call.llmUsage.completion_tokens}
                                        </span>
                                    </div>
                                </Show>

                                <div class={styles.details}>
                                    <div class={styles.section}>
                                        <div class={styles.sectionHeader}>
                                            <span class={styles.label}>参数:</span>
                                            <button
                                                class={`${styles.viewDetailButton} b3-button b3-button--text`}
                                                onclick={() => viewDetailData(`${call.toolName} - 参数`, call.args)}
                                                title="查看完整参数"
                                            >
                                                <svg><use href="#iconEye" /></svg>
                                            </button>
                                        </div>
                                        <pre class={styles.code}>
                                            {formatData(call.args)}
                                        </pre>
                                    </div>

                                    <div class={styles.section}>
                                        <div class={styles.sectionHeader}>
                                            <span class={styles.label}>结果:</span>
                                            <button
                                                class={`${styles.viewDetailButton} b3-button b3-button--text`}
                                                onclick={() => viewDetailData(
                                                    `${call.toolName} - 结果`,
                                                    call.result.status === ToolExecuteStatus.SUCCESS
                                                        ? call.result.data
                                                        : (call.result.error || call.result.rejectReason || '未知错误')
                                                )}
                                                title="查看完整结果"
                                            >
                                                <svg><use href="#iconEye" /></svg>
                                            </button>
                                        </div>
                                        <Show
                                            when={call.result.status === ToolExecuteStatus.SUCCESS}
                                            fallback={
                                                <div class={styles.errorText}>
                                                    {call.result.error || call.result.rejectReason || '未知错误'}
                                                </div>
                                            }
                                        >
                                            <pre class={styles.code}>
                                                {formatData(call.result.data)}
                                            </pre>
                                        </Show>
                                    </div>

                                    <Show when={call.resultRejected}>
                                        <div class={styles.rejection}>
                                            <svg><use href="#iconInfo" /></svg>
                                            结果被用户拒绝: {call.resultRejectReason}
                                        </div>
                                    </Show>
                                </div>
                            </div>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
};

export default ToolChainTimeline;
