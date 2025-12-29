/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 16:59:06
 * @FilePath     : /src/func/gpt/tools/index.ts
 * @LastEditTime : 2025-12-29 23:06:06
 * @Description  :
 */
// 导出类型和工具执行器
export * from './types';
export { ToolExecutor } from './executor';

import { createVFS } from '@/libs/vfs';
// 导入工具
import { ToolExecutor } from './executor';
import { basicTool } from './basic';
import { toolGroupWeb } from './web';
import { createFileEditorToolGroup, createFileSystemToolGroup } from './file-system';
import { scriptTools } from './script-tools';
import { ApprovalUIAdapter } from './types';
import { DefaultUIAdapter } from './approval-ui';
import { toolsManager } from '../model/store';
import { siyuanTool } from './siyuan';
import { createCustomScriptToolGroupsFromCache } from './custom-program-tools';
// import { registerToolCallScriptGroup } from './toolcall-script';


const IS_IN_APP = window?.require?.('electron') !== undefined;

/**
 * 工具执行器工厂函数
 */
export const toolExecutorFactory = (options: {
    approvalAdapter?: ApprovalUIAdapter;
}) => {
    // 创建工具执行器
    const toolExecutor = new ToolExecutor();

    // 注册工具组
    toolExecutor.registerToolGroup(basicTool);
    toolExecutor.registerToolGroup(toolGroupWeb);

    // vfs
    const vfs = createVFS({
        local: true,
        memory: true,
    });
    toolExecutor.registerToolGroup(createFileSystemToolGroup(vfs));
    toolExecutor.registerToolGroup(createFileEditorToolGroup(vfs));

    IS_IN_APP && toolExecutor.registerToolGroup(scriptTools);
    toolExecutor.registerToolGroup(siyuanTool);

    // 从缓存加载自定义脚本工具组（同步）
    // 每个 Python 脚本对应一个独立的工具组
    if (IS_IN_APP) {
        const groups = createCustomScriptToolGroupsFromCache();
        for (const group of groups) {
            toolExecutor.registerToolGroup(group);
            // 应用工具组默认设置
            if (toolsManager().groupDefaults[group.name] !== undefined) {
                toolExecutor.toggleGroupEnabled(group.name, toolsManager().groupDefaults[group.name]);
            }
        }
    }


    // 注册 ToolCallScript 工具（需要注入 executor）
    /**
     * 实测效果仅仅是 toy 级别; 暂时先抛弃吧
     */
    // registerToolCallScriptGroup(toolExecutor);

    // 设置审批回调
    // const approvalAdapter = options.approvalAdapter || new DefaultUIAdapter();
    const approvalAdapter = options.approvalAdapter || new DefaultUIAdapter();

    // 设置执行审批回调
    if (!toolExecutor.hasExecutionApprovalCallback()) {
        toolExecutor.setExecutionApprovalCallback(async (toolName, toolDescription, args) => {
            // 获取工具
            const tool = toolExecutor.getTool(toolName);
            if (!tool) {
                return { approved: false, rejectReason: `Tool ${toolName} not found` };
            }

            // 调用 UI 适配器显示审批界面
            return await approvalAdapter.showToolExecutionApproval(
                toolName,
                toolDescription,
                args,
                tool.definition
            );
        });
    }

    // 设置结果审批回调
    if (!toolExecutor.hasResultApprovalCallback()) {
        toolExecutor.setResultApprovalCallback(async (toolName, args, result) => {
            return await approvalAdapter.showToolResultApproval(
                toolName,
                args,
                result
            );
        });
    }

    // 应用工具组默认设置
    const groupDefaults = toolsManager().groupDefaults;
    Object.entries(groupDefaults).forEach(([groupName, enabled]) => {
        if (toolExecutor.groupRegistry[groupName]) {
            toolExecutor.toggleGroupEnabled(groupName, enabled);
        }
    });

    // 应用工具级别默认设置
    const toolDefaults = toolsManager().toolDefaults;
    Object.entries(toolDefaults).forEach(([toolName, enabled]) => {
        toolExecutor.setToolEnabled(toolName, enabled);
    });

    return toolExecutor;
};
