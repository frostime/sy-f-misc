/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-08-24 16:20:00
 * @FilePath     : /src/func/gpt/chat/ChatSession/DeleteHistory/DeleteHistoryPanel.tsx
 * @LastEditTime : 2025-08-24 17:17:39
 * @Description  : 删除历史记录面板组件
 */

import { Component, For, Show } from 'solid-js';
import { showMessage } from 'siyuan';
import type { IDeleteRecord } from './types';
import { adaptIMessageContentGetter } from '@/func/gpt/data-utils';

interface IDeleteHistoryPanelProps {
    /** 删除记录列表 */
    records: IDeleteRecord[];
    /** 清空历史记录回调 */
    onClearHistory: () => void;
    /** 删除单个记录回调 */
    onRemoveRecord: (recordId: string) => void;
}

/**
 * 获取操作类型的图标和文本
 */
const getTypeInfo = (type: IDeleteRecord['type']) => {
    switch (type) {
        case 'message':
            return { icon: 'iconTrashcan', text: '消息删除' };
        case 'version':
            return { icon: 'iconClose', text: '版本删除' };
        default:
            return { icon: 'iconDelete', text: '删除操作' };
    }
};

/**
 * 复制文本到剪贴板
 */
const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        showMessage('内容已复制到剪贴板');
    } catch (error) {
        console.error('复制失败:', error);
        showMessage('复制失败');
    }
};

/**
 * 删除历史记录面板组件
 */
