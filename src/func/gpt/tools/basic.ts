/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-30 15:10:56
 * @FilePath     : /src/func/gpt/tools/basic.ts
 * @LastEditTime : 2025-08-13 02:01:34
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
            const now = new Date();
            let dateObj = now;

            // 处理时区
            if (args.timezone) {
                try {
                    // 获取目标时区与本地时区的时差（分钟）
                    const targetDate = new Date(now.toLocaleString('en-US', { timeZone: args.timezone }));
                    // 应用时区调整到日期对象
                    dateObj = targetDate;
                } catch (tzError) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `Invalid timezone: ${args.timezone}`
                    };
                }
            }

            // 处理格式化输出
            if (args.format) {
                // 从调整后的日期对象中获取各部分
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                const hours = String(dateObj.getHours()).padStart(2, '0');
                const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                const seconds = String(dateObj.getSeconds()).padStart(2, '0');

                // 应用格式化
                let result = args.format
                    .replace('YYYY', String(year))
                    .replace('MM', month)
                    .replace('DD', day)
                    .replace('HH', hours)
                    .replace('mm', minutes)
                    .replace('ss', seconds);

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: result
                };
            } else if (args.timezone) {
                // 如果只有时区没有格式，使用ISO格式但基于调整后的日期
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: dateObj.toISOString().replace('Z', ` (${args.timezone})`)
                };
            } else {
                // 默认返回ISO格式
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: now.toISOString()
                };
            }
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Datetime error: ${error.message}`
            };
        }
    }
};

const textTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'text',
            description: '对文本进行核心操作，如获取长度、查找和替换。支持使用纯文本或正则表达式进行搜索。',
            parameters: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: '要处理的输入文本。'
                    },
                    operation: {
                        type: 'string',
                        description: '要执行的操作。',
                        enum: ['length', 'find', 'findAll', 'replace', 'replaceAll']
                    },
                    search: {
                        type: 'string',
                        description: '要查找的子字符串或正则表达式。正则表达式格式为 /pattern/flags，例如 /\\d+/g。'
                    },
                    replacement: {
                        type: 'string',
                        description: '用于替换操作的替换字符串。'
                    }
                },
                required: ['input', 'operation']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },
    execute: async (args: {
        input: string;
        operation: 'length' | 'find' | 'findAll' | 'replace' | 'replaceAll';
        search?: string;
        replacement?: string;
    }): Promise<ToolExecuteResult> => {
        const { input, operation, search, replacement } = args;

        try {
            // 检查需要 search 参数的操作
            if (['find', 'findAll', 'replace', 'replaceAll'].includes(operation) && typeof search !== 'string') {
                return { status: ToolExecuteStatus.ERROR, error: '此操作需要 search 参数。' };
            }

            // 检查需要 replacement 参数的操作
            if (['replace', 'replaceAll'].includes(operation) && typeof replacement !== 'string') {
                return { status: ToolExecuteStatus.ERROR, error: '此操作需要 replacement 参数。' };
            }

            // 解析正则表达式
            let searchPattern: string | RegExp = search;
            if (search && search.startsWith('/') && search.lastIndexOf('/') > 0) {
                const lastSlash = search.lastIndexOf('/');
                const pattern = search.substring(1, lastSlash);
                let flags = search.substring(lastSlash + 1);
                // 核心原则：操作决定全局性，移除用户传入的 'g' 标志
                flags = flags.replace('g', '');
                if (operation === 'findAll' || operation === 'replaceAll') {
                    flags += 'g'; // 根据操作强制添加 'g'
                }
                searchPattern = new RegExp(pattern, flags);
            } else if (operation === 'replaceAll') {
                // 对于非正则的 replaceAll，我们需要一个全局的正则表达式
                // 转义特殊字符以进行精确匹配
                const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                searchPattern = new RegExp(escapedSearch, 'g');
            }

            switch (operation) {
                case 'length':
                    return { status: ToolExecuteStatus.SUCCESS, data: input.length };

                case 'find':
                    const index = input.search(searchPattern);
                    return { status: ToolExecuteStatus.SUCCESS, data: index };

                case 'findAll': {
                    if (!(searchPattern instanceof RegExp) || !searchPattern.global) {
                        // 确保是全局正则
                        const pattern = searchPattern instanceof RegExp ? searchPattern.source : search;
                        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        searchPattern = new RegExp(escapedPattern, 'g');
                    }
                    const matches = [...input.matchAll(searchPattern as RegExp)];
                    const indices = matches.map(match => match.index);
                    return { status: ToolExecuteStatus.SUCCESS, data: indices };
                }

                case 'replace':
                    const result = input.replace(searchPattern, replacement);
                    return { status: ToolExecuteStatus.SUCCESS, data: result };

                case 'replaceAll':
                    const resultAll = input.replace(searchPattern, replacement);
                    return { status: ToolExecuteStatus.SUCCESS, data: resultAll };

                default:
                    return { status: ToolExecuteStatus.ERROR, error: `未知操作: ${operation}` };
            }
        } catch (error) {
            return { status: ToolExecuteStatus.ERROR, error: `文本工具执行出错: ${error.message}` };
        }
    }
};


// 导出工具列表
export const basicTool = {
    name: 'basic-tools',
    tools: [datetimeTool, textTool],
    rulePrompt: `
一些基础工具
- 如果在回答中涉及到实时性信息，例如用户询问了“最近”“近期”“XX月前”等，请务必调用 datetime 确认当前的时间。
- 如果需要对文本进行查找、替换或获取长度等操作，请使用 text 工具，它支持正则表达式。
`
}
