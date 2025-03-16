// src/func/gpt/components/HistoryList.tsx
import { batch, createEffect, createMemo, on, onMount, Show } from "solid-js";
import styles from "./HistoryList.module.scss";
import { confirmDialog, formatDateTime, openBlock } from "@frostime/siyuan-plugin-kits";
import { useSignalRef } from "@frostime/solid-signal-ref";
import * as persist from '../persistence';

import { removeDoc } from "@/api";
import { adaptIMessageContent } from "../data-utils";

// Helper function to determine time group
const getTimeGroup = (timestamp: number): 'today' | 'thisWeek' | 'thisMonth' | 'older' => {
    const now = new Date();
    const date = new Date(timestamp);

    // Today: same year, month, and day
    if (date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()) {
        return 'today';
    }

    // This week: within the last 7 days
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    if (date >= oneWeekAgo) {
        return 'thisWeek';
    }

    // This month: same year and month
    if (date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()) {
        return 'thisMonth';
    }

    // Older: anything else
    return 'older';
};

// Helper function to get group label
const getGroupLabel = (group: 'today' | 'thisWeek' | 'thisMonth' | 'older'): string => {
    switch (group) {
        case 'today': return '今天';
        case 'thisWeek': return '七天内';
        case 'thisMonth': return '本月';
        case 'older': return '更早';
    }
};

