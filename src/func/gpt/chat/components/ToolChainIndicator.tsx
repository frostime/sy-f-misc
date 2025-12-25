/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-10-31 00:00:00
 * @FilePath     : /src/func/gpt/chat/components/ToolChainIndicator.tsx
 * @Description  : 工具调用指示器组件
 */
import { Component, Show, createSignal } from 'solid-js';
import ToolChainTimeline from './ToolChainTimeline';
import styles from './ToolChainIndicator.module.scss';
import { checkHasToolChain } from '../../chat-utils';

interface ToolChainIndicatorProps {
    messageItem: IChatSessionMsgItem;
}

const ToolChainIndicator: Component<ToolChainIndicatorProps> = (props) => {
    const [expanded, setExpanded] = createSignal(false);

    const hasToolChain = () => {
        checkHasToolChain(props.messageItem);
    };

    const toolChainData = () => props.messageItem.toolChainResult;

    return (
        <Show when={hasToolChain()}>
            <div class={styles.toolChainIndicator}>
                <button
                    class={styles.toggleButton}
                    onClick={() => setExpanded(!expanded())}
                >
                    <svg class={styles.icon}>
                        <use href="#iconSparkles" />
                    </svg>
                    <span>
                        工具调用 ({toolChainData().toolCallHistory.length} 次)
                    </span>
                    <svg
                        class={styles.arrow}
                        classList={{ [styles.expanded]: expanded() }}
                    >
                        <use href="#iconDown" />
                    </svg>
                </button>

                <Show when={expanded()}>
                    <div class={styles.toolChainDetails}>
                        <ToolChainTimeline
                            toolCallHistory={toolChainData().toolCallHistory}
                            stats={toolChainData().stats}
                        />
                    </div>
                </Show>
            </div>
        </Show>
    );
};

export default ToolChainIndicator;
