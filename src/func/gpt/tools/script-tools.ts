// src/func/gpt/tools/script-tools.ts
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolGroup } from "./types";
import { DEFAULT_LIMIT_CHAR } from './utils';
import {
    execScript,
    execPython,
    execFile,
    getPlatform,
    getScriptName,
    ExecResult
} from "@/libs/system-utils";

// Import Node.js modules for file operations
const fs = window?.require?.('fs');
const path = window?.require?.('path');

/**
 * Format execution result as output string
 */
const formatOutput = (result: ExecResult): string => {
    return `[stdout]\n${result.stdout}\n\n[stderr]\n${result.stderr}`;
};

/**
 * Shell command execution tool
 */
const shellTool: Tool = {
    declaredReturnType: {
        type: 'string',
        note: '格式为 "[stdout]\n...\n\n[stderr]\n..."'
    },

    definition: {
        type: 'function',
        function: {
            name: 'Shell',
            description: `在 ${getPlatform()} 运行 ${getScriptName()} 指令/脚本\n返回 string（stdout/stderr 摘要，完整输出保存于历史记录）`,
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
                        description: `注入变量到 ${getScriptName()} 环境中。变量会被设置为环境变量，PowerShell 中使用 $env:VAR_NAME 访问，Bash 中使用 $VAR_NAME 访问。支持与 VAR_REF 机制结合`
                    },
                    limit: {
                        type: 'number',
                        description: `限制返回的最大字符数，默认为 ${DEFAULT_LIMIT_CHAR}，传入 <= 0 表示不限制`
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
    declaredReturnType: {
        type: 'string',
        note: '格式为 "[stdout]\n...\n\n[stderr]\n..."'
    },

    definition: {
        type: 'function',
        function: {
            name: 'Python',
            description: '在本地运行 Python 代码（默认假设本地已安装 Python）',
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
                        description: '注入变量到 Python 环境中。变量会被解析为 Python 对象，并在代码开头自动声明。支持与 VAR_REF 机制结合，将大量数据通过变量引用传递给 Python'
                    },
                    keepFile: {
                        type: 'boolean',
                        description: '运行完毕后是否保留 Python 脚本文件，默认为 false'
                    },
                    limit: {
                        type: 'number',
                        description: `限制返回的最大字符数，默认为 ${DEFAULT_LIMIT_CHAR}，传入 <= 0 表示不限制`
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
    declaredReturnType: {
        type: 'string',
        note: 'console.log 输出，可能含 Warnings/Errors 部分'
    },

    definition: {
        type: 'function',
        function: {
            name: 'JavaScript',
            description: '在沙盒环境中运行 JavaScript 代码',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: '要执行的 JavaScript 代码'
                    },
                    injectVar: {
                        type: 'object',
                        description: '注入变量到 JavaScript 环境中。变量会被解析为 JS 对象，并在代码开头通过 const 声明。支持与 VAR_REF 机制结合，将大量数据通过变量引用传递给 JS'
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
 * Pandoc document conversion tool
 */
const pandocTool: Tool = {
    declaredReturnType: {
        type: 'string',
        note: 'Pandoc stdout 输出（通常是转换后的 Markdown）'
    },

    definition: {
        type: 'function',
        function: {
            name: 'Pandoc',
            description: '使用思源自带的 Pandoc 命令，默认执行 `pandoc -s <file> --to markdown`；也可自定义完整命令',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: '要转换的文件路径'
                    },
                    customCommand: {
                        type: 'string',
                        description: '自定义的 pandoc 参数，如果提供则替换默认参数'
                    }
                },
                required: ['file']
            }
        }
    },

    permission: {
        executionPolicy: 'auto',
        resultApprovalPolicy: 'always'
    },

    execute: async (params: { file: string; customCommand?: string }): Promise<ToolExecuteResult> => {
        try {
            // Get Pandoc path from SiYuan workspace
            const pandocPath = path.join(
                globalThis.siyuan.config.system.workspaceDir,
                'temp/pandoc/bin/pandoc.exe'
            );

            // Check if Pandoc exists
            if (!fs.existsSync(pandocPath)) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `Pandoc 未找到: ${pandocPath}`
                };
            }

            // Build arguments
            const args = params.customCommand
                ? params.customCommand.split(/\s+/)
                : ['-s', params.file, '--to', 'markdown'];

            // Execute Pandoc
            const fileDir = path.dirname(params.file);
            const result = await execFile(pandocPath, args, { cwd: fileDir });

            if (!result.success) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `Pandoc 执行错误: ${result.error}\n${result.stderr}`
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result.stdout || 'Pandoc 运行完成，无输出'
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Pandoc 执行错误: ${error.message}`
            };
        }
    }
};

/**
 * Script tools group
 */
export const scriptTools: ToolGroup = {
    name: '脚本执行工具组',
    tools: [shellTool, pythonTool, javascriptTool, pandocTool],
    declareSkillRules: {
        'var-ref-inject': {
            when: '需要利用 VAR_REF 机制将变量传递给脚本工具',
            desc: 'VAR_REF + injectVar 案例',
            prompt: `
结合 VAR_REF 机制，可将大量数据通过变量引用传递给脚本

注意:

1. 使用 VAR_REF 必须使用两个大括号引用 $VAR_REF{{name}}
2. $VAR_REF 引用变量的类型**总是字符串**；所以不建议在内部存储复杂结构，或者读取的时候进行 json 解码以恢复结构化数据

假设已经存在 large_json_data 变量 (建议通过 ListVars 检查)

可以直接将其传入脚本注入变量中

\`\`\`json
// Python 示例：处理大量 JSON 数据
{
  "name": "Python",
  "arguments": {
    "code": "print(len(data))  # data 已自动解析为 Python 对象",
    "injectVar": {
      "data": "$VAR_REF{{large_json_data}}"
    }
  }
}

// JavaScript 示例：处理大量文本
{
  "name": "JavaScript",
  "arguments": {
    "code": "console.log(content.split('\\n').length);  // content 已自动解析",
    "injectVar": {
      "content": "$VAR_REF{{large_text}}"
    }
  }
}
\`\`\`
            `.trim()
        }
    },
    rulePrompt: `
## 脚本执行工具组 ##

适用场景：系统交互、数学计算、统计分析、批量处理等 LLM 不擅长的精确计算任务

**工具选择**:
- Shell: ${getScriptName()} 命令/脚本（传入完整代码）
- Python: 需系统已安装，返回 stdout
- JavaScript: 沙盒环境，返回 console 输出以及最后一个被 eval 的变量; 沙盒基于 iframe，内部封装为 async 函数来执行代码; 禁止打印、返回无法被序列化的对象
- Pandoc: 文档格式转换（docx→Markdown 等），使用思源自带 Pandoc

**变量注入（injectVar 参数）**:
所有脚本工具均支持 \`injectVar\` 参数，用于将变量传递给脚本环境; 请注意 inejctVar 必须可JSON序列化, 尽量只使用基本类型.

- **Shell**: 通过环境变量注入
  - PowerShell: \`$env:VAR_NAME\`
  - Bash: \`$VAR_NAME\`
- **Python**: 变量会在代码开头自动声明，可直接使用
- **JavaScript**: 通过代码前置声明注入

可与 VAR_REF 机制结合，直接引用变量以节省 Token，详情见相关 Rule 文档。

`.trim()
};
