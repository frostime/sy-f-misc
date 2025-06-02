/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-31 18:48:52
 * @FilePath     : /src/func/gpt/setting/ToolsManagerSetting.tsx
 * @Description  : 工具管理器设置组件
 */
import { Component, For, Show, createSignal } from 'solid-js';
import { toolsManager } from './store';
import { toolExecutorFactory } from '../tools';
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

    return (
        <div class="tools-manager-setting">
            <div class="tools-manager-groups">
                <For each={Object.entries(tempExecutor.groupRegistry)}>
                    {([groupName, group]) => (
                        <div class="tools-manager-group">
                            <div class="tools-manager-group-header">
                                <div class="tools-manager-group-toggle">
                                    <input
                                        type="checkbox"
                                        checked={isGroupEnabled(groupName)}
                                        onChange={() => toggleGroupEnabled(groupName)}
                                    />
                                    <span class="tools-manager-group-name">{group.name}</span>
                                </div>
                                <div
                                    class="tools-manager-group-expand"
                                    onClick={() => toggleGroupExpand(groupName)}
                                >
                                    {collapsedGroups()[groupName] ? '◄' : '▼'}
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
                                                </span>
                                                <span class="tools-manager-tool-description">
                                                    {tool.definition.function.description}
                                                </span>
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
