// src/func/gpt/tools/script-tools.ts
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel, ToolGroup } from "./types";
import { DEFAULT_LIMIT_CHAR } from './utils';
import {
    execScript,
    execPython,
    execFile,
    getPlatform,
    getScriptName,
    ExecResult
} from "@/libs/system-utils";

// import * as SandboxModule from '@external/sandbox';


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
            description: `在 ${getPlatform()} 运行 ${getScriptName()} 指令/脚本\n返回 \`string\`（stdout/stderr 摘要，完整输出保存于历史记录）`,
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
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { command: string; directory?: string; limit?: number }): Promise<ToolExecuteResult> => {
        try {
            const cwd = args.directory ? path.resolve(args.directory) : process.cwd();
            const result = await execScript(args.command, { cwd });

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
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { code: string; directory?: string; keepFile?: boolean; limit?: number }): Promise<ToolExecuteResult> => {
        try {
            const cwd = args.directory ? path.resolve(args.directory) : undefined;
            const result = await execPython(args.code, {
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
                    }
                },
                required: ['code']
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { code: string }): Promise<ToolExecuteResult> => {
        // 动态导入 sandbox 模块，减少主 bundle 体积
        const SandboxModule = await import('@external/sandbox');
        const JavaScriptSandBox = SandboxModule.default;

        let sandboxInstance: InstanceType<typeof JavaScriptSandBox> | null = null;
        const destroySandbox = () => {
            if (sandboxInstance) {
                sandboxInstance.destroy();
                sandboxInstance = null;
            }
        };
        try {
            sandboxInstance = new JavaScriptSandBox();
            await sandboxInstance.init();

            const result = await sandboxInstance.run(args.code);

            if (result.ok !== true) {
                destroySandbox();
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

            destroySandbox();

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: output || '代码执行成功，无输出'
            };
        } catch (error) {
            destroySandbox();
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
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
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
    rulePrompt: `
## 脚本执行工具组 ##

适用场景：系统交互、数学计算、统计分析、批量处理等 LLM 不擅长的精确计算任务

**工具选择**:
- Shell: ${getScriptName()} 命令/脚本（传入完整代码）
- Python: 需系统已安装，返回 stdout
- JavaScript: 沙盒环境，返回 console 输出以及最后一个被 eval 的变量; 沙盒基于 iframe，内部封装为 async 函数来执行代码; 禁止打印、返回无法被序列化的对象
- Pandoc: 文档格式转换（docx→Markdown 等），使用思源自带 Pandoc
`.trim()
};
