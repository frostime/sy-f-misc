/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 16:59:06
 * @FilePath     : /src/func/gpt/tools/index.ts
 * @LastEditTime : 2025-05-30 20:02:48
 * @Description  :
 */
// 导出类型和工具执行器
export * from './types';
export { ToolExecutor } from './executor';

// 导入工具
import { ToolExecutor } from './executor';
import * as utilsTools from './utils';
import { ApprovalUIAdapter } from './types';
import { DefaultUIAdapter } from './approval-ui';
import { bingSearchTool } from './web/bing';



export const toolExecutorFactory = (options: {
    approvalAdapter?: ApprovalUIAdapter;
}) => {
    // 注册工具
    const toolExecutor = new ToolExecutor();

    toolExecutor.registerToolModule(utilsTools);
    toolExecutor.registerTool(bingSearchTool);

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

    // register group level tools
    return toolExecutor;
}

