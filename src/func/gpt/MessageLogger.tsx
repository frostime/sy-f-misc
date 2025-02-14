import { openCustomTab } from "@frostime/siyuan-plugin-kits";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { Component, createMemo, For } from "solid-js";
import { render } from "solid-js/web";

import { ButtonInput, NumberInput } from "@/libs/components/Elements";

const max_log_items = createSignalRef(500);
export const messageLog = createSignalRef<{ time: string, data: any, type: string }[]>([]);

export const appendLog = (options: {
    type: string,
    data: any
}) => {
    const { type, data } = options;
    messageLog.update(log => {
        if (log.length >= max_log_items()) {
            log.shift();
        }
        return [...log, { time: formatTime(Date.now()), data, type }];
    });
}

export const purgeLog = (options: {
    all?: boolean;
    earliest?: number;
    latest?: number;
}) => {
    messageLog.update(log => {
        if (options.all) {
            return [];
        }
        let beg = 0;
        let end = log.length;
        if (options.earliest !== undefined) {
            beg = options.earliest;
        }
        if (options.latest !== undefined) {
            end = options.latest;
        }
        return log.slice(beg, end);
    })
}

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

const formatMessage = (message: any): string => {
    if (typeof message === 'string') return message;
    return JSON.stringify(message);
}

export const MessageLog: Component = () => {
    const clearLogs = () => purgeLog({ all: true });

    const logItems = createMemo(() => {
        return messageLog.value.map(item => ({
            type: item.type,
            data: formatMessage(item.data),
            time: item.time
        }));
    });

    const saveAsFiles = () => {
        const log = logItems();
        const blob = new Blob([JSON.stringify(log)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chat-message-log.json';
        a.click();
    }

    let typoRef: HTMLDivElement | null;

    return (
        <div style="height: 100%; display: flex; flex-direction: column;">
            <div style="flex-shrink: 0; padding: 8px; display: flex; justify-content: flex-start; gap: 5px; align-items: center;">
                <span>消息日志: {logItems().length}/{max_log_items()} 条</span>
                <ButtonInput onClick={clearLogs} label="清空日志" />

                <ButtonInput onClick={saveAsFiles} label="保存为文件" />

                <ButtonInput
                    onClick={() => {
                        if (!typoRef) return;
                        typoRef.scrollTop = typoRef.scrollHeight;
                    }}
                    label="底部"
                />

                <ButtonInput
                    onClick={() => {
                        if (!typoRef) return;
                        typoRef.scrollTop = 0;
                    }}
                    label="顶部"
                />

                <div class="fn__flex-1" />

                <NumberInput
                    value={max_log_items()}
                    changed={(v) => { max_log_items(v) }}
                    min={1}
                />

            </div>
            <div class="b3-typography" style="flex: 1; overflow-y: auto; padding: 8px;" ref={typoRef}>
                <For each={logItems()}>
                    {(item) => (
                        <div style="margin-bottom: 8px; user-select: text;">
                            <div
                                style={{
                                    'color': item.type == 'chunk' ? 'var(--b3-theme-on-surface)' : 'var(--b3-theme-primary)',
                                    'opacity': '0.8',
                                    'font-size': '14px',
                                }}
                            >
                                [{item.time}] {item.type}
                            </div>
                            <div style="white-space: pre-wrap; font-size: 16px; user-select: text;">
                                {item.data}
                            </div>
                        </div>
                    )}
                </For>
            </div>
        </div >
    );
}


export const showMessageLog = () => {
    openCustomTab({
        tabId: 'gpt-message-log',
        render: (container: HTMLElement) => {
            render(() => MessageLog({}), container);
        },
        title: 'GPT 对话消息日志'
    })
}
