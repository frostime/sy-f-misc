/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 16:59:06
 * @FilePath     : /src/func/gpt/tools/index.ts
 * @LastEditTime : 2026-02-09
 * @Description  :
 */
// 导出类型和工具执行器
export * from './types';
export { ToolExecutor } from './executor';

// 导入工具
import { ToolExecutor } from './executor';
import { basicTool } from './basic';
import { toolGroupWeb } from './web';
import { createFileSystemToolGroup } from './file-system';
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
    // NOTE: executor 内部仍保留 VFS 实例（dead code），后续可进一步清理
    const toolExecutor = new ToolExecutor({});

    // 注册工具组
    toolExecutor.registerToolGroup(basicTool);
    toolExecutor.registerToolGroup(toolGroupWeb);

    // 统一文件系统工具组（合并了查看/搜索/编辑/文件操作）
    toolExecutor.registerToolGroup(createFileSystemToolGroup());

    IS_IN_APP && toolExecutor.registerToolGroup(scriptTools);
    toolExecutor.registerToolGroup(siyuanTool);

    // 从缓存加载自定义脚本工具组（同步）
    if (IS_IN_APP) {
        const groups = createCustomScriptToolGroupsFromCache();
        for (const group of groups) {
            toolExecutor.registerToolGroup(group);
            if (toolsManager().groupDefaults[group.name] !== undefined) {
                toolExecutor.toggleGroupEnabled(group.name, toolsManager().groupDefaults[group.name]);
            }
        }
    }

    // 设置审批回调
    const approvalAdapter = options.approvalAdapter || new DefaultUIAdapter();

    // 设置执行审批回调
    if (!toolExecutor.hasExecutionApprovalCallback()) {
        toolExecutor.setExecutionApprovalCallback(async (toolName, toolDescription, args) => {
            const tool = toolExecutor.getTool(toolName);
            if (!tool) {
                return { approved: false, rejectReason: `Tool ${toolName} not found` };
            }
            return await approvalAdapter.showToolExecutionApproval(
                toolName, toolDescription, args, tool.definition
            );
        });
    }

    // 设置结果审批回调
    if (!toolExecutor.hasResultApprovalCallback()) {
        toolExecutor.setResultApprovalCallback(async (toolName, args, result) => {
            return await approvalAdapter.showToolResultApproval(toolName, args, result);
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
