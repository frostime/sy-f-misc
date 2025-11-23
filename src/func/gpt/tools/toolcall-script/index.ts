/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-22 16:00:00
 * @FilePath     : /src/func/gpt/tools/toolcall-script/index.ts
 * @Description  : 工具调用脚本执行器 - 允许 LLM 通过 JS 脚本编排复杂的工具调用
 */
import { ToolExecutor } from "../executor";
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { complete } from "../../openai/complete";


/**
 * 执行脚本的核心函数
 * @param script 要执行的 JavaScript 代码
 * @param executor 工具执行器
 * @param timeoutMs 超时时间（毫秒），默认 60 秒
 * @returns 脚本执行结果
 */
const executeScript = async (
    script: string,
    executor: ToolExecutor,
    timeoutMs: number = 60000
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
        const systemPrompt = "You are a precise data extraction tool. Your task is to convert unstructured text into valid JSON based on a TypeScript type definition. Output ONLY the raw JSON string. Do not include markdown code blocks or explanations. Ensure that the output and be directly parsable by JSON.parse.";
        const userPrompt = `Target Type:
${typeDescription}

Input Text:
${text}

Extract the data and format it as JSON matching the Target Type.`;

        const result = await complete(userPrompt, {
            systemPrompt: systemPrompt,
            option: {
                temperature: 0
            }
        });

        if (!result.ok) {
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

    // 创建沙盒环境
    const sandbox = {
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
                sandbox._output.push(message);
            },
            error: (...args: any[]) => {
                const message = args.map(arg => String(arg)).join(' ');
                sandbox._errors.push(message);
            },
            warn: (...args: any[]) => {
                const message = args.map(arg => String(arg)).join(' ');
                sandbox._warnings.push(message);
            }
        },

        // 内部状态（不暴露给用户脚本）
        _output: [] as string[],
        _errors: [] as string[],
        _warnings: [] as string[],

        // 禁用危险对象
        document: undefined,
        window: undefined,
        eval: undefined,
        Function: undefined,

        // 提供的 API
        TOOL_CALL: toolCall,
        toolCall: toolCall,
        sleep: sleep,
        parallel: parallel,
        FORMALIZE: formalize,

        // 常用全局对象（受限版本）
        JSON: JSON,
        Math: Math,
        Date: Date,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean,
        Promise: Promise
    };

    // 使用 AsyncFunction 支持异步操作
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

    // 执行脚本（带超时）
    const executeWithTimeout = () => {
        return new Promise<typeof sandbox>(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Script execution timeout (${timeoutMs}ms)`));
            }, timeoutMs);

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

    try {
        const result = await executeWithTimeout();

        // 构建输出
        let output = '';
        if (result._output.length > 0) {
            output += result._output.join('\n');
        }
        if (result._warnings.length > 0) {
            output += (output ? '\n\n' : '') + '[Warnings]\n' + result._warnings.join('\n');
        }
        if (result._errors.length > 0) {
            output += (output ? '\n\n' : '') + '[Errors]\n' + result._errors.join('\n');
        }

        return output || 'Script executed successfully (no output)';
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
- TOOL_CALL(toolName, args): Call any available tool and get result
- FORMALIZE(text, typeDescription): Convert unstructured text to JSON using LLM
- sleep(ms)
- parallel(...promises)
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
                        description: 'Timeout in milliseconds (default: 60000). Maximum allowed: 300000 (5 minutes)'
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

            // 限制超时时间（最大 5 分钟）
            const timeoutMs = Math.min(args.timeout || 60000, 300000);

            try {
                const output = await executeScript(script, executor, timeoutMs);
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
    executor.registerToolGroup({
        name: 'Tool Orchestration',
        tools: [toolCallScriptTool],
        rulePrompt: `
### ToolCallScript - 工具编排脚本

当需要执行复杂的工具组合调用时（如批量操作、条件调用、循环处理），使用 ToolCallScript 工具，编写 JS 脚本在沙箱中运行。

**可用 API**：
- \`await TOOL_CALL(toolName, args)\`: 调用任意可用工具
- \`await FORMALIZE(text, typeDescription)\`: 使用 LLM 将非结构化文本转换为结构化数据 (JSON); typeDescription一定要设计好!s
- \`await sleep(ms)\`: 延迟执行
- \`await parallel(...promises)\`: 并行执行多个工具调用
- \`console.log/warn/error\`: 输出信息（作为工具返回值）

**特殊转义字符**：
为了避免 JSON 解析错误，你可以在 script 中使用以下特殊占位符代替特殊字符：
- \`_esc_dquote_\` -> \`"\` (双引号)
- \`_esc_backslash_\` -> \`\\\` (反斜杠)

**示例 特殊字符转义**：
\`\`\`javascript
// 如果你想执行: console.log("Hello\\nWorld");
// 可以编写如下脚本 (不强制，单纯为了降低生成错误字符破坏 tool call json 结构的风险)
console.log(_esc_dquote_Hello World_esc_dquote_);
\`\`\`

**核心 API \`TOOL_CALL\`** : 直接返回工具调用结果，类型视不同工具而定

**示例 FORMALIZE**:
\`\`\`javascript
const searchResult = await TOOL_CALL('BingSearch', { query: 'latest news' });
// 将搜索结果转换为结构化数组
const items = await FORMALIZE(searchResult, 'type Result = { title: string; url: string; summary: string }[];');
for (const item of items) {
    console.log(item.title);
}
\`\`\`

**示例 检索网页**:
\`\`\`javascript
// 检索多个网页内容
const urls = ['https://example.com/page1', 'https://example.com/page2'];
const KEYWORD = 'KEYWORD';

for (const url of urls) {
    const pageContent = await TOOL_CALL('WebPageContent', { url: url, mode: 'markdown', limit: -1 });
    if (pageContent.includes(KEYWORD)) {
        console.log(\`Keyword found in \${url}\`);
    } else {
        console.log(\`Keyword not found in \${url}\`);
    }
}

\`\`\`


**注意事项**：
- 脚本中必须使用 \`await\` 来调用 TOOL_CALL
- 有些 Tool 有 limit 字符，意味着结果会被截断; 如果需要完整结果，请务必设置 limit 为 -1!
- 有些 Tool 可能会返回非结构数据，使用 FORMALIZE 可将其转换为结构化数据; 不过请你设计好类型定义
- 工具调用失败会抛出异常，可使用 try-catch 处理
- 所有 console.log 输出会作为工具结果返回
`.trim()
    });
    return executor;
}