const HistoryList = (props: {
    onclick?: (history: IChatSessionHistory) => void,
    close: () => void
}) => {

    const sourceTypeCache = localStorage.getItem('gpt-history-list-source-type') || 'temporary';
    let showShortcutsCache = localStorage.getItem('gpt-history-list-show-shortcuts');
    if (!showShortcutsCache) {
        showShortcutsCache = sourceTypeCache === 'temporary' ? 'true' : 'false';
    }

    const sourceType = useSignalRef<'temporary' | 'permanent'>(sourceTypeCache as 'temporary' | 'permanent');
    const showShortcuts = useSignalRef(JSON.parse(showShortcutsCache));

    const onclick = (history: IChatSessionHistory) => {
        props.onclick?.(history);
        props.close?.();
    }

    const onremove = (id: string) => {
        if (sourceType() === 'temporary') {
            persist.removeFromLocalStorage(id);
            historyRef.update(h => h.filter(h => h.id !== id));
        } else {
            persist.removeFromJson(id);
            let history = historyRef().find(history => history.id === id);
            let title = history.title;
            persist.findBindDoc(id).then((docs) => {
                let syDoc = docs?.[0] ?? null;
                confirmDialog({
                    title: `确认删除记录 ${title}@${id}?`,
                    content: `<div class="fn__flex" style="gap: 10px;">
                                    <p style="flex: 1;">同时删除思源文档 ${syDoc?.hpath ?? '未绑定'}?</p>
                                    <input type="checkbox" class="b3-switch" />
                                </div>
                                `,
                    confirm: async (ele: HTMLElement) => {
                        persist.removeFromJson(id);
                        const checkbox = ele.querySelector('input') as HTMLInputElement;
                        if (checkbox.checked) {
                            // showMessage(`正在删除思源文档 ${id}...`);
                            if (syDoc.id) {
                                await removeDoc(syDoc.box, syDoc.path);
                            }
                        }
                        historyRef.update(h => h.filter(h => h.id !== id));
                    }
                });
            })
        }
    }


    const historyRef = useSignalRef<IChatSessionHistory[]>([]);
    const fetchHistory = async (type: 'temporary' | 'permanent' = 'temporary') => {
        if (type === 'temporary') {
            historyRef.value = persist.listFromLocalStorage();
        } else {
            historyRef.value = await persist.listFromJson();
        }
    }

    onMount(() => {
        fetchHistory();
    });

    createEffect(on(sourceType, () => {
        fetchHistory(sourceType());
        localStorage.setItem('gpt-history-list-source-type', sourceType());
    }));
    // 缓存到 localStorage
    createEffect(on(showShortcuts, () => {
        localStorage.setItem('gpt-history-list-show-shortcuts', JSON.stringify(showShortcuts()));
    }));

    const sortedHistory = createMemo(() => {
        return historyRef().sort((a, b) => {
            // First sort by updated field if available
            if (a.updated && b.updated) {
                return b.updated - a.updated;
            }
            // If either doesn't have updated field or they're equal, sort by timestamp
            return b.timestamp - a.timestamp;
        });
    });

    // Group history items by time
    const groupedHistory = createMemo(() => {
        const groups: Record<string, IChatSessionHistory[]> = {
            today: [],
            thisWeek: [],
            thisMonth: [],
            older: []
        };

        sortedHistory().forEach(item => {
            // Use the updated field if available, otherwise use timestamp
            const timeToUse = item.updated || item.timestamp;
            const group = getTimeGroup(timeToUse);
            groups[group].push(item);
        });

        return groups;
    });


    const contentShotCut = (history: IChatSessionHistory) => {
        let items = history.items.slice(0, 2);
        let content = items.map(item => {
            let { text } = adaptIMessageContent(item.message.content)
            return item.author + ": " + text.replace(/\n/g, " ");
        }).join("\n");
        return content;
    }


    return (
        <div class={styles.historyList}>
            <div class={styles.historyToolbar}>
                <div style={{ display: "flex", 'align-items': 'center', 'gap': '10px' }}>
                    <div style="display: flex; align-items: center;">
                        共
                        <span class="counter" style="margin: 0px;">
                            {sortedHistory().length}
                        </span>
                        条
                    </div>
                    <input type="checkbox" class="b3-switch" checked={showShortcuts()} onChange={(e) => {
                        showShortcuts.value = e.currentTarget.checked;
                    }} />
                    <Show when={sourceType() === 'temporary'}>
                        <button class="b3-button b3-button--text"
                            onClick={() => {
                                batch(() => {
                                    historyRef().forEach(h => {
                                        onremove(h.id);
                                    });
                                });
                            }}
                        >
                            全部清空
                        </button>
                    </Show>
                    <div class="fn__flex-1" />
                    {/* options */}
                    <select class="b3-select" value={sourceType()} onChange={(e) => {
                        //@ts-ignore
                        sourceType.value = e.currentTarget.value;
                    }}>
                        <option value="temporary">缓存记录</option>
                        <option value="permanent">归档记录</option>
                    </select>
                </div>
            </div>
            <div class={styles.historyItemsContainer}>
                {Object.entries(groupedHistory()).map(([group, items]) => (
                    items.length > 0 && (
                        <>
                            <div class={styles.historyGroupHeader}>
                                {getGroupLabel(group as any)}
                            </div>
                            {items.map(item => (
                                <div class={styles.historyItem} data-key={item.id}
                                    onClick={() => onclick(item)}
                                    style={{ position: 'relative' }}
                                >
                                    <div class={styles.historyTitleLine}>
                                        <div class={styles.historyTitle}>{item.title}</div>
                                        <div class={styles.historyTimeContainer}>
                                            {item.updated && item.updated !== item.timestamp ? (
                                                <>
                                                    <div class={styles.historyTimeLabel}>创建:</div>
                                                    <div class={styles.historyTime}>{formatDateTime(null, new Date(item.timestamp))}</div>
                                                    <div class={styles.historyTimeLabel}>更新:</div>
                                                    <div class={styles.historyTime}>{formatDateTime(null, new Date(item.updated))}</div>
                                                </>
                                            ) : (
                                                <>
                                                    <div class={styles.historyTimeLabel}>创建:</div>
                                                    <div class={styles.historyTime}>{formatDateTime(null, new Date(item.timestamp))}</div>
                                                </>
                                            )}
                                        </div>
                                        <Show when={sourceType() === 'permanent'}>
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
                                                        props.close?.();
                                                    }
                                                }}
                                            >
                                                <svg><use href="#iconFocus"></use></svg>
                                            </div>
                                        </Show>
                                        <div class="toolbar__item" onClick={(e: MouseEvent) => {
                                            e.stopImmediatePropagation();
                                            e.preventDefault();
                                            onremove(item.id);
                                        }}>
                                            <svg><use href="#iconClose"></use></svg>
                                        </div>
                                    </div>
                                    <div class={styles.historyContent} classList={{
                                        'fn__none': !showShortcuts()
                                    }}>{contentShotCut(item)}</div>
                                </div>
                            ))}
                        </>
                    )
                ))}
            </div>
        </div>
    );
};

export default HistoryList;
