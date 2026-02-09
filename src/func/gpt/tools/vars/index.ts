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
import { Tool, ToolGroup, ToolExecuteStatus } from "../types";
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
                description: 'List variables with optional filters (type, search pattern, tags).',
                parameters: {
                    type: 'object',
                    properties: {
                        filter: {
                            type: 'object',
                            description: 'Optional filters for variables.',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['RULE', 'ToolCallResult', 'ToolCallArgs', 'MessageCache', 'LLMAdd', 'USER_ADD'],
                                    description: 'Filter by variable type.'
                                },
                                search: {
                                    type: 'string',
                                    description: 'Search pattern to match variable name or description.'
                                },
                                tag: {
                                    type: 'string',
                                    description: 'Filter by tag (matches if variable has this tag).'
                                }
                            }
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
                    required: []
                }
            }
        },
        permission: {
            executionPolicy: 'auto'
        },
        execute: async (args) => {
            const { filter, page = 1, pageSize = 25 } = args || {};

            // 应用过滤器
            let filtered = varSystem.listVariables();

            if (filter) {
                if (filter.type) {
                    filtered = filtered.filter(v => v.type === filter.type);
                }
                if (filter.search) {
                    const pattern = filter.search.toLowerCase();
                    filtered = filtered.filter(v =>
                        v.name.toLowerCase().includes(pattern) ||
                        (v.desc && v.desc.toLowerCase().includes(pattern))
                    );
                }
                if (filter.tag) {
                    filtered = filtered.filter(v => v.tags && v.tags.includes(filter.tag));
                }
            }

            const all = filtered.map(v => ({
                name: v.name,
                type: v.type,
                length: v.value.length,
                desc: v.desc,
                tags: v.tags || [],
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
                    totalPage,
                    filter
                }
            };
        },
        formatForLLM(data: any, _args) {
            const items = Array.isArray(data) ? data : (data && data.items) || [];
            const page = data && !Array.isArray(data) ? data.page : undefined;
            const totalPage = data && !Array.isArray(data) ? data.totalPage : undefined;
            const total = data && !Array.isArray(data) ? data.total : undefined;
            const filter = data && !Array.isArray(data) ? data.filter : undefined;

            let header = 'Available Variables';
            if (filter) {
                const filters = [];
                if (filter.type) filters.push(`type=${filter.type}`);
                if (filter.search) filters.push(`search="${filter.search}"`);
                if (filter.tag) filters.push(`tag="${filter.tag}"`);
                if (filters.length > 0) {
                    header += ` (filtered: ${filters.join(', ')})`;
                }
            }

            let out = `${header}:\n` + items.map((v: any) =>
                `- ${v.name}\n` +
                `  - Type: ${v.type}; Len: ${v.length}\n` +
                `  - Desc: ${v.desc || 'N/A'}` +
                (v.tags && v.tags.length > 0 ? `\n  - Tags: [${v.tags.join(', ')}]` : '')
            ).join('\n');

            if (page !== undefined && totalPage !== undefined) {
                out += `\n\nPage ${page}/${totalPage} (total: ${total}).`;
                if (page < totalPage) {
                    const nextPageArgs = JSON.stringify({ filter, page: page + 1, pageSize: data.pageSize });
                    out += ` To fetch the next page call ListVars with ${nextPageArgs}.`;
                }
            }

            return out;
        },
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
            executionPolicy: 'auto'
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
                description: 'Write or update a variable. Can update value, desc, and tags.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'The name of the variable to write or update.'
                        },
                        value: {
                            type: 'string',
                            description: 'The content to store (required for new variables, optional for updates).'
                        },
                        desc: {
                            type: 'string',
                            description: 'Optional description for the variable.'
                        },
                        tags: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Optional tags for categorizing the variable.'
                        }
                    },
                    required: ['name']
                }
            }
        },
        permission: {
            executionPolicy: 'auto'
        },
        execute: async (args) => {
            const { name, value, desc, tags } = args;

            const existing = varSystem.getVariable(name, false);

            if (existing) {
                // 更新现有变量
                varSystem.updateVariable(name, { value, desc, tags });
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: `Variable '${name}' updated successfully.`
                };
            } else {
                // 创建新变量（需要 value）
                if (!value) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `Cannot create new variable '${name}' without a value.`
                    };
                }
                varSystem.addVariable(name, value, 'LLMAdd', desc, tags);
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: `Variable '${name}' created successfully.`
                };
            }
        }
    }

    const removeVars: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'RemoveVars',
                description: 'Remove multiple variables by their names. Cannot remove RULE type variables.',
                parameters: {
                    type: 'object',
                    properties: {
                        names: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Array of variable names to remove.'
                        }
                    },
                    required: ['names']
                }
            }
        },
        permission: {
            executionPolicy: 'auto'
        },
        execute: async (args) => {
            const { names } = args;
            const result = varSystem.removeVariables(names);

            let message = `Removed ${result.removed.length} variable(s).`;
            if (result.failed.length > 0) {
                message += ` Failed to remove ${result.failed.length} variable(s): ${result.failed.join(', ')}.`;
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: { ...result, message }
            };
        },
        formatForLLM(data: any) {
            return data.message || JSON.stringify(data);
        }
    };

    return {
        name: 'vars',
        tools: [listVars, readVar, writeVar, removeVars],
        rulePrompt: `
You can use 'ListVars' to see available variables and 'ReadVar' to read their content.
'ListVars' supports filtering by type, search pattern (name/desc), or tag, and pagination (defaults: page=1, pageSize=25).
When a tool output is truncated, the full content is often saved to a variable.
Use 'ReadVar' with 'start' and 'length' to read large content in chunks if necessary.
You can use 'WriteVar' to create or update variables (including value, desc, tags).
Use 'RemoveVars' to delete variables by names (cannot delete RULE type variables).

If there are more pages, the tool response will indicate "Page {page}/{totalPage}" and you can fetch the next page.
If necessary, use this tool group as a simple memory system with tagging support.
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
