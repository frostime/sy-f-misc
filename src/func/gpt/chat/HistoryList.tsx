// src/func/gpt/components/HistoryList.tsx
import { confirm, Menu, showMessage } from "siyuan";
import { batch, createEffect, createMemo, on, onMount, Show } from "solid-js";
import { confirmDialog, formatDateTime, openBlock } from "@frostime/siyuan-plugin-kits";
import { useSignalRef } from "@frostime/solid-signal-ref";

import { removeDoc } from "@/api";
import { solidDialog } from "@/libs/dialog";

import { adaptIMessageContent } from "@gpt/data-utils";
import * as persist from '@gpt/persistence';
import TitleTagEditor from "./TitleTagEditor";
import styles from "./HistoryList.module.scss";

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
    const searchQuery = useSignalRef<string>('');
    const selectedTag = useSignalRef<string>('');

    // 批量操作相关状态
    const batchMode = useSignalRef<boolean>(false);
    const selectedItems = useSignalRef<Set<string>>(new Set());

    // 切换批量模式
    const toggleBatchMode = () => {
        batchMode.value = !batchMode();
        // 清空选中项
        if (!batchMode()) {
            selectedItems.value = new Set();
        }
    };

    // 选择/取消选择项目
    const toggleSelectItem = (id: string, e: MouseEvent) => {
        e.stopPropagation();

        const newSelectedItems = new Set(selectedItems());
        if (newSelectedItems.has(id)) {
            newSelectedItems.delete(id);
        } else {
            newSelectedItems.add(id);
        }
        selectedItems.value = newSelectedItems;
    };

    // 全选/取消全选
    const toggleSelectAll = () => {
        if (selectedItems().size === filteredHistory().length) {
            // 如果已全选，则取消全选
            selectedItems.value = new Set();
        } else {
            // 否则全选
            const newSelectedItems = new Set<string>();
            filteredHistory().forEach(item => newSelectedItems.add(item.id));
            selectedItems.value = newSelectedItems;
        }
    };

    // 批量删除选中项
    const batchDelete = async () => {
        if (selectedItems().size === 0) return;

        const itemCount = selectedItems().size;
        confirmDialog({
            title: `确认删除 ${itemCount} 个项目?`,
            content: `此操作无法撤销，确定要继续吗？`,
            confirm: () => {
                // 批量删除
                batch(() => {
                    Array.from(selectedItems()).forEach(id => {
                        onremove(id, false);
                    });
                });

                // 清空选中项
                selectedItems.value = new Set();
                showMessage(`已删除 ${itemCount} 个项目`);
            }
        });
    };

    // 批量设置标签
    const batchSetTags = () => {
        if (selectedItems().size === 0) return;

        // 获取选中项的历史记录
        const selectedHistories = historyRef().filter(h => selectedItems().has(h.id));

        // 获取所有选中项的标签集合
        const commonTags = new Set<string>();
        let isFirst = true;

        selectedHistories.forEach(history => {
            if (history.tags && history.tags.length > 0) {
                if (isFirst) {
                    // 对于第一个项目，直接添加所有标签
                    history.tags.forEach(tag => commonTags.add(tag));
                    isFirst = false;
                } else {
                    // 对于后续项目，只保留交集
                    const currentTags = new Set(history.tags);
                    Array.from(commonTags).forEach(tag => {
                        if (!currentTags.has(tag)) {
                            commonTags.delete(tag);
                        }
                    });
                }
            } else if (isFirst) {
                // 如果第一个项目没有标签，则共同标签为空
                isFirst = false;
            } else {
                // 如果任何项目没有标签，则共同标签为空
                commonTags.clear();
            }
        });

        // 打开标签编辑对话框
        const { close } = solidDialog({
            title: `编辑标签 (共 ${selectedItems().size} 个项目)`,
            width: '750px',
            loader: () => (
                <TitleTagEditor
                    title="" // 批量编辑不修改标题
                    tags={Array.from(commonTags)}
                    onSave={(_, tags) => {
                        // 更新所有选中项的标签
                        batch(() => {
                            selectedHistories.forEach(history => {
                                const updatedItem = {
                                    ...history,
                                    tags
                                };

                                // 保存更新
                                if (sourceType() === 'temporary') {
                                    persist.saveToLocalStorage(updatedItem);
                                } else {
                                    persist.saveToJson(updatedItem);
                                }
                            });

                            // 更新列表中的项
                            historyRef.update(histories => {
                                return histories.map(h => {
                                    if (selectedItems().has(h.id)) {
                                        return {
                                            ...h,
                                            tags
                                        };
                                    }
                                    return h;
                                });
                            });
                        });

                        showMessage(`已更新 ${selectedItems().size} 个项目的标签`);
                        close();
                    }}
                    onClose={() => close()}
                />
            )
        });
    };

    // 批量持久化存储
    const batchPersist = async () => {
        if (selectedItems().size === 0 || sourceType() !== 'temporary') return;

        const itemCount = selectedItems().size;
        confirmDialog({
            title: `确认持久化 ${itemCount} 个项目?`,
            content: `选中的项目将从临时存储移动到持久化存储。`,
            confirm: () => {
                // 获取选中项的历史记录
                const selectedHistories = historyRef().filter(h => selectedItems().has(h.id));

                // 批量持久化
                batch(async () => {
                    for (const history of selectedHistories) {
                        // 保存到 JSON 文件
                        await persist.saveToJson(history);
                        // // 从本地存储中删除
                        // persist.removeFromLocalStorage(history.id);
                    }

                    // 重新加载历史记录
                    // await fetchHistory('temporary');
                });

                // 清空选中项
                selectedItems.value = new Set();
                showMessage(`已持久化 ${itemCount} 个项目`);
            }
        });
    };

    const onclick = (history: IChatSessionHistory) => {
        props.onclick?.(history);
        props.close?.();
    }

    // 显示历史记录项的右键菜单
    const showHistoryItemMenu = (e: MouseEvent, item: IChatSessionHistory) => {
        e.preventDefault();
        e.stopPropagation();

        const menu = new Menu('history-item-menu');

        // 添加编辑选项
        menu.addItem({
            icon: 'iconEdit',
            label: '编辑标题和标签',
            click: () => {
                // 打开编辑对话框
                openEditDialog(item);
            }
        });

        // 显示菜单
        menu.open({
            x: e.clientX,
            y: e.clientY
        });
    };

    // 打开编辑对话框
    const openEditDialog = (item: IChatSessionHistory) => {
        const { close } = solidDialog({
            title: '编辑会话信息',
            width: '750px',
            loader: () => (
                <TitleTagEditor
                    title={item.title || ''}
                    tags={item.tags || []}
                    onSave={(title, tags) => {
                        // 更新标题和标签
                        const updatedItem = {
                            ...item,
                            title,
                            tags,
                            updated: Date.now()
                        };

                        // 保存更新
                        if (sourceType() === 'temporary') {
                            persist.saveToLocalStorage(updatedItem);
                        } else {
                            persist.saveToJson(updatedItem);
                        }

                        // 更新列表中的项
                        historyRef.update(histories => {
                            return histories.map(h => h.id === item.id ? updatedItem : h);
                        });

                        showMessage(`已更新会话 "${title}"`);
                        close();
                    }}
                    onClose={() => close()}
                />
            )
        });
    };

    const requestDeleteBindDoc = async (id: BlockId) => {
        let docs = await persist.findBindDoc(id);
        if (!docs || docs.length === 0) return;
        let syDoc = docs?.[0] ?? null;
        if (!syDoc?.id) {
            return;
        }
        confirmDialog({
            title: `是否删除文档?`,
            content: `当前对话记录绑定了思源文档 ${syDoc?.hpath}，是否删除该文档?`,
            confirm: async () => {
                await removeDoc(syDoc.box, syDoc.path);
            }
        });
    }

    const onremove = (id: string, doConfirm = true) => {
        let history = historyRef().find(history => history.id === id);
        let title = history.title;

        if (sourceType() === 'temporary') {
            persist.removeFromLocalStorage(id);
            // historyRef.update(h => h.filter(h => h.id !== id));
            if (doConfirm) {
                confirm('删除', `是否删除临时对话记录 ${title}@${id}?`, () => {
                    historyRef.update(h => h.filter(h => h.id !== id));
                });
            } else {
                historyRef.update(h => h.filter(h => h.id !== id));
            }
        } else {
            if (!doConfirm) {
                persist.removeFromJson(id);
                requestDeleteBindDoc(id);
                historyRef.update(h => h.filter(h => h.id !== id));
            } else {
                confirm('删除', `是否删除归档对话记录 ${title}@${id}?`, () => {
                    persist.removeFromJson(id);
                    requestDeleteBindDoc(id);
                    historyRef.update(h => h.filter(h => h.id !== id));
                });
            }
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

    // 获取所有唯一标签
    const allTags = createMemo(() => {
        const tagSet = new Set<string>();
        sortedHistory().forEach(item => {
            if (item.tags && item.tags.length > 0) {
                item.tags.forEach(tag => tagSet.add(tag));
            }
        });
        return Array.from(tagSet).sort();
    });

    // Filter history items based on search query and selected tag
    const filteredHistory = createMemo(() => {
        const query = searchQuery().toLowerCase().trim();
        const tag = selectedTag().trim();

        return sortedHistory().filter(item => {
            // 先按标签过滤
            if (tag) {
                // 特殊标签: 所有标签 (::ALL::)
                if (tag === '::ALL::') {
                    // 继续处理，不过滤
                }
                // 特殊标签: 无标签 (::BLANK::)
                else if (tag === '::BLANK::') {
                    if (item.tags && item.tags.length > 0) return false;
                }
                // 普通标签: 必须包含指定标签
                else if (!item.tags || !item.tags.includes(tag)) {
                    return false;
                }
            }

            // 如果没有搜索查询，只按标签过滤
            if (!query) return true;

            // 搜索标题
            if (item.title.toLowerCase().includes(query)) return true;

            // 搜索标签
            if (item.tags && item.tags.some(t => t.toLowerCase().includes(query))) return true;

            // 搜索内容
            for (const messageItem of item.items) {
                if (messageItem.type !== 'message' || !messageItem.message?.content) continue;
                const { text } = adaptIMessageContent(messageItem.message.content);
                if (text.toLowerCase().includes(query)) return true;
                if (messageItem.author.toLowerCase().includes(query)) return true;
            }

            return false;
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

        filteredHistory().forEach(item => {
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

    const Toolbar = () => (
        <div class={styles.historyToolbar}>
            <div style={{ display: "flex", 'align-items': 'center', 'gap': '10px', 'flex-wrap': 'wrap' }}>
                {/* 全选按钮 */}
                <Show when={batchMode()}>
                    <div class="fn__flex fn__flex-center" style="margin-right: 8px;">
                        <input
                            type="checkbox"
                            class="b3-checkbox"
                            checked={selectedItems().size === filteredHistory().length && filteredHistory().length > 0}
                            onChange={toggleSelectAll}
                            title="全选/取消全选"
                        />
                    </div>
                </Show>
                <div style="display: flex; align-items: center;">
                    共
                    <span class="counter" style="margin: 0px;">
                        {filteredHistory().length}
                    </span>
                    条
                </div>

                {/* 批量模式开关 */}
                <button
                    class={`b3-button ${batchMode() ? 'b3-button--text' : 'b3-button--outline'}`}
                    onClick={toggleBatchMode}
                    title="切换批量操作模式"
                >
                    {batchMode() ? '退出批量模式' : '批量操作'}
                </button>

                {/* 批量操作按钮组 */}
                <Show when={batchMode() && selectedItems().size > 0}>
                    <div class="fn__flex" style="gap: 8px;">
                        {/* 批量删除按钮 */}
                        <button
                            class="b3-button b3-button--outline b3-button--error"
                            onClick={batchDelete}
                            title="删除选中的所有项目"
                        >
                            删除 ({selectedItems().size})
                        </button>

                        {/* 批量设置标签按钮 */}
                        <button
                            class="b3-button b3-button--outline"
                            onClick={batchSetTags}
                            title="为选中项目设置标签"
                        >
                            设置标签
                        </button>

                        {/* 仅在 Temporary 模式下显示持久化按钮 */}
                        <Show when={sourceType() === 'temporary'}>
                            <button
                                class="b3-button b3-button--outline"
                                onClick={batchPersist}
                                title="将选中项目持久化存储"
                            >
                                持久化
                            </button>
                        </Show>
                    </div>
                </Show>

                <input type="checkbox" class="b3-switch" checked={showShortcuts()} onChange={(e) => {
                    showShortcuts.value = e.currentTarget.checked;
                }} />
                <Show when={sourceType() === 'temporary' && !batchMode()}>
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
                {/* Search box */}
                {/* 标签过滤器 */}
                <Show when={allTags().length > 0}>
                    <select
                        class="b3-select"
                        value={selectedTag()}
                        onChange={(e) => selectedTag.value = e.currentTarget.value}
                        style="margin-right: 8px; min-width: 120px;"
                        title="按标签筛选会话历史"
                    >
                        <option value="::ALL::">所有标签</option>
                        <option value="::BLANK::">无标签</option>
                        {allTags().map(tag => (
                            <option value={tag}>{tag}</option>
                        ))}
                    </select>
                </Show>

                {/* 搜索框 */}
                <div style="display: flex; align-items: center; position: relative; margin-right: 8px;">
                    <input
                        type="text"
                        class="b3-text-field"
                        placeholder="搜索历史记录..."
                        value={searchQuery()}
                        onChange={(e) => searchQuery.value = e.currentTarget.value}
                        style="padding-right: 24px; width: 180px;"
                    />
                    <Show when={searchQuery().length > 0}>
                        <div
                            style="position: absolute; right: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;"
                            onClick={() => searchQuery.value = ''}
                        >
                            <svg style="width: 14px; height: 14px;"><use href="#iconClose"></use></svg>
                        </div>
                    </Show>
                </div>
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
    );

    const HistoryItem = (item: IChatSessionHistory) => (
        <div class={styles.historyItem} data-key={item.id}
            onClick={() => batchMode() ? null : onclick(item)}
            onContextMenu={(e) => showHistoryItemMenu(e, item)}
            style={{ position: 'relative' }}
        >
            <div class={styles.historyTitleLine} style={batchMode() ? {
                '--shift': '32px',
                'padding-left': 'var(--shift)',
                position: 'relative',
                width: 'calc(100% - var(--shift))'
            } : {}}>
                {/* 批量模式下显示复选框 */}
                <Show when={batchMode()}>
                    <div
                        class="fn__flex fn__flex-center"
                        style="position: absolute; left: 0px; top: 50%; transform: translateY(-50%); z-index: 1;"
                        onClick={(e) => toggleSelectItem(item.id, e)}
                    >
                        <input
                            type="checkbox"
                            class="b3-switch"
                            checked={selectedItems().has(item.id)}
                            onChange={(e) => e.stopPropagation()}
                        />
                    </div>
                </Show>
                <div class={styles.historyTitle}>{item.title}</div>

                {/* 显示标签 */}
                <Show when={item.tags && item.tags.length > 0}>
                    <div class={styles.historyTags}>
                        {item.tags.map(tag => (
                            <span
                                class={styles.historyTag}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    selectedTag.value = tag;
                                }}
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                </Show>

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
    )


    return (
        <div class={styles.historyList}>
            <Toolbar />
            <div class={styles.historyItemsContainer}>
                {Object.entries(groupedHistory()).map(([group, items]) => (
                    items.length > 0 && (
                        <>
                            <div class={styles.historyGroupHeader}>
                                {getGroupLabel(group as any)}
                            </div>
                            {items.map(item => (
                                HistoryItem(item)
                            ))}
                        </>
                    )
                ))}
                <Show when={filteredHistory().length === 0}>
                    <div style="display: flex; justify-content: center; align-items: center; padding: 20px; color: var(--b3-theme-on-surface-light);">
                        {searchQuery().length > 0 ? '没有找到匹配的历史记录' : '没有历史记录'}
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default HistoryList;
