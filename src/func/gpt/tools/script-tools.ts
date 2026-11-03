// src/func/gpt/tools/script-tools.ts
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolGroup } from "./types";
import { DEFAULT_LIMIT_CHAR, normalizeLimit, truncateMiddle } from './utils';
import {
    execScript,
    execPython,
    getPlatform,
    getScriptName,
    ExecResult
} from "@/libs/system-utils";

const path: typeof import('path') = window?.require?.('path');

/**
 * Format execution result as output string
 */
const formatOutput = (result: ExecResult): string => {
    return `[stdout]\n${result.stdout}\n\n[stderr]\n${result.stderr}`;
};

/**
 * 脚本输出保留首尾：结尾是 stderr 与最终结果，只留开头会先丢掉最需要的信息。
 */
const scriptTruncateForLLM = (formatted: string, args: Record<string, any>): string =>
    truncateMiddle(formatted, normalizeLimit(args.limit)).content;

const LIMIT_PARAM_DESCRIPTION =
    `限制返回的最大字符数，默认为 ${DEFAULT_LIMIT_CHAR}，传入 <= 0 表示不限制；超出时保留首尾，省略中间`;

/**
 * Shell command execution tool
 */
const shellTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'Shell',
            description: `在 ${getPlatform()} 运行 ${getScriptName()} 指令/脚本，返回 string（[stdout] 与 [stderr] 两部分）`,
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: '要执行的命令'
                    },
                    directory: {
                        type: 'string',
                        description: '执行命令的目录，默认为当前工作目录'
                    },
                    injectVar: {
                        type: 'object',
                        description: `注入变量到 ${getScriptName()} 环境中，变量被设置为环境变量：PowerShell 用 $env:VAR_NAME 访问，Bash 用 $VAR_NAME 访问。只支持可 JSON 序列化的基本类型（string/number/boolean），值会转为字符串`
                    },
                    limit: {
                        type: 'number',
                        description: LIMIT_PARAM_DESCRIPTION
                    }
                },
                required: ['command']
            }
        }
    },

    permission: {
        executionPolicy: 'auto',
        resultApprovalPolicy: 'always'
    },

    truncateForLLM: scriptTruncateForLLM,

    execute: async (args: { command: string; directory?: string; injectVar?: Record<string, string | number | boolean>; limit?: number }): Promise<ToolExecuteResult> => {
        try {
            const cwd = args.directory ? path.resolve(args.directory) : process.cwd();

            // 准备环境变量
            const env = { ...process.env };
            if (args.injectVar) {
                for (const [key, value] of Object.entries(args.injectVar)) {
                    // 环境变量必须是字符串
                    env[key] = String(value);
                }
            }

            const result = await execScript(args.command, { cwd, env });

            const output = formatOutput(result);

            if (!result.success) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `Shell execution error: ${result.error}\n${output}`
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: output
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Shell execution error: ${error.message}`
            };
        }
    }
};

/**
 * Python script execution tool
 */
const pythonTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'Python',
            description: '在本地运行 Python 代码（默认假设本地已安装 Python），返回 stdout 与 stderr。脚本默认写入临时目录，keepFile=true 时保留',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: '要执行的 Python 代码'
                    },
                    directory: {
                        type: 'string',
                        description: '脚本文件保存位置，默认为自动配置的临时目录'
                    },
                    injectVar: {
                        type: 'object',
                        description: '注入变量到 Python 环境。变量会被解析为 Python 对象，并在代码开头自动声明，可直接按变量名使用'
                    },
                    keepFile: {
                        type: 'boolean',
                        description: '运行完毕后是否保留 Python 脚本文件，默认为 false'
                    },
                    limit: {
                        type: 'number',
                        description: LIMIT_PARAM_DESCRIPTION
                    }
                },
                required: ['code']
            }
        }
    },

    permission: {
        executionPolicy: 'auto',
        resultApprovalPolicy: 'always'
    },

    truncateForLLM: scriptTruncateForLLM,

    execute: async (args: { code: string; directory?: string; injectVar?: Record<string, string | number | boolean>; keepFile?: boolean; limit?: number }): Promise<ToolExecuteResult> => {
        try {
            const cwd = args.directory ? path.resolve(args.directory) : undefined;

            // 准备代码：在开头插入变量声明
            let finalCode = args.code;
            if (args.injectVar && Object.keys(args.injectVar).length > 0) {
                const varDeclarations = Object.entries(args.injectVar)
                    .map(([key, value]) => {
                        const jsonValue = JSON.stringify(value);
                        // 先转义反斜杠，再转义单引号，确保 Python 字符串字面量解析正确
                        // 1. .replace(/\\/g, '\\\\') : 将 JSON 中的 \ 变成 \\ (Python 字符串层级需要转义)
                        // 2. .replace(/'/g, "\\'")   : 将 JSON 中的 ' 变成 \' (防止截断 Python 字符串)
                        const escapedJson = jsonValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        return `${key} = json.loads('${escapedJson}')`;
                    })
                    .join('\n');
                finalCode = `# Injected variables\nimport json\n${varDeclarations}\n\n# User code\n${args.code}`;
            }

            const result = await execPython(finalCode, {
                cwd,
                keepFile: args.keepFile
            });

            const output = formatOutput(result);

            if (!result.success) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `Python execution error: ${result.error}\n${output}`
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: output
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Python execution error: ${error.message}`
            };
        }
    }
};

/**
 * JavaScript code execution tool
 */
const javascriptTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'JavaScript',
            description: '在思源内 iframe 沙盒中运行 JavaScript 代码（代码被封装为 async 函数执行）。返回 console 输出与显式 return 的值；可使用 fetch 访问思源内核 API；禁止打印或返回无法序列化的对象',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: '要执行的 JavaScript 代码'
                    },
                    injectVar: {
                        type: 'object',
                        description: '注入变量到 JavaScript 环境。变量会被解析为 JS 对象，并在代码开头通过 const 声明，可直接按变量名使用'
                    },
                    limit: {
                        type: 'number',
                        description: LIMIT_PARAM_DESCRIPTION
                    }
                },
                required: ['code']
            }
        }
    },

    permission: {
        executionPolicy: 'auto',
        resultApprovalPolicy: 'always'
    },

    truncateForLLM: scriptTruncateForLLM,

    execute: async (args: { code: string; injectVar?: Record<string, string | number | boolean> }): Promise<ToolExecuteResult> => {
        let sandboxInstance = null;

        try {
            const JavaScriptSandBoxModule = await import("@external/sandbox");
            const JavaScriptSandBox = JavaScriptSandBoxModule.JavaScriptSandBox;

            sandboxInstance = new JavaScriptSandBox();
            await sandboxInstance.init();

            // 准备代码：在开头插入变量声明
            let finalCode = args.code;
            if (args.injectVar && Object.keys(args.injectVar).length > 0) {
                const varDeclarations = Object.entries(args.injectVar)
                    .map(([key, value]) => {
                        // 直接使用 JSON.stringify 的结果作为 JS 源码赋值
                        // 原生支持 string/number/boolean/object
                        return `const ${key} = ${JSON.stringify(value)};`;
                    })
                    .join('\n');
                finalCode = `// Injected variables\n${varDeclarations}\n\n// User code\n${args.code}`;
            }

            const result = await sandboxInstance.run(finalCode);

            if (result.ok !== true) {
                sandboxInstance?.destroy();
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: result.stderr || 'Execution failed'
                };
            }

            let output = '';
            if (result.stdout) output += result.stdout;
            if (result.returned !== undefined && result.returned !== null) {
                output += (output ? '\n\n' : '') + `返回值: ${result.returned}`;
            }
            if (result.stderr) {
                output += '\n\nErrors:\n' + result.stderr;
            }

            sandboxInstance?.destroy();

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: output || '代码执行成功，无输出'
            };
        } catch (error) {
            sandboxInstance?.destroy();
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Sandbox error: ${error.message}`
            };
        }
    }
};

/**
 * Script tools group
 *
 * 各工具的能力与 injectVar 注入方式已写在工具描述中，无需额外规则。
 */
export const scriptTools: ToolGroup = {
    name: '脚本执行工具组',
    tools: [shellTool, pythonTool, javascriptTool],
    rulePrompt: '输出被截断时中间部分不可找回；需要完整输出时让脚本写入文件或分段打印。',
};
