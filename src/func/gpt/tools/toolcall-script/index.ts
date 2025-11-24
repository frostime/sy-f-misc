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
import { processToolOutput } from "../utils";

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
Target Type:
{
  filename: string;
  CreateYear: string; //Should be yyyy format
  sizeKB: number; // Be a number without 'KB' suffix.
}[];


Input Text:
- A.txt | Create on 2023-01-01 | Size: 15KB
- B.docx | Create on 2022-12-15 | Size: 45KB

=== Output ===
[{ "filename": "A.txt", "CreateYear": "2023", "sizeKB": 15 },{ "filename": "B.docx", "CreateYear": "2022", "sizeKB": 45 }]

`;
        const userPrompt = `Target Type:
${typeDescription}

Input Text:
${text}

Extract the data and format it as JSON matching the Target Type.`;

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
                processToolOutput({
                    toolKey: 'toolcall-script',
                    content: output,
                    toolCallInfo: { name: 'ToolCallScript', args }
                });
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

当需要执行复杂的工具组合调用时，使用 ToolCallScript 工具，编写 JS 脚本在沙箱中运行。
沙箱中不可访问 document, window, eval, Function 等危险对象。

**可用 API**：
- \`await TOOL_CALL(toolName: string, args: object)\`: 调用任意可用工具
- \`await FORMALIZE(text: string, typeDescription: string)\`: 使用 LLM 将非结构化文本转换为结构化数据 (JSON); typeDescription一定要设计好!s
- \`await SLEEP(ms: number)\`: 延迟执行
- \`await PARALLEL(...promises: Promise[])\`: 并行执行多个工具调用
- \`console.log/warn/error\`: 输出信息（作为工具返回值）

**特殊转义字符**：
为了避免 JSON 解析错误，你可以在 script 中使用以下特殊占位符代替特殊字符：
- \`_esc_dquote_\` -> \`"\` (双引号)
- \`_esc_backslash_\` -> \`\\\` (反斜杠)
- 如无必要，尽量使用单引号 ' 替换 双引号 "，以减少转义需求

**示例 特殊字符转义**：
\`\`\`javascript
// 如果你想执行: console.log("Hello\\nWorld");
// 可以编写如下脚本 (不强制，单纯为了降低生成错误字符破坏 tool call json 结构的风险)
console.log(_esc_dquote_Hello World_esc_dquote_);
\`\`\`

**核心 API \`TOOL_CALL\`** : 直接返回工具调用结果，类型视不同工具而定

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

**核心 API \`FORMALIZE\`** : 某些工具返回纯文本而非结构化数据时，可用此 API 转换为结构化数据方便嵌入 JS 使用
本质也是调用 LLM 完成，所以输入的文本量不宜过大，否则可能导致超时或费用过高

**示例 FORMALIZE**:
\`\`\`javascript
const formated = await FORMALIZE(\`
- A.txt | Create on 2023-01-01 | Size: 15KB
- B.docx | Create on 2022-12-15 | Size: 45KB
\`, \`
{
  filename: string;
  CreateYear: string; //Should be yyyy format
  sizeKB: number; // Be a number without 'KB' suffix.
}[];
\`);
>>> Will be like: [{ "filename": "A.txt", "CreateYear": "2023", "sizeKB": 15 },{ "filename": "B.docx", "CreateYear": "2022", "sizeKB": 45 }]
\`\`\`


**注意事项**：
- 脚本中必须使用 \`await\` 来调用 TOOL_CALL
- 有些 Tool 可能会返回非结构数据，使用 FORMALIZE 可将其转换为结构化数据; 不过请你设计好类型定义
    - FORMALIZE 会强制限制最大处理 ${FORMALIZE_MAX_INPUT_LENGTH} 字符，过多会内部强制截断
    - FORMALIZE 本质也是调用 LLM，不要滥用
    - 如果需要对 N 个文本进行 FORMALIZE，建议将他们合并，并要求 FORMALIZE 为特定类型的数组
- 有些 Tool 有 limit 字符，意味着结果会被截断; 如果需要完整结果，可设置 limit 为 -1（如果支持）
    - 如果需要 FORMALIZE，建议在返回类型中设置关于截断 (truncated) 的相关信息，以免误判
    - 例如: { isTruncated: boolean; cacheLocalFile?: string; }
- 复杂调用，建议使用内置转义字符，避免 JSON 解析错误
- 所有 console.log 输出会作为工具结果返回
`.trim()
    });
    return executor;
}
