// src/func/gpt/components/HistoryList.tsx
import { createMemo } from "solid-js";
import styles from "./HistoryList.module.scss";
import { formatDateTime } from "@frostime/siyuan-plugin-kits";
import { useSignalRef } from "@frostime/solid-signal-ref";

const HistoryList = (props: {
    history: IChatSessionHistory[],
    onclick: (history: IChatSessionHistory) => void,
    onremove: (id: string, callback: () => void) => void
}) => {
    const historyRef = useSignalRef(props.history);
    const sortedHistory = createMemo(() => {
        return historyRef().sort((a, b) => b.timestamp - a.timestamp);
    });

    const removeHistory = (id: string) => {
        props.onremove(id, () => {
            historyRef.update(h => h.filter(h => h.id !== id));
        });
    }

    const contentShotCut = (history: IChatSessionHistory) => {
        let items = history.items.slice(0, 2);
        let content = items.map(item => item.author + ": " + item.message?.content?.replace(/\n/g, " ")).join("\n");
        return content;
    }


    return (
        <div class={styles.historyList}>
            {sortedHistory().map(item => (
                <div class={styles.historyItem} data-key={item.id}
                    onClick={() => props.onclick(item)}
                >
                    <div class={styles.historyTitleLine}>
                        <div class={styles.historyTitle}>{item.title}</div>
                        <div class={styles.historyTime}>{formatDateTime(null, new Date(item.timestamp))}</div>
                        <div class="toolbar__item" onClick={(e: MouseEvent) => {
                            e.stopImmediatePropagation();
                            e.preventDefault();
                            removeHistory(item.id);
                        }}>
                            <svg><use href="#iconClose"></use></svg>
                        </div>
                    </div>
                    <div class={styles.historyContent}>{contentShotCut(item)}</div>
                </div>
            ))}
        </div>
    );
};

export default HistoryList;
