/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-09
 * @FilePath     : /src/func/quick-input-template/components/QuickInputDialog.tsx
 * @Description  : 快速输入对话框组件
 */

import { Component, For, Show, createSignal } from "solid-js";
import { INewInputTemplate } from "../types";

export interface QuickInputDialogProps {
    templates: INewInputTemplate[];
    onSelect: (template: INewInputTemplate) => void;
    onClose?: () => void;
    showGroups?: boolean;
}

const QuickInputDialog: Component<QuickInputDialogProps> = (props) => {
    const [selectedGroup, setSelectedGroup] = createSignal<string | null>(null);

    // 按分组组织模板
    const groups = () => {
        const groupMap = new Map<string, INewInputTemplate[]>();

        props.templates.forEach(template => {
            const group = template.group || '默认';
            if (!groupMap.has(group)) {
                groupMap.set(group, []);
            }
            groupMap.get(group)!.push(template);
        });

        return Array.from(groupMap.entries()).map(([name, templates]) => ({
            name,
            templates
        }));
    };

    // 当前显示的模板列表
    const displayTemplates = () => {
        if (!props.showGroups || selectedGroup() === null) {
            return props.templates;
        }
        return props.templates.filter(t => (t.group || '默认') === selectedGroup());
    };

    return (
        <div style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '12px',
            padding: '8px 0'
        }}>
            {/* 分组选择器 */}
            <Show when={props.showGroups && groups().length > 1}>
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    'flex-wrap': 'wrap',
                    'padding-bottom': '8px',
                    'border-bottom': '1px solid var(--b3-theme-surface-lighter)'
                }}>
                    <button
                        class={`b3-button ${selectedGroup() === null ? 'b3-button--outline' : ''}`}
                        onclick={() => setSelectedGroup(null)}
                    >
                        全部
                    </button>
                    <For each={groups()}>
                        {(group) => (
                            <button
                                class={`b3-button ${selectedGroup() === group.name ? 'b3-button--outline' : ''}`}
                                onclick={() => setSelectedGroup(group.name)}
                            >
                                {group.name} ({group.templates.length})
                            </button>
                        )}
                    </For>
                </div>
            </Show>

            {/* 模板列表 */}
            <div style={{
                display: 'grid',
                'grid-template-columns': 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '12px',
                'max-height': '60vh',
                'overflow-y': 'auto'
            }}>
                <Show when={displayTemplates().length > 0} fallback={
                    <div style={{
                        'grid-column': '1 / -1',
                        'text-align': 'center',
                        padding: '40px',
                        color: 'var(--b3-theme-on-surface-light)'
                    }}>
                        <div style={{ 'font-size': '48px', 'margin-bottom': '12px' }}>📝</div>
                        <div>暂无模板，请在设置中添加</div>
                    </div>
                }>
                    <For each={displayTemplates()}>
                        {(template) => (
                            <button
                                class="b3-button"
                                style={{
                                    height: 'auto',
                                    padding: '16px',
                                    'text-align': 'left',
                                    display: 'flex',
                                    'flex-direction': 'column',
                                    gap: '8px',
                                    'align-items': 'flex-start',
                                    'transition': 'all 0.2s'
                                }}
                                onclick={() => props.onSelect(template)}
                                onmouseenter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                }}
                                onmouseleave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    'align-items': 'center',
                                    gap: '8px',
                                    width: '100%'
                                }}>
                                    <Show when={template.icon}>
                                        <span style={{ 'font-size': '24px' }}>{template.icon}</span>
                                    </Show>
                                    <span style={{
                                        'font-weight': '500',
                                        'font-size': '15px',
                                        flex: '1'
                                    }}>
                                        {template.name}
                                    </span>
                                </div>
                                <Show when={template.desc}>
                                    <div style={{
                                        'font-size': '12px',
                                        color: 'var(--b3-theme-on-surface-light)',
                                        'line-height': '1.4'
                                    }}>
                                        {template.desc}
                                    </div>
                                </Show>
                            </button>
                        )}
                    </For>
                </Show>
            </div>
        </div>
    );
};

export default QuickInputDialog;
