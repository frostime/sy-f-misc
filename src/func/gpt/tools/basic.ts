/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-30 15:10:56
 * @FilePath     : /src/func/gpt/tools/basic.ts
 * @LastEditTime : 2026-01-06 17:07:04
 * @Description  :
 */
// import { importJavascriptFile } from '@frostime/siyuan-plugin-kits';
import {
    Tool,
    ToolPermissionLevel,
    ToolExecuteStatus,
    ToolExecuteResult
} from './types';

import { importModule } from '@/libs/dynamic-loading';

/**
 * 日期时间工具
 */
const datetimeTool: Tool = {
    declaredReturnType: {
        type: 'string',
        note: 'ISO 字符串或指定格式的日期时间'
    },

    SKIP_CACHE_RESULT: true,
    SKIP_EXTERNAL_TRUNCATE: true,

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
        // OLD @deprecated
        // permissionLevel: ToolPermissionLevel.PUBLIC
    },

    permission: {
        // permissionLevel: ToolPermissionLevel.PUBLIC
        executionPolicy: 'auto'
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
    declaredReturnType: {
        type: 'number | number[] | string',
        note: 'length→number, find→number, findAll→number[], replace/replaceAll→string'
    },

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
        // permissionLevel: ToolPermissionLevel.PUBLIC
    },
    permission: {
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

const jsonInterfaceTool: Tool = {
    declaredReturnType: {
        type: 'string',
        note: 'TypeScript 接口定义字符串'
    },

    SKIP_EXTERNAL_TRUNCATE: true,

    definition: {
        type: 'function',
        function: {
            name: 'json2interface',
            description: '将 JSON 对象转换为 TypeScript 接口定义。支持嵌套对象、数组、可选字段等，自动生成类型定义。',
            parameters: {
                type: 'object',
                properties: {
                    json: {
                        type: 'string',
                        description: '要转换的 JSON 字符串'
                    },
                    interfaceName: {
                        type: 'string',
                        description: '生成的根接口名称，默认为 "Root"'
                    }
                },
                required: ['json']
            }
        },
        // permissionLevel: ToolPermissionLevel.PUBLIC
    },
    permission: {
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: {
        json: string;
        interfaceName?: string;
    }): Promise<ToolExecuteResult> => {
        const { json, interfaceName = 'Root' } = args;

        try {
            // 解析 JSON
            let jsonObj: any;
            try {
                jsonObj = JSON.parse(json);
            } catch (parseError) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `JSON 解析失败: ${parseError.message}`
                };
            }

            //@ts-ignore
            const moduleResult = await importModule('scripts/json2type.js', 'plugin');
            if (!moduleResult.ok) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `无法加载 json2type 模块: ${moduleResult.error}`
                };
            }
            const module = moduleResult.data as { convertJsonToTs: (obj: any, rootName: string) => string } ;

            if (!module || !module.convertJsonToTs) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: '无法加载 json2type 模块或找不到 convertJsonToTs 函数'
                };
            }

            // 转换 JSON 为 TypeScript 接口
            const tsInterface = module.convertJsonToTs(jsonObj, interfaceName);

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: tsInterface
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `JSON 转换失败: ${error.message}`
            };
        }
    }
}

// 导出工具列表
export const basicTool = {
    name: 'basic-tools',
    tools: [datetimeTool, textTool, jsonInterfaceTool],
    rulePrompt: `
## 基础工具组 ##

- **datetime**: 涉及时效性信息（"最近"、"近期"、"XX月前"等）时，必须先调用确认当前时间
- **text**: 文本查找、替换、长度计算，支持正则表达式
- **json2interface**: 将 JSON 对象转换为 TypeScript 接口定义，自动处理嵌套对象、数组和可选字段
`.trim()
}
