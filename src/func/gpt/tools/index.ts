/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 16:59:06
 * @FilePath     : /src/func/gpt/tools/index.ts
 * @LastEditTime : 2025-05-31 21:20:01
 * @Description  :
 */
// 导出类型和工具执行器
export * from './types';
export { ToolExecutor } from './executor';

// 导入工具
import { ToolExecutor } from './executor';
import { basicTool } from './basic';
import { toolGroupWeb } from './web';
import { fileSystemTools } from './file-system';
import { scriptTools } from './script-tools';
import { ApprovalUIAdapter } from './types';
import { DefaultUIAdapter } from './approval-ui';
import { toolsManager } from '../setting/store';

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
    toolExecutor.registerToolGroup(fileSystemTools);
    toolExecutor.registerToolGroup(scriptTools);

    // 设置审批回调
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
                args
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
