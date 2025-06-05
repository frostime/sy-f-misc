/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-05 21:05:45
 * @FilePath     : /src/func/gpt/chat/SessionToolsManager.tsx
 * @Description  : 会话级别的工具管理器组件
 */
import { Component, For, Show, createSignal } from 'solid-js';
import { ToolExecutor } from '../tools';
import '../setting/ToolsManagerSetting.scss';

/**
 * 会话级别的工具管理器组件
 * 复用 ToolsManagerSetting 的样式，但针对单个会话的 toolExecutor
 */
export const SessionToolsManager: Component<{
    toolExecutor: ToolExecutor;
    onToggleGroup?: (groupName: string, enabled: boolean) => void;
    onToggleTool?: (toolName: string, enabled: boolean) => void;
    onClose?: () => void;
}> = (props) => {
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
        const currentEnabled = props.toolExecutor.isGroupEnabled(groupName);
        props.toolExecutor.toggleGroupEnabled(groupName, !currentEnabled);

        // 调用回调函数
        if (props.onToggleGroup) {
            props.onToggleGroup(groupName, !currentEnabled);
        }
    };

    // 切换工具的启用状态
    const toggleToolEnabled = (toolName: string) => {
        const currentEnabled = props.toolExecutor.isToolEnabled(toolName);
        props.toolExecutor.setToolEnabled(toolName, !currentEnabled);

        // 调用回调函数
        if (props.onToggleTool) {
            props.onToggleTool(toolName, !currentEnabled);
        }
    };

    return (
        <div class="tools-manager-setting" style={{ flex: 1 }}>
            <div class="tools-manager-groups">
                <For each={Object.entries(props.toolExecutor.groupRegistry)}>
                    {([groupName, group]) => (
                        <div class="tools-manager-group">
                            <div class="tools-manager-group-header" onClick={() => toggleGroupExpand(groupName)}>
                                <div class="tools-manager-group-toggle">
                                    <input
                                        type="checkbox"
                                        checked={props.toolExecutor.isGroupEnabled(groupName)}
                                        onChange={() => toggleGroupEnabled(groupName)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <span class="tools-manager-group-name">{group.name}</span>
                                </div>
                                <div
                                    class="tools-manager-group-expand"
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
                                                    checked={props.toolExecutor.isToolEnabled(tool.definition.function.name)}
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
