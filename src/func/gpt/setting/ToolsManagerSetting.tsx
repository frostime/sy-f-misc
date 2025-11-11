/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-31 18:48:52
 * @FilePath     : /src/func/gpt/setting/ToolsManagerSetting.tsx
 * @Description  : 工具管理器设置组件
 */


import { Component, For, Show, createSignal, onMount } from 'solid-js';
import { toolsManager } from './store';
import { toolExecutorFactory } from '../tools';
import { solidDialog } from '@/libs/dialog';
import {
    ToolPermissionConfigDialog,
    BatchPermissionConfigDialog
} from './ToolPermissionConfigDialog';
import './ToolsManagerSetting.scss';

/**
 * 工具管理器设置组件
 */
export const ToolsManagerSetting: Component = () => {
    // 创建一个临时的工具执行器，用于获取所有工具组和工具
    const tempExecutor = toolExecutorFactory({});

    // 为每个工具组创建一个展开/折叠状态
    const [collapsedGroups, setCollapsedGroups] = createSignal<Record<string, boolean>>({});

    // 切换工具组的展开/折叠状态
    const toggleGroupExpand = (groupName: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    onMount(() => {
        // 初始化所有工具组为闭合状态
        const initialCollapsedState: Record<string, boolean> = {};
        for (const groupName of Object.keys(tempExecutor.groupRegistry)) {
            initialCollapsedState[groupName] = true;
        }
        setCollapsedGroups(initialCollapsedState);
    });

    // 切换工具组的启用状态
    const toggleGroupEnabled = (groupName: string) => {
        const currentEnabled = toolsManager().groupDefaults[groupName] !== false;

        toolsManager.update('groupDefaults', groupName, !currentEnabled);
    };

    // 切换工具的启用状态
    const toggleToolEnabled = (toolName: string) => {
        const currentEnabled = toolsManager().toolDefaults[toolName] !== false;

        toolsManager.update('toolDefaults', toolName, !currentEnabled);
    };

    // 检查工具组是否启用
    const isGroupEnabled = (groupName: string) => {
        return toolsManager().groupDefaults[groupName] ?? false;
    };

    // 检查工具是否启用
    const isToolEnabled = (toolName: string) => {
        return toolsManager().toolDefaults[toolName] ?? true;
    };

    // 打开工具权限配置对话框
    const openPermissionConfig = (tool: any, e: MouseEvent) => {
        e.stopPropagation();
        const { dialog } = solidDialog({
            title: '工具权限配置',
            loader: () => (
                <ToolPermissionConfigDialog
                    tool={tool}
                    onClose={() => dialog.destroy()}
                />
            ),
            width: '540px',
            height: 'auto'
        });
    };

    // 检查工具是否有权限覆盖配置
    const hasPermissionOverride = (toolName: string) => {
        return !!toolsManager().toolPermissionOverrides[toolName];
    };

    // 打开批量配置对话框
    const openBatchConfig = (groupName: string, tools: any[], e: MouseEvent) => {
        e.stopPropagation();
        const { dialog } = solidDialog({
            title: '批量配置工具权限',
            loader: () => (
                <BatchPermissionConfigDialog
                    tools={tools}
                    groupName={groupName}
                    onClose={() => dialog.destroy()}
                />
            ),
            width: '740px',
            height: 'auto'
        });
    };

    return (
        <div class="tools-manager-setting">
            <div class="b3-card" style={{ margin: '0 0 8px 0', padding: '8px 16px', display: 'block' }}>
                请按需开启工具，每个开启的工具会增加 token 消耗。
                部分工具存在风险/隐私问题，需用户审核后才能执行。
                无编程经验者慎重使用脚本工具组(特别是 shell 工具)。
            </div>
            <div class="tools-manager-groups">
                <For each={Object.entries(tempExecutor.groupRegistry)}>
                    {([groupName, group]) => (
                        <div class="tools-manager-group">
                            <div class="tools-manager-group-header" onClick={() => toggleGroupExpand(groupName)}>
                                <div class="tools-manager-group-toggle">
                                    <input
                                        type="checkbox"
                                        checked={isGroupEnabled(groupName)}
                                        onChange={() => toggleGroupEnabled(groupName)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <span class="tools-manager-group-name">{group.name}</span>
                                </div>
                                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                                    <button
                                        class="b3-button b3-button--text"
                                        style={{
                                            padding: '2px 8px',
                                            'font-size': '12px',
                                            opacity: 0.7
                                        }}
                                        onClick={(e) => openBatchConfig(group.name, group.tools, e)}
                                        title="批量配置工具权限"
                                    >
                                        <svg style={{ width: '14px', height: '14px', 'margin-right': '4px' }}>
                                            <use href="#iconSettings" />
                                        </svg>
                                        批量配置
                                    </button>
                                    <div class="tools-manager-group-expand">
                                        <svg class={`icon-arrow ${collapsedGroups()[groupName] ? 'collapsed' : ''}`}><use href="#iconDown"></use></svg>
                                    </div>
                                </div>
                            </div>

                            <Show when={collapsedGroups()[groupName] !== true}>
                                <div class="tools-manager-tools">
                                    <For each={group.tools}>
                                        {tool => (
                                            <div class="tools-manager-tool">
                                                <input
                                                    type="checkbox"
                                                    checked={isToolEnabled(tool.definition.function.name)}
                                                    disabled={!isGroupEnabled(groupName)}
                                                    onChange={() => toggleToolEnabled(tool.definition.function.name)}
                                                />
                                                <span class="tools-manager-tool-name">
                                                    {tool.definition.function.name}
                                                    <Show when={hasPermissionOverride(tool.definition.function.name)}>
                                                        <span
                                                            style={{
                                                                'margin-left': '4px',
                                                                color: 'var(--b3-theme-primary)',
                                                                'font-size': '11px'
                                                            }}
                                                            title="已自定义权限配置"
                                                        >
                                                            ⚙️
                                                        </span>
                                                    </Show>
                                                </span>
                                                <span class="tools-manager-tool-description">
                                                    {tool.definition.function.description}
                                                </span>
                                                <button
                                                    class="b3-button b3-button--text tools-manager-tool-config-btn"
                                                    onClick={(e) => openPermissionConfig(tool, e)}
                                                    title="配置权限"
                                                    style={{
                                                        'margin-left': 'auto',
                                                        padding: '2px 6px',
                                                        'font-size': '12px'
                                                    }}
                                                >
                                                    <svg style={{ width: '14px', height: '14px' }}>
                                                        <use href="#iconSettings" />
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
};