const DeleteHistoryPanel: Component<IDeleteHistoryPanelProps> = (props) => {

    const versionText = (content: TMessageContent) => {
        const { text } = adaptIMessageContentGetter(content);
        return text;
    }

    const DeleteRecord = (record: IDeleteRecord) => {
        const typeInfo = getTypeInfo(record.type);
        return (
            <div class="b3-list-item" style={{
                "padding": "12px",
                "border": "1px solid var(--b3-theme-surface-lighter)",
                "border-radius": "6px",
                "background-color": "var(--b3-theme-surface)",
                "display": "flex",
                "flex-direction": "column"
            }}>
                <div style={{"display": "flex", "flex-direction": "column", "width": "100%"}}>
                    {/* 头部信息 */}
                    <div style={{
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "space-between",
                        "margin-bottom": "8px"
                    }}>
                        <div style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "8px"
                        }}>
                            <svg style={{
                                width: "16px",
                                height: "16px",
                                color: "var(--b3-theme-on-surface-light)"
                            }}>
                                <use href={`#${typeInfo.icon}`}></use>
                            </svg>
                            <span style={{
                                "font-weight": "500",
                                "font-size": "14px"
                            }}>
                                {typeInfo.text}
                            </span>
                            <Show when={record.versionId}>
                                <span class="b3-chip" style={{ "font-size": "11px" }}>
                                    版本: {record.versionId}
                                </span>
                            </Show>
                            <Show when={record.totalVersions && record.totalVersions > 1}>
                                <span class="b3-chip" style={{ "font-size": "11px" }}>
                                    共{record.totalVersions}个版本
                                </span>
                            </Show>
                        </div>
                        <button
                            class="b3-button b3-button--small b3-button--text"
                            onClick={() => props.onRemoveRecord(record.id)}
                            style={{
                                "font-size": "12px",
                                color: "var(--b3-theme-on-surface-light)"
                            }}
                        >
                            删除
                        </button>
                    </div>

                    {/* 会话信息 */}
                    <div style={{
                        "font-size": "12px",
                        color: "var(--b3-theme-on-surface-light)",
                        "margin-bottom": "8px"
                    }}>
                        来自会话: {record.sessionTitle}
                    </div>

                    {/* 内容预览 */}
                    <div style={{
                        "background-color": "var(--b3-theme-surface-lighter)",
                        padding: "8px",
                        "border-radius": "4px",
                        "font-size": "1em",
                        "line-height": "1.4",
                        "max-height": "250px",
                        "overflow-y": "auto",
                        "word-break": "break-word",
                        "white-space": "pre-wrap",
                        "margin-bottom": "8px"
                    }}>
                        {record.content || '无内容'}
                    </div>

                    {/* 显示多版本信息 */}
                    <Show when={record.originalItem?.versions && Object.keys(record.originalItem.versions).length > 1}>
                        <div style={{
                            "border-top": "1px solid var(--b3-theme-surface-lighter)",
                            "padding-top": "8px",
                            "margin-top": "8px"
                        }}>
                            <div style={{
                                "font-size": "12px",
                                "font-weight": "bold",
                                color: "var(--b3-theme-on-surface-light)",
                                "margin-bottom": "6px"
                            }}>
                                所有版本:
                            </div>
                            <div style={{ "display": "flex", "flex-direction": "column", "gap": "4px" }}>
                                <For each={Object.entries(record.originalItem.versions)}>
                                    {([versionId, versionData]) => (
                                        <div style={{
                                            "padding": "6px",
                                            "border-left": "3px solid var(--b3-theme-primary-light)",
                                            "background-color": "var(--b3-theme-surface)",
                                            "border-radius": "3px"
                                        }}>
                                            <div style={{
                                                "font-size": "0.85em",
                                                "font-weight": "bold",
                                                color: "var(--b3-theme-primary)",
                                                "margin-bottom": "2px"
                                            }}>
                                                版本 {versionId} | {versionText(versionData['content']).length} 字符
                                                {record.originalItem?.currentVersion === versionId ? '(当前)' : ''}
                                            </div>
                                            <div style={{
                                                "font-size": "0.85em",
                                                "margin-bottom": "4px",
                                                "line-height": "1.3"
                                            }}>
                                                {versionText(versionData['content']).substring(0, 80) + (versionText(versionData['content']).length > 80 ? '...' : '')}
                                            </div>
                                            <button
                                                class="b3-button b3-button--small b3-button--text"
                                                style={{ "font-size": "0.85em" }}
                                                onClick={() => {
                                                    const content = versionText(versionData['content']);
                                                    copyToClipboard(content);
                                                }}
                                            >
                                                复制此版本
                                            </button>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </div>
                    </Show>

                    {/* 底部操作和时间 */}
                    <div style={{
                        display: "flex",
                        "justify-content": "space-between",
                        "align-items": "center",
                        "margin-top": "8px",
                        "padding-top": "8px",
                        "border-top": "1px solid var(--b3-theme-surface-lighter)"
                    }}>
                        <div style={{
                            "font-size": "12px",
                            color: "var(--b3-theme-on-surface-light)"
                        }}>
                            {new Date(record.timestamp).toLocaleString()}
                        </div>
                        <button
                            class="b3-button b3-button--small b3-button--outline"
                            onClick={() => copyToClipboard(record.content)}
                            style={{ "font-size": "12px" }}
                        >
                            <svg style={{
                                width: "12px",
                                height: "12px",
                                "margin-right": "4px"
                            }}>
                                <use href="#iconCopy"></use>
                            </svg>
                            复制
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            "width": "100%",
            "max-height": "70vh",
            "display": "flex",
            "flex-direction": "column"
        }}>
            <div style={{
                "padding": "16px",
                "border-bottom": "1px solid var(--b3-theme-surface-lighter)",
                "display": "flex",
                "justify-content": "space-between",
                "align-items": "center"
            }}>
                <div style={{
                    color: "var(--b3-theme-on-surface-light)",
                    "font-size": "14px"
                }}>
                    共 {props.records.length} 条删除记录
                </div>
                <button
                    class="b3-button b3-button--small b3-button--outline"
                    onClick={props.onClearHistory}
                    style={{ "font-size": "12px" }}
                >
                    清空历史
                </button>
            </div>

            <div style={{
                "flex": "1",
                "overflow-y": "auto",
                "padding": "8px"
            }}>
                <Show
                    when={props.records.length > 0}
                    fallback={
                        <div style={{
                            "text-align": "center",
                            color: "var(--b3-theme-on-surface-light)",
                            padding: "64px 16px"
                        }}>
                            <div style={{ "font-size": "48px", "margin-bottom": "16px" }}>
                                <svg style={{ width: "48px", height: "48px" }}>
                                    <use href="#iconTrashcan"></use>
                                </svg>
                            </div>
                            <div>暂无删除记录</div>
                        </div>
                    }
                >
                    <div style={{ "display": "flex", "flex-direction": "column", "gap": "8px" }}>
                        <For each={props.records}>
                            {(record) => DeleteRecord(record)}
                        </For>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default DeleteHistoryPanel;
