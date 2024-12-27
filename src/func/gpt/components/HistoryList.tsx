// src/func/gpt/components/HistoryList.tsx
import { batch, createMemo, Show } from "solid-js";
import styles from "./HistoryList.module.scss";
import { formatDateTime, openBlock } from "@frostime/siyuan-plugin-kits";
import { useSignalRef } from "@frostime/solid-signal-ref";
import * as persist from '../persistence';

import { useSimpleContext } from "./UseSession";

const HistoryList = (props: {
    history: IChatSessionHistory[],
    onclick: (history: IChatSessionHistory) => void,
    onremove: (id: string, callback: () => void) => void,
    type: 'temporary' | 'permanent'
}) => {

    const context = useSimpleContext();

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
            <div style={{ display: "flex", "justify-content": "space-between" }}>
                <div style="display: flex; align-items: center;">
                    共计
                    <span class="counter" style="margin: 0px;">
                        {sortedHistory().length}
                    </span>
                    条
                </div>
                <Show when={props.type === 'temporary'}>
                    <button class="b3-button b3-button--text"
                        onClick={() => {
                            batch(() => {
                                historyRef().forEach(h => {
                                    removeHistory(h.id);
                                });
                            });
                        }}
                    >
                        全部清空
                    </button>
                </Show>
            </div>
            {sortedHistory().map(item => (
                <div class={styles.historyItem} data-key={item.id}
                    onClick={() => props.onclick(item)}
                    style={{ position: 'relative' }}
                >
                    <div class={styles.historyTitleLine}>
                        <div class={styles.historyTitle}>{item.title}</div>
                        <div class={styles.historyTime}>{formatDateTime(null, new Date(item.timestamp))}</div>
                        <Show when={props.type === 'permanent'}>
                            <div
                                class="toolbar__item"
                                onclick={async (e: MouseEvent) => {
                                    e.stopImmediatePropagation();
                                    e.preventDefault();
                                    let id = item.id;
                                    let docs = await persist.findBindDoc(id);
                                    if (docs && docs?.[0]) {
                                        let doc = docs[0];
                                        openBlock(doc.id);
                                        context?.close?.();
                                    }
                                }}
                            >
                                <svg><use href="#iconFocus"></use></svg>
                            </div>
                        </Show>
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
