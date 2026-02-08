/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-31 18:48:52
 * @FilePath     : /src/func/gpt/setting/ToolsManagerSetting.tsx
 * @Description  : 工具管理器设置组件
 */


import { Component, For, Show, createSignal, onMount } from 'solid-js';
import { toolsManager } from '../model/store';
import { toolExecutorFactory } from '../tools';
import { openIframeDialog } from '@/func/html-pages/core';
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

    // 检查工具是否有权限覆盖配置
    const hasPermissionOverride = (toolName: string) => {
        return !!toolsManager().toolPermissionOverrides[toolName];
    };

    // 打开高级权限管理器 (HSPA 页面)
    const openAdvancedPermissionManager = (groupName?: string) => {
        // 构建 URL，如果指定了 groupName 则添加 query 参数
        let url = '/plugins/sy-f-misc/pages/tool-permission-manager.html';
        if (groupName) {
            url += `?group=${encodeURIComponent(groupName)}`;
        }

        openIframeDialog({
            title: groupName ? `管理分组执行权限 - ${groupName}` : '管理工具执行权限',
            iframeConfig: {
                type: 'url',
                source: url,
                inject: {
                    presetSdk: true,
                    siyuanCss: true,
                    customSdk: {
                        // 获取所有工具数据
                        getToolsData: () => {
                            const allTools = [];
                            const allGroups = new Set<string>();

                            // 遍历所有工具组，收集工具信息
                            for (const [groupName, group] of Object.entries(tempExecutor.groupRegistry)) {
                                allGroups.add(groupName);
                                for (const tool of group.tools) {
                                    const permission = tool.permission;
                                    allTools.push({
                                        name: tool.definition.function.name,
                                        description: tool.definition.function.description,
                                        group: groupName,
                                        executionPolicy: 'executionPolicy' in permission ? permission.executionPolicy : undefined,
                                        resultApprovalPolicy: 'resultApprovalPolicy' in permission ? permission.resultApprovalPolicy : undefined,
                                        // 兼容旧格式
                                        permissionLevel: (permission as any).permissionLevel,
                                        requireExecutionApproval: (permission as any).requireExecutionApproval,
                                        requireResultApproval: (permission as any).requireResultApproval,
                                    });
                                }
                            }

                            return {
                                tools: allTools,
                                groups: Array.from(allGroups).sort(),
                                overrides: structuredClone(toolsManager.unwrap().toolPermissionOverrides) || {}
                            };
                        },

                        // 保存权限覆盖配置
                        saveOverrides: (overrides: Record<string, any>) => {
                            // 更新 toolPermissionOverrides
                            toolsManager.update('toolPermissionOverrides', overrides);

                            // 更新 schema 版本为 2 (使用新格式)
                            if (!toolsManager().permissionSchemaVersion || toolsManager().permissionSchemaVersion < 2) {
                                toolsManager.update('permissionSchemaVersion', 2);
                            }
                        }
                    }
                }
            },
            width: '95%',
            height: '90%'
        });
    };

    return (
        <div class="tools-manager-setting">
            <div class="b3-card" style={{ margin: '0 0 8px 0', padding: '8px 16px', display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
                <div style={{ flex: 1 }}>
                    请按需开启工具，每个开启的工具会增加 token 消耗。
                    部分工具存在风险/隐私问题，需用户审核后才能执行。
                    无编程经验者慎重使用脚本工具组(特别是 shell 工具)。
                </div>
                <button
                    class="b3-button b3-button--outline"
                    onClick={() => openAdvancedPermissionManager()}
                    title="打开高级权限管理器，批量管理所有工具的执行和审批策略"
                    style={{ 'flex-shrink': 0, 'margin-left': '12px' }}
                >
                    <svg style={{ width: '14px', height: '14px', 'margin-right': '4px' }}>
                        <use href="#iconSettings" />
                    </svg>
                    管理工具执行权限
                </button>
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
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openAdvancedPermissionManager(groupName);
                                        }}
                                        title="管理该分组的工具执行权限"
                                    >
                                        <svg style={{ width: '14px', height: '14px', 'margin-right': '4px' }}>
                                            <use href="#iconSettings" />
                                        </svg>
                                        管理分组执行权限
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
