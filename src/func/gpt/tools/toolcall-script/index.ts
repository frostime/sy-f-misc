/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-22 16:00:00
 * @FilePath     : /src/func/gpt/tools/toolcall-script/index.ts
 * @Description  : 工具调用脚本执行器 - 允许 LLM 通过 JS 脚本编排复杂的工具调用
 * 
 * 为了节省 token，弥补 LLM 在复杂逻辑处理上的不足，我们允许 LLM 编写 JavaScript 代码来调用工具。
 * 允许通过 TOOL_CALL 等特殊 API 调用其他工具，并通过 FORMALIZE 将非结构化文本转换为结构化数据。
 * 最终返回脚本中的 console 输出，方便 LLM 查看执行结果。
 */
import { ToolExecutor } from "../executor";
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { complete } from "../../openai/complete";
import * as store from "@gpt/setting/store";
import { toolCallScriptDocTool } from "./skill-doc";

const FORMALIZE_MAX_INPUT_LENGTH = 32000;

/**
 * 执行脚本的核心函数
 * @param script 要执行的 JavaScript 代码
 * @param executor 工具执行器
 * @param timeoutSeconds 超时时间（秒），默认 180 秒（3 分钟）
 * @returns 脚本执行结果
 */
const executeScript = async (
    script: string,
    executor: ToolExecutor,
    timeoutSeconds: number = 180
): Promise<string> => {
    // TOOL_CALL API - 调用其他工具
    const toolCall = async (toolName: string, args: Record<string, any>) => {
        const tool = executor.getTool(toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found`);
        }

        let toolResult: ToolExecuteResult;
        try {
            // 执行工具（跳过审批以避免重复提示）
            toolResult = await executor.execute(
                toolName,
                args,
                {
                    skipExecutionApproval: true,
                    skipResultApproval: true
                }
            );
        } catch (error) {
            throw new Error(`Tool '${toolName}' execution failed: ${error.message}`);
        }

        // 检查执行结果状态
        if (toolResult.status === ToolExecuteStatus.SUCCESS) {
            // 确保返回的是结构化的原始数据，而非格式化文本 (finalText)
            // finalText 是为 LLM 准备的，可能包含截断提示、system hints 等
            // ToolCallScript 需要原始数据进行进一步处理
            if (toolResult.data === undefined || toolResult.data === null) {
                console.warn(`[ToolCallScript] Tool '${toolName}' returned undefined/null data. This may indicate the tool doesn't properly return structured data.`);
            }
            return toolResult.data;
        } else if (toolResult.status === ToolExecuteStatus.ERROR) {
            throw new Error(`Tool '${toolName}' returned error: ${toolResult.error}`);
        } else if (toolResult.status === ToolExecuteStatus.EXECUTION_REJECTED) {
            throw new Error(`Tool '${toolName}' execution rejected: ${toolResult.rejectReason || 'User rejected'}`);
        } else if (toolResult.status === ToolExecuteStatus.RESULT_REJECTED) {
            throw new Error(`Tool '${toolName}' result rejected: ${toolResult.rejectReason || 'User rejected result'}`);
        } else {
            throw new Error(`Tool '${toolName}' returned unknown status: ${toolResult.status}`);
        }
    };

    // 辅助函数：sleep
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // 辅助函数：并行执行多个工具调用
    const parallel = async (...promises: Promise<any>[]) => {
        return await Promise.all(promises);
    };

    // 辅助函数：FORMALIZE - 使用 LLM 将非结构化文本转换为结构化数据
    const formalize = async (text: string, typeDescription: string) => {
        let len = text.length;
        if (text.length > FORMALIZE_MAX_INPUT_LENGTH) {
            text = text.slice(0, FORMALIZE_MAX_INPUT_LENGTH);
            console.warn(`FORMALIZE: Input text exceeded ${FORMALIZE_MAX_INPUT_LENGTH} characters, truncated from ${len} to ${FORMALIZE_MAX_INPUT_LENGTH}.`);
            text += `\n...\n(注意: 输入文本过长(${len}字符) 已被截断为 ${FORMALIZE_MAX_INPUT_LENGTH} 字符)`;
        }

        const systemPrompt = `You are a precise data extraction tool. Your task is to convert unstructured text into valid JSON based on a TypeScript type definition. Output ONLY the raw JSON string. Do not include markdown code blocks or explanations. Ensure that the output and be directly parsable by JSON.parse.

Example:

=== Input ===
Target Requirement:
请过滤掉文件夹，只返回文件列表，类型定义如下:
{
  filename: string;
  CreateYear: string; //Should be yyyy format
  sizeKB: number; // Be a number without 'KB' suffix.
}[];


Input Text:
- A.txt | Create on 2023-01-01 | Size: 15KB
- B.docx | Create on 2022-12-15 | Size: 45KB
- C/ | Create on 2022-12-15 | Size: -

=== Output ===
[{ "filename": "A.txt", "CreateYear": "2023", "sizeKB": 15 },{ "filename": "B.docx", "CreateYear": "2022", "sizeKB": 45 }]

`;
        const userPrompt = `Target Requirement:
${typeDescription}

Input Text:
${text}

Extract the data and format it as JSON matching the Target Requirement.`;

        const result = await complete(userPrompt, {
            model: store.useModel(store.defaultConfig().utilityModelId || store.defaultModelId()),
            systemPrompt: systemPrompt,
            option: {
                temperature: 0,
                stream: false
            }
        });

        if (result.ok === false) {
            throw new Error(`FORMALIZE failed: ${result.content}`);
        }

        let cleanContent = result.content.trim();
        // Remove markdown code blocks if present
        cleanContent = cleanContent.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

        try {
            return JSON.parse(cleanContent);
        } catch (e) {
            throw new Error(`FORMALIZE produced invalid JSON: ${e.message}`);
        }
    };

    // 辅助函数：创建访问拦截器
    const createBlockedAccessProxy = (name: string) => {
        return new Proxy({}, {
            get: () => {
                throw new Error(`Access to '${name}' is blocked in sandbox for security reasons`);
            },
            set: () => {
                throw new Error(`Access to '${name}' is blocked in sandbox for security reasons`);
            }
        });
    };

    // 创建沙盒环境
    const sandbox = {
        _logging: [] as { type: 'log' | 'error' | 'warn', message: string }[],
        // 劫持 console
        console: {
            log: (...args: any[]) => {
                const message = args.map(arg => {
                    if (typeof arg === 'object') {
                        try {
                            return JSON.stringify(arg, null, 2);
                        } catch {
                            return String(arg);
                        }
                    }
                    return String(arg);
                }).join(' ');
                sandbox._logging.push({ type: 'log', message });
            },
            error: (...args: any[]) => {
                const message = args.map(arg => String(arg)).join(' ');
                sandbox._logging.push({ type: 'error', message });
            },
            warn: (...args: any[]) => {
                const message = args.map(arg => String(arg)).join(' ');
                sandbox._logging.push({ type: 'warn', message });
            }
        },

        // 禁用危险对象 - 使用 Proxy 提供友好的错误提示
        document: createBlockedAccessProxy('document'),
        window: createBlockedAccessProxy('window'),
        eval: createBlockedAccessProxy('eval'),
        Function: createBlockedAccessProxy('Function'),
        importScripts: createBlockedAccessProxy('importScripts'),
        process: createBlockedAccessProxy('process'),
        require: createBlockedAccessProxy('require'),

        // 提供的 API
        TOOL_CALL: toolCall,
        // toolCall: toolCall,
        SLEEP: sleep,
        PARALLEL: parallel,
        FORMALIZE: formalize

    };

    // 使用 AsyncFunction 支持异步操作
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

    // 执行脚本（带超时）
    const executeWithTimeout = () => {
        return new Promise<typeof sandbox>(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Script execution timeout (${timeoutSeconds * 1000}ms)`));
            }, timeoutSeconds * 1000);

            try {
                // 创建异步函数并执行
                const scriptFn = new AsyncFunction('sandbox', `
                    with (sandbox) {
                        ${script}
                    }
                    return sandbox;
                `);

                const result = await scriptFn(sandbox);
                clearTimeout(timeoutId);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    };

    function formatLogging(logging: { type: 'log' | 'error' | 'warn', message: string }[]): string {
        return logging.map(entry => `[${entry.type}] ${entry.message}`).join('\n');
    }

    try {
        const result = await executeWithTimeout();

        // 构建输出
        let output = '';
        if (result._logging.length > 0) {
            output += formatLogging(result._logging);
        }

        output = output || 'Script executed successfully (no output)';
        return output;
    } catch (error) {
        throw new Error(`Script execution failed: ${error.message}`);
    }
};


/**
 * ToolCallScript 工具定义
 * 允许 LLM 编写 JavaScript 代码来编排复杂的工具调用
 */
export const toolCallScriptTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'ToolCallScript',
            description: `Execute JavaScript code with special TOOL_CALL API to orchestrate complex tool combinations.
返回 \`string\`（聚合 console 输出，附 warnings/errors 区块）

Available APIs in script:
- TOOL_CALL(toolName: string, args: object): Call any available tool and get result
- FORMALIZE(text: string, typeDescription: string): Convert unstructured text to JSON using LLM
- SLEEP(ms)
- PARALLEL(...promises)
- console.log/warn/error: Output messages (returned as tool result)`,
            parameters: {
                type: 'object',
                properties: {
                    script: {
                        type: 'string',
                        description: 'JavaScript code to execute. Use async/await for tool calls.'
                    },
                    timeout: {
                        type: 'number',
                        description: 'Timeout in seconds (default: 180). Maximum allowed: 360 (6 minutes)'
                    }
                },
                required: ['script']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireExecutionApproval: true,
        requireResultApproval: true
    },

    // 占位 execute 函数，实际使用 createToolCallScriptTool 创建
    execute: async (): Promise<ToolExecuteResult> => {
        return {
            status: ToolExecuteStatus.ERROR,
            error: 'ToolExecutor not available. Use createToolCallScriptTool() to create this tool.'
        };
    }
};


/**
 * 创建 ToolCallScript 工具的工厂函数
 * 注入 ToolExecutor 依赖
 */
const createToolCallScriptTool = (executor: ToolExecutor): Tool => {
    return {
        ...toolCallScriptTool,
        execute: async (args: {
            script: string;
            timeout?: number;
        }): Promise<ToolExecuteResult> => {
            // 验证参数
            if (!args.script || typeof args.script !== 'string') {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: 'Script parameter is required and must be a string'
                };
            }

            let script = args.script;
            // 处理特殊转义字符，解决 JSON 解析问题
            script = script.replace(/_esc_dquote_/g, '"')
                .replace(/_esc_newline_/g, '\n')
                .replace(/_esc_squote_/g, "'")
                .replace(/_esc_backslash_/g, '\\\\');

            // 限制超时时间（最大 6 分钟）
            const timeoutSeconds = Math.min(args.timeout || 180, 360);

            try {
                const output = await executeScript(script, executor, timeoutSeconds);
                // 直接返回原始 output
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: output
                };
            } catch (error) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: error.message || 'Script execution failed'
                };
            }
        }
    };
};

