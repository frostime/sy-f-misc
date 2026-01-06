/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-01-05 15:29:32
 * @Description  :
 * @FilePath     : /src/func/gpt/tools/vars/index.ts
 * @LastEditTime : 2026-01-06 14:44:57
 */

import { openIframeDialog } from "@/func/html-pages/core";
import { type ToolExecutor } from "../executor";
import { Tool, ToolGroup, ToolPermissionLevel, ToolExecuteStatus } from "../types";
import { VariableSystem } from "./core";
import { createVarsManagerSdk } from "./manager";

/**
 * 包含如下工具
 *
 * - ListVars: 元信息 + value 的字符数
 * - ReadVars: 读取变量值, chunk 参数 { index: number; chars: number }
 */
const createToolGroup = (varSystem: VariableSystem): ToolGroup => {
    const listVars: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'ListVars',
                description: 'List all available variables that store truncated tool outputs or other large content.',
                parameters: {
                    type: 'object',
                    properties: {
                        page: {
                            type: 'number',
                            description: 'Optional. Page number to return (1-based). Default is 1.'
                        },
                        pageSize: {
                            type: 'number',
                            description: 'Optional. Number of items per page. Default is 25.'
                        }
                    },
                    required: []
                }
            }
        },
        permission: {
            permissionLevel: ToolPermissionLevel.PUBLIC,
            requireExecutionApproval: false
        },
        execute: async (args) => {
            const { page = 1, pageSize = 25 } = args || {};
            const all = varSystem.listVariables().map(v => ({
                name: v.name,
                type: v.type,
                length: v.value.length,
                desc: v.desc,
                created: v.created.toISOString(),
                keep: v.keep || false
            }));

            const total = all.length;
            const ps = Math.max(1, Math.floor(pageSize));
            const p = Math.max(1, Math.floor(page));
            const totalPage = Math.max(1, Math.ceil(total / ps));
            const start = (p - 1) * ps;
            const items = all.slice(start, start + ps);

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    items,
                    page: p,
                    pageSize: ps,
                    total,
                    totalPage
                }
            };
        },
        formatForLLM(data: any, _args) {
            const items = Array.isArray(data) ? data : (data && data.items) || [];
            const page = data && !Array.isArray(data) ? data.page : undefined;
            const totalPage = data && !Array.isArray(data) ? data.totalPage : undefined;
            const total = data && !Array.isArray(data) ? data.total : undefined;

            let out = `Available Variables:\n` + items.map((v: any) =>
                `- ${v.name}\n` +
                `  - Type: ${v.type}; Len: ${v.length}\n` +
                `  - Desc: ${v.desc || 'N/A'}`
            ).join('\n');

            if (page !== undefined && totalPage !== undefined) {
                out += `\n\nPage ${page}/${totalPage} (total: ${total}).`;
                if (page < totalPage) {
                    out += ` To fetch the next page call ListVars with {"page": ${page + 1}, "pageSize": ${data.pageSize}}.`;
                }
            }

            return out;
        },
    };

    const listVarsByType: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'ListVarsByType',
                description: 'List variables filtered by type (RULE/ToolCallCache/MessageCache/LLMAdd).',
                parameters: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['RULE', 'ToolCallResult', 'ToolCallArgs'],
                            description: 'Filter variables by type.'
                        },
                        page: {
                            type: 'number',
                            description: 'Optional. Page number to return (1-based). Default is 1.'
                        },
                        pageSize: {
                            type: 'number',
                            description: 'Optional. Number of items per page. Default is 25.'
                        }
                    },
                    required: ['type']
                }
            }
        },
        permission: {
            permissionLevel: ToolPermissionLevel.PUBLIC,
            requireExecutionApproval: false
        },
        execute: async (args) => {
            const { type, page = 1, pageSize = 25 } = args;
            const filtered = varSystem.searchVariables(v => v.type === type);
            const all = filtered.map(v => ({
                name: v.name,
                type: v.type,
                length: v.value.length,
                desc: v.desc,
                created: v.created.toISOString()
            }));

            const total = all.length;
            const ps = Math.max(1, Math.floor(pageSize));
            const p = Math.max(1, Math.floor(page));
            const totalPage = Math.max(1, Math.ceil(total / ps));
            const start = (p - 1) * ps;
            const items = all.slice(start, start + ps);

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    items,
                    page: p,
                    pageSize: ps,
                    total,
                    totalPage
                }
            };
        },
        formatForLLM(data: any, args) {
            const items = Array.isArray(data) ? data : (data && data.items) || [];
            const page = data && !Array.isArray(data) ? data.page : undefined;
            const totalPage = data && !Array.isArray(data) ? data.totalPage : undefined;
            const total = data && !Array.isArray(data) ? data.total : undefined;

            if (items.length === 0) {
                return `No variables found with type '${args.type}'.`;
            }

            let out = `Variables with type '${args.type}':\n` +
                items.map((v: any) => `- ${v.name} (${v.length} chars): ${v.desc || 'N/A'}`).join('\n');

            if (page !== undefined && totalPage !== undefined) {
                out += `\n\nPage ${page}/${totalPage} (total: ${total}).`;
                if (page < totalPage) {
                    out += ` To fetch the next page call ListVarsByType with {"type": "${args.type}", "page": ${page + 1}, "pageSize": ${data.pageSize}}.`;
                }
            }

            return out;
        }
    };

    const readVar: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'ReadVar',
                description: 'Read the content of a variable. You can read it in chunks using start and length.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'The name of the variable to read.'
                        },
                        start: {
                            type: 'number',
                            description: 'The starting index (0-based) to read from. Default is 0.'
                        },
                        length: {
                            type: 'number',
                            description: 'The number of characters to read. Default is all remaining characters.'
                        }
                    },
                    required: ['name']
                }
            }
        },
        permission: {
            permissionLevel: ToolPermissionLevel.PUBLIC,
            requireExecutionApproval: false
        },
        execute: async (args) => {
            const { name, start = 0, length } = args;
            const variable = varSystem.getVariable(name);
            if (!variable) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `Variable '${name}' not found.`
                };
            }

            let content = variable.value;
            if (start !== undefined || length !== undefined) {
                const s = start || 0;
                const e = length ? s + length : undefined;
                content = content.slice(s, e);
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: content
            };
        }
    };

    const writeVar: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'WriteVar',
                description: 'Write or update the content of a variable.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'The name of the variable to write.'
                        },
                        value: {
                            type: 'string',
                            description: 'The content to store in the variable.'
                        },
                        desc: {
                            type: 'string',
                            description: 'An optional description for the variable.'
                        }
                    },
                    required: ['name', 'value']
                }
            }
        },
        permission: {
            permissionLevel: ToolPermissionLevel.PUBLIC,
            requireExecutionApproval: false
        },
        execute: async (args) => {
            const { name, value, desc } = args;
            varSystem.addVariable(name, value, 'LLMAdd', desc);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `Variable '${name}' written/updated successfully.`
            };
        }
    }

    const clearVars: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'ClearVars',
                description: 'Clear variables by type or all non-keep variables.',
                parameters: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['RULE', 'ToolCallCache', 'MessageCache', 'LLMAdd', 'ALL'],
                            description: 'Type of variables to clear. Use ALL to clear all non-keep variables.'
                        }
                    },
                    required: ['type']
                }
            }
        },
        permission: {
            permissionLevel: ToolPermissionLevel.PUBLIC,
            requireExecutionApproval: false
        },
        execute: async (args) => {
            const { type } = args;
            let removed = 0;

            if (type === 'ALL') {
                const beforeCount = varSystem.varQueue.length;
                varSystem.varQueue = varSystem.varQueue.filter(v => v.keep);
                removed = beforeCount - varSystem.varQueue.length;
            } else {
                const toRemove = varSystem.searchVariables(v => v.type === type && !v.keep);
                toRemove.forEach(v => varSystem.removeVariable(v.name));
                removed = toRemove.length;
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `Cleared ${removed} variable(s).`
            };
        }
    };

    return {
        name: 'vars',
        tools: [listVars, listVarsByType, readVar, writeVar],
        rulePrompt: `
You can use 'ListVars' to see available variables and 'ReadVar' to read their content.
Both 'ListVars' and 'ListVarsByType' accept optional parameters 'page' and 'pageSize' for pagination (defaults: page=1, pageSize=25).
When a tool output is truncated, the full content is often saved to a variable.
Use 'ReadVar' with 'start' and 'length' to read large content in chunks if necessary.
You can also use 'WriteVar' to create or update variables as needed.
Use 'ListVarsByType' to filter variables by type.

If there are more pages, the tool response will indicate "Page {page}/{totalPage}" and you can fetch the next page by calling the same tool with {"page": <next>, "pageSize": <same>}.
If necessary, use this tool group as a simple memory system.
`
    };
}

export const createValSystemTools = () => {
    const varSystem = new VariableSystem(1000);
    const toolGroup = createToolGroup(varSystem);

    return  {
        varSystem,
        toolGroup
    }
}

export function openVarsManager(toolExecutor: ToolExecutor) {
    const customSdk = createVarsManagerSdk(toolExecutor.varSystem);

    openIframeDialog({
        title: 'Variables Manager',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/vars-manager.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk
            }
        },
        width: '1300px',
        height: '800px',
        maxWidth: '80%'
    });
}
