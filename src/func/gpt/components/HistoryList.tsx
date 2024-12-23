// src/func/gpt/components/HistoryList.tsx
import { createMemo } from "solid-js";
import styles from "./HistoryList.module.scss";
import { formatDateTime } from "@frostime/siyuan-plugin-kits";

const HistoryList = (props: {
    history: IChatSessionHistory[],
    onclick: (history: IChatSessionHistory) => void
}) => {
    const sortedHistory = createMemo(() => {
        return [...props.history].sort((a, b) => b.timestamp - a.timestamp);
    });

    const contentShotCut = (history: IChatSessionHistory) => {
        let items = history.items.slice(0, 2);
        let content = items.map(item => item.message?.content || "").join("");
        return content;
    }

    return (
        <div class={styles.historyList}>
            {sortedHistory().map(item => (
                <div class={styles.historyItem} data-key={item.id}
                    onClick={() => props.onclick(item)}
                >
                    <div class={styles.historyTitle}>{item.title}</div>
                    <div class={styles.historyContent}>{contentShotCut(item)}</div>
                    <div class={styles.historyTime}>{formatDateTime(null, new Date(item.timestamp))}</div>
                </div>
            ))}
        </div>
    );
};

export default HistoryList;