export const registerToolCallScriptGroup = (executor: ToolExecutor) => {
    const toolCallScriptTool = createToolCallScriptTool(executor);

    // CheckToolDataType 工具：查询工具的返回数据类型
    const checkToolReturnTypeTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'CheckToolReturnType',
                description: '查询指定工具的 TOOL_CALL 返回数据类型。用于在编写脚本前了解工具返回的数据结构。支持批量查询多个工具。',
                parameters: {
                    type: 'object',
                    properties: {
                        toolNames: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '工具名称列表，不填则列出所有已声明返回类型的工具'
                        }
                    }
                }
            },
            permissionLevel: ToolPermissionLevel.PUBLIC
        },

        declaredReturnType: {
            type: 'string',
            note: '工具返回类型信息（单个/批量/列表）'
        },

        execute: async (args: { toolNames?: string[] }): Promise<ToolExecuteResult> => {
            if (args.toolNames && args.toolNames.length > 0) {
                // 批量查询工具
                const results: string[] = [];
                const notFound: string[] = [];
                const noDeclared: string[] = [];

                for (const toolName of args.toolNames) {
                    const tool = executor.getTool(toolName);
                    if (!tool) {
                        notFound.push(toolName);
                        continue;
                    }

                    if (!tool.declaredReturnType) {
                        noDeclared.push(toolName);
                        continue;
                    }

                    const typeInfo = `- **${toolName}**: \`${tool.declaredReturnType.type}\`${tool.declaredReturnType.note ? `\n  ${tool.declaredReturnType.note}` : ''}`;
                    results.push(typeInfo);
                }

                // 构建输出
                const parts: string[] = [];
                if (results.length > 0) {
                    parts.push(`## 工具返回类型\n\n${results.join('\n')}`);
                }
                if (noDeclared.length > 0) {
                    parts.push(`## 未声明返回类型\n以下工具未声明 declaredReturnType，建议用 console.log() 探索：\n${noDeclared.map(n => `- ${n}`).join('\n')}`);
                }
                if (notFound.length > 0) {
                    parts.push(`## 未找到的工具\n${notFound.map(n => `- ${n}`).join('\n')}`);
                }

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: parts.join('\n\n')
                };
            }

            // 列出所有已声明返回类型的工具
            const toolsWithType: string[] = [];
            for (const groupName of Object.keys(executor.groupRegistry)) {
                const group = executor.groupRegistry[groupName];
                for (const tool of group.tools) {
                    if (tool.declaredReturnType) {
                        const name = tool.definition.function.name;
                        const type = tool.declaredReturnType.type;
                        const note = tool.declaredReturnType.note;
                        toolsWithType.push(`- ${name}: \`${type}\`${note ? ` (${note})` : ''}`);
                    }
                }
            }

            if (toolsWithType.length === 0) {
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: '没有工具声明了返回类型。'
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `已声明返回类型的工具:\n\n${toolsWithType.join('\n')}`
            };
        }
    };

    executor.registerToolGroup({
        name: 'Tool Orchestration',
        tools: [toolCallScriptTool, checkToolReturnTypeTool, toolCallScriptDocTool],
        rulePrompt: `
## ToolCallScript - 工具编排脚本 ##

在沙箱中执行 JS 脚本编排复杂的多工具调用（禁用 document/window/eval 等）。

**可用 API**:
- \`await TOOL_CALL(toolName, args)\`: 调用工具，返回原始 data（非格式化文本）
- \`await FORMALIZE(text, typeDescription)\`: LLM 将文本转为 JSON（设计好类型定义！）
- \`await SLEEP(ms)\` / \`await PARALLEL(...promises)\`
- \`console.log/warn/error\`: 输出作为返回值

**转义字符**（避免 JSON 解析错误）:
\`_esc_dquote_\` → \`"\` | \`_esc_backslash_\` → \`\\\` | 优先用单引号 '

### 关键规则 ###
- 必须用 \`await\` 调用异步 API
- **TOOL_CALL 返回原始 data 对象**，与工具 description 中描述的返回类型一致
  - 注意：直接调用工具时 LLM 看到的是格式化后的文本，但脚本中拿到的是结构化数据
  - 不确定数据结构时，调用 **CheckToolReturnType** 查询，或用 \`console.log(result)\` 探索
  - 详情查看 \`data-format-reference\` 技能文档
- FORMALIZE 最大处理 ${FORMALIZE_MAX_INPUT_LENGTH} 字符，本质是 LLM 调用，勿滥用
- 合并多个 FORMALIZE 请求为数组类型，减少调用次数
- 部分工具有 limit 参数，脚本中通常需要完整数据，建议设为 -1

## CheckToolReturnType - 工具返回类型查询 ##

调用 **CheckToolReturnType** 查询工具的返回数据类型，了解数据结构后再编写脚本。

## ToolCallScriptDoc - 技能文档索引 ##

调用 **ToolCallScriptDoc** 获取详细文档。**首次编写脚本建议先查 best-practices！**

| 主题 | 内容摘要 | 何时查询 |
|------|----------|----------|
| \`best-practices\` | await 使用、错误处理、JSON 转义、FORMALIZE 技巧 | 首次编写脚本、遇到问题时 |
| \`data-format-reference\` | TOOL_CALL 返回数据说明与示例 | 理解 TOOL_CALL 返回的结构化数据 |
| \`example-basic\` | 基础示例：读取文件、简单处理、输出结果 | 学习基本用法 |
| \`example-formalize\` | FORMALIZE 示例：从文本提取结构化数据 | 需要解析非结构化文本 |
| \`example-parallel\` | PARALLEL 示例：并行搜索、合并结果 | 需要并发执行多个工具 |
| \`example-complex\` | 复杂编排：搜索→获取→提取的完整流程 | 编写多步骤复杂脚本 |
`.trim()
    });
    return executor;
}
