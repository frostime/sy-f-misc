// src/func/gpt/tools/script/index.ts
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel, ToolGroup } from "./types";

/**
 * 脚本执行工具组
 * 包含 Shell、Python 和 JavaScript 执行工具
 */

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');
const path = window?.require?.('path');
const childProcess = window?.require?.('child_process');
const os = window?.require?.('os');

/**
 * 执行 Shell 命令工具
 */
const shellTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'Shell',
            description: '在本地运行 shell 脚本（Windows 上为 PowerShell，其他系统为 Bash）',
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
                    }
                },
                required: ['command']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { command: string; directory?: string }): Promise<ToolExecuteResult> => {
        try {
            // 确定执行目录
            const cwd = args.directory ? path.resolve(args.directory) : process.cwd();

            // 确定使用的 shell
            const isWindows = os.platform() === 'win32';
            const shell = isWindows ? 'powershell.exe' : 'bash';
            const shellArgs = isWindows ? ['-Command', args.command] : ['-c', args.command];

            // 执行命令
            return new Promise((resolve) => {
                childProcess.execFile(shell, shellArgs, { cwd }, (error, stdout, stderr) => {
                    if (error) {
                        resolve({
                            status: ToolExecuteStatus.ERROR,
                            error: `Shell execution error: ${error.message}\n${stderr}`
                        });
                        return;
                    }

                    resolve({
                        status: ToolExecuteStatus.SUCCESS,
                        data: stdout || '命令执行成功，无输出'
                    });
                });
            });
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Shell error: ${error.message}`
            };
        }
    }
};

/**
 * 执行 Python 脚本工具
 */
const pythonTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'Python',
            description: '在本地运行 Python 代码 (默认假设本地安装已经安装了 Python)',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: '要执行的 Python 代码'
                    },
                    location: {
                        type: 'string',
                        description: '脚本文件保存位置，默认为临时目录'
                    },
                    keepFile: {
                        type: 'boolean',
                        description: '运行完毕后是否保留 Python 脚本文件，默认为 false'
                    }
                },
                required: ['code']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { code: string; location?: string; keepFile?: boolean }): Promise<ToolExecuteResult> => {
        try {
            // 创建临时文件
            const tempDir = args.location || os.tmpdir();
            const timestamp = new Date().getTime();
            const scriptPath = path.join(tempDir, `script_${timestamp}.py`);

            // 写入 Python 代码
            fs.writeFileSync(scriptPath, args.code, 'utf-8');

            // 执行 Python 脚本
            return new Promise((resolve) => {
                childProcess.execFile('python', [scriptPath], (error, stdout, stderr) => {
                    // 如果不保留文件，则删除
                    if (!args.keepFile) {
                        try {
                            fs.unlinkSync(scriptPath);
                        } catch (e) {
                            console.error('Failed to delete temporary Python script:', e);
                        }
                    }

                    if (error) {
                        resolve({
                            status: ToolExecuteStatus.ERROR,
                            error: `Python execution error: ${error.message}\n${stderr}`
                        });
                        return;
                    }

                    resolve({
                        status: ToolExecuteStatus.SUCCESS,
                        data: stdout || '脚本执行成功，无输出'
                    });
                });
            });
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Python error: ${error.message}`
            };
        }
    }
};

/**
 * 执行 JavaScript 代码工具
 */
const javascriptTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'JavaScript',
            description: '在当前环境中运行 JavaScript 代码（出于安全考虑，禁止访问 document 对象）',
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
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { code: string }): Promise<ToolExecuteResult> => {
        try {
            // 创建沙盒环境
            const sandbox = {
                console: {
                    log: (...args: any[]) => sandbox._output.push(args.map(arg => String(arg)).join(' ')),
                    error: (...args: any[]) => sandbox._errors.push(args.map(arg => String(arg)).join(' ')),
                    warn: (...args: any[]) => sandbox._warnings.push(args.map(arg => String(arg)).join(' '))
                },
                _output: [] as string[],
                _errors: [] as string[],
                _warnings: [] as string[],
                // setTimeout: setTimeout,
                // clearTimeout: clearTimeout,
                // setInterval: setInterval,
                // clearInterval: clearInterval,
                // JSON: JSON,
                // Math: Math,
                // Date: Date,
                // Array: Array,
                // Object: Object,
                // String: String,
                // Number: Number,
                // Boolean: Boolean,
                // Error: Error,
                // RegExp: RegExp,
                // 禁止访问 document 对象
                document: undefined
            };

            // 执行代码
            const scriptFn = new Function('sandbox', `
                with (sandbox) {
                    ${args.code}
                }
                return sandbox;
            `);

            const result = scriptFn(sandbox);

            // 构建输出
            let output = '';
            if (result._output.length > 0) {
                output += result._output.join('\n');
            }
            if (result._warnings.length > 0) {
                output += '\n\nWarnings:\n' + result._warnings.join('\n');
            }
            if (result._errors.length > 0) {
                output += '\n\nErrors:\n' + result._errors.join('\n');
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: output || '代码执行成功，无输出'
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `JavaScript execution error: ${error.message}`
            };
        }
    }
};

/**
 * 脚本工具组
 */
export const scriptTools: ToolGroup = {
    name: '脚本执行工具组',
    tools: [shellTool, pythonTool, javascriptTool],
    rulePrompt: `提供本地脚本执行能力的工具组

建议在需要和系统进行交互或者执行复杂运算的时候选用这些工具。
以及在需要大量数据处理、统计、固定流程算法执行等大语言模型不擅长的领域来使用这些。（例如：用户询问了数学计算问题等）

Shell 工具会根据当前系统自动选择使用 PowerShell 或 Bash。
Python 工具需要确保当前系统已经安装 Python。
JavaScript 工具运行在一个特殊环境中，document 对象被禁用。

`
};