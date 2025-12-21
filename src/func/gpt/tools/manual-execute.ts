/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-21
 * @FilePath     : /src/func/gpt/tools/manual-execute.ts
 * @LastEditTime : 2025-12-21
 * @Description  : 手动工具调用测试面板
 */
import { openIframeTab } from "@/func/html-pages/core";
import { ToolExecutor } from './executor';
import { basicTool } from './basic';
import { toolGroupWeb } from './web';
import { createFileEditorToolGroup, createFileSystemToolGroup } from './file-system';
import { scriptTools } from './script-tools';
import { siyuanTool } from './siyuan';
import { createCustomScriptToolGroupsFromCache } from './custom-program-tools';
import { createVFS } from '@/libs/vfs';

const IS_IN_APP = window?.require?.('electron') !== undefined;

/**
 * 创建无权限限制的测试 ToolExecutor
 */
const createTestExecutor = () => {
    const executor = new ToolExecutor();

    // 注册所有工具组（复用 toolExecutorFactory 的注册逻辑）
    executor.registerToolGroup(basicTool);
    executor.registerToolGroup(toolGroupWeb);

    // VFS
    const vfs = createVFS({
        local: true,
        memory: true,
    });
    executor.registerToolGroup(createFileSystemToolGroup(vfs));
    executor.registerToolGroup(createFileEditorToolGroup(vfs));

    IS_IN_APP && executor.registerToolGroup(scriptTools);
    executor.registerToolGroup(siyuanTool);

    // 自定义脚本工具组
    if (IS_IN_APP) {
        const groups = createCustomScriptToolGroupsFromCache();
        for (const group of groups) {
            executor.registerToolGroup(group);
        }
    }

    // 启用所有工具组（测试环境）
    Object.keys(executor.groupRegistry).forEach(groupName => {
        executor.toggleGroupEnabled(groupName, true);
    });

    return executor;
};

/**
 * 打开手动工具调用面板
 */
export const openManualExecutePanel = () => {
    const executor = createTestExecutor();

    openIframeTab({
        tabId: 'manual-execute-tools',
        title: '🛠️ 手动工具调用',
        icon: 'iconGithub',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/manual-execute.html',
            inject: {
                presetSdk: true,
                customSdk: {
                    /**
                     * 列出所有工具组及其工具
                     */
                    listToolGroups: () => {
                        return Object.keys(executor.groupRegistry).map(name => {
                            const group = executor.groupRegistry[name];
                            return {
                                name,
                                tools: group.tools.map(t => ({
                                    name: t.definition.function.name,
                                    description: t.definition.function.description || '',
                                    parameters: t.definition.function.parameters
                                }))
                            };
                        });
                    },

                    /**
                     * 获取工具定义
                     */
                    getToolDefinition: (toolName: string) => {
                        const tool = executor.getTool(toolName);
                        return tool ? tool.definition : null;
                    },

                    /**
                     * 执行工具（跳过所有审批）
                     */
                    executeTool: async (toolName: string, args: Record<string, any>) => {
                        return await executor.execute(toolName, args, {
                            skipExecutionApproval: true,
                            skipResultApproval: true
                        });
                    }
                }
            }
        }
    });
};
