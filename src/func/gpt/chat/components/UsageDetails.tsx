import { createMemo, For, Show, type Component } from 'solid-js';
import { describeUsage } from './usage-display';
import styles from './MessageItem.module.scss';

/** Takes only the displayed version's usage, never a session or agent accumulator. */
const UsageDetails: Component<{ usage?: ICompletionUsage }> = (props) => {
    const display = createMemo(() => describeUsage(props.usage));
    return (
        <Show when={display().rows.length > 0}>
            <details class={styles.usageDetails} data-label="token">
                <summary title="当前消息版本的用量；点击查看明细">{display().summary}</summary>
                <div class={styles.usageBreakdown}>
                    <div class={styles.usageHeading}>当前版本用量（token）</div>
                    <For each={display().rows}>{row => (
                        <div class={styles.usageRow}>
                            <label>{row.label}</label><b>{row.value}</b>
                        </div>
                    )}</For>
                    <p>缓存计数包含在输入中，推理计数包含在输出中，不再重复相加。未报告的数据不显示；— 表示未知。</p>
                </div>
            </details>
        </Show>
    );
};

export default UsageDetails;
