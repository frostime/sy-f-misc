/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-30 15:10:56
 * @FilePath     : /src/func/gpt/tools/basic.ts
 * @LastEditTime : 2025-05-30 21:39:47
 * @Description  : 
 */
import {
    Tool,
    ToolPermissionLevel,
    ToolExecuteStatus,
    ToolExecuteResult
} from './types';


/**
 * 日期时间工具
 */
const datetimeTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'datetime',
            description: '获取当前日期和时间',
            parameters: {
                type: 'object',
                properties: {
                    format: {
                        type: 'string',
                        description: '日期格式，例如：YYYY-MM-DD HH:mm:ss'
                    },
                    timezone: {
                        type: 'string',
                        description: '时区，例如：Asia/Shanghai',
                    }
                },
                required: []
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { format?: string; timezone?: string }): Promise<ToolExecuteResult> => {
        try {
            // 这里可以使用 args.format 和 args.timezone 进行格式化
            // 为简化示例，我们暂时忽略这些参数
            const now = new Date();

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: now.toISOString()
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Datetime error: ${error.message}`
            };
        }
    }
};

// 导出工具列表
export const basicTool = {
    name: 'basic-tools',
    tools: [datetimeTool],
    rulePrompt: `
一些基础工具；如果在回答中涉及到实时性，并且你对当前的时间不确定，请务必调用 datetime 确保时间正确
`
}
