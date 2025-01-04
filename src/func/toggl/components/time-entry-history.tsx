import { Show, For } from 'solid-js';
import { getTimeEntries } from '../api/time_entries';
import { type TimeEntry } from '../api/types';
import { me, projectNames, tags } from '../state/config';
import { createSignalRef } from '@frostime/solid-signal-ref';
import styles from './time-entry-history.module.scss';
import { toRfc3339 } from '../utils/time';

interface TimeEntriesStats {
    totalDuration: number;
    totalEntries: number;
}

interface GroupedEntry {
    date: string;
    entries: TimeEntry[];
}

const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    return `${hours}h ${minutes}m`;
};

const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return '昨天';
    } else {
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    }
};

const TimeEntryHistory = () => {
    const entries = createSignalRef<TimeEntry[]>([]);
    // const selectedYear = createSignalRef<number>(new Date().getFullYear());
    // const selectedMonth = createSignalRef<number>(new Date().getMonth() + 1);
    const loading = createSignalRef(false);

    const getProjectName = (projectId: number) => {
        return projectNames()[projectId] ?? `Project #${projectId}`;
    };

    const getTagNames = (tagIds: number[]) => {
        return tagIds.map(id => {
            const tag = tags().find(t => t.id === id);
            return tag ? tag.name : `#${id}`;
        });
    };

    const fetchEntries = async () => {
        loading(true);
        try {
            // const startDate = new Date(selectedYear(), selectedMonth() - 1, 1);
            // const endDate = new Date(selectedYear(), selectedMonth(), 0);
            // toggl 这个 API 默认最多只获取最近的 1K 条，所以暂时先没有做分页的毕业了
            const response = await getTimeEntries({
                // start_date: startDate.toISOString(),
                // end_date: endDate.toISOString()
                before: toRfc3339(new Date())
            });
            if (response.ok) {
                entries(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch time entries:', error);
        } finally {
            loading(false);
        }
    };

    const calculateStats = (): TimeEntriesStats => {
        return entries().reduce((acc, entry) => {
            return {
                totalDuration: acc.totalDuration + (entry.duration > 0 ? entry.duration : 0),
                totalEntries: acc.totalEntries + 1
            };
        }, { totalDuration: 0, totalEntries: 0 });
    };

    // const changeMonth = (delta: number) => {
    //     let newMonth = selectedMonth() + delta;
    //     let newYear = selectedYear();

    //     if (newMonth > 12) {
    //         newMonth = 1;
    //         newYear++;
    //     } else if (newMonth < 1) {
    //         newMonth = 12;
    //         newYear--;
    //     }

    //     selectedMonth(newMonth);
    //     selectedYear(newYear);
    // };

    const ealiestDate = createSignalRef("");

    const groupEntriesByDate = (entries: TimeEntry[]): GroupedEntry[] => {
        const groups: { [key: string]: TimeEntry[] } = {};

        // Sort entries by date (newest first)
        const sortedEntries = [...entries].sort((a, b) =>
            new Date(b.start).getTime() - new Date(a.start).getTime()
        );

        if (sortedEntries.length > 0) {
            ealiestDate(sortedEntries[sortedEntries.length - 1].start);
        }

        sortedEntries.forEach(entry => {
            const date = new Date(entry.start).toDateString();
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(entry);
        });

        return Object.entries(groups).map(([date, entries]) => ({
            date,
            entries
        }));
    };

    // Initial fetch
    if (me()) {
        fetchEntries();
    }

    // // Refetch when year or month changes
    // createEffect(() => {
    //     selectedYear();
    //     selectedMonth();
    //     fetchEntries();
    // });

    return (
        <div class={styles.container}>
            {/* Navigation Controls */}
            {/*<div class={styles.navigation}>
                <div class={styles.navGroup}>
                    <button
                        class={styles.navButton}
                        onClick={() => selectedYear(selectedYear() - 1)}
                    >
                        ◀
                    </button>
                    <span class={styles.navText}>{selectedYear()}</span>
                    <button
                        class={styles.navButton}
                        onClick={() => selectedYear(selectedYear() + 1)}
                    >
                        ▶
                    </button>
                </div>
                <div class={styles.navGroup}>
                    <button
                        class={styles.navButton}
                        onClick={() => changeMonth(-1)}
                    >
                        ◀
                    </button>
                    <span class={styles.navText}>{selectedMonth()}</span>
                    <button
                        class={styles.navButton}
                        onClick={() => changeMonth(1)}
                    >
                        ▶
                    </button>
                </div>
            </div>*/}

            {/* Content Area */}
            <div class={styles.content}>
                <Show when={!loading()} fallback={<div class={styles.loading}>Loading...</div>}>
                    <div class={styles.stats}>
                        {/* <div class={styles.statsTitle}>Statistics</div> */}
                        <div class={styles.statsGrid}>
                            <div>
                                <div class={styles.statsLabel}>Total Time</div>
                                <div class={styles.statsValue}>{formatDuration(calculateStats().totalDuration)}</div>
                            </div>
                            <div>
                                <div class={styles.statsLabel}>Total Entries</div>
                                <div class={styles.statsValue}>{calculateStats().totalEntries}</div>
                            </div>
                        </div>
                        <div style={{
                            "border-top": "1px solid var(--b3-border-color)",
                            "margin-top": "10px",
                            "padding-top": "10px",
                            display: "flex",
                            'justify-content': 'space-between',
                            'align-items': 'center'
                        }}>
                            <span>
                                {ealiestDate()?.split('T')[0]} ~ {formatDate(new Date())}
                            </span>
                            <a href={`https://track.toggl.com/reports/detailed/${me().default_workspace_id}/period/thisYear`} target="_blank">
                                前往 Toggl 查看完整记录
                            </a>
                        </div>
                    </div>

                    {/* Time Entries List */}
                    <div class={styles.entriesList}>
                        <For each={groupEntriesByDate(entries())}>
                            {(group) => (
                                <div>
                                    <div class={styles.dateSeparator}>
                                        <span class={styles.dateLabel}>
                                            {formatDate(new Date(group.date))}
                                        </span>
                                    </div>
                                    <For each={group.entries}>
                                        {(entry) => (
                                            <div class={styles.entryItem}>
                                                <div class={styles.entryContent}>
                                                    <div class={styles.entryInfo}>
                                                        <div class={styles.entryTitle}>
                                                            {entry.description || 'No description'}
                                                        </div>
                                                        <div class={styles.entryTime}>
                                                            {new Date(entry.start).toLocaleTimeString()}
                                                        </div>
                                                        <Show when={entry.tag_ids?.length > 0}>
                                                            <div class={styles.entryTags}>
                                                                <For each={getTagNames(entry.tag_ids)}>
                                                                    {(tagName) => (
                                                                        <span class={styles.tag}>{tagName}</span>
                                                                    )}
                                                                </For>
                                                            </div>
                                                        </Show>
                                                    </div>
                                                    <div class={styles.entryMeta}>
                                                        <div class={styles.entryDuration}>
                                                            {formatDuration(entry.duration)}
                                                        </div>
                                                        <Show when={entry.project_id}>
                                                            <div class={styles.entryProject}>
                                                                {getProjectName(entry.project_id)}
                                                            </div>
                                                        </Show>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            )}
                        </For>
                        <div class={styles.dateSeparator}>
                            <span class={styles.dateLabel}>
                                完整记录，请登录 <a href="https://track.toggl.com/timer" target="_blank">Toggl</a> 查看
                            </span>
                        </div>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default TimeEntryHistory;
