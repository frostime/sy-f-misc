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
    }
};

/**
 * 执行 Pandoc 转换工具
 */
const pandocTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'Pandoc',
            description: '使用思源自带的 Pandoc 命令，默认会执行 `pandoc -s <file> --to markdown`; 也可以自行指定完整的 pandoc 命令',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: '要转换的文件路径'
                    },
                    customCommand: {
                        type: 'string',
                        description: '自定义的 pandoc 命令，如果提供则忽略其他参数直接执行该命令'
                    }
                },
                required: ['file']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (params: { file: string; customCommand?: string }): Promise<ToolExecuteResult> => {
        // 获取思源工作空间目录下的 pandoc 路径
        const pandocPath = path.join(globalThis.siyuan.config.system.workspaceDir, 'temp/pandoc/bin/pandoc.exe');

        // 检查 pandoc 是否存在
        if (!fs.existsSync(pandocPath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Pandoc 未找到: ${pandocPath}`
            };
        }

        // file 所在目录
        const fileDir = path.dirname(params.file);

        // 构建命令
        let command: string;
        let cmdArgs: string[];

        if (params.customCommand) {
            // 使用自定义命令
            const cmdParts = params.customCommand.split(' ');
            command = pandocPath;
            cmdArgs = cmdParts;
        } else {
            // 使用默认命令: pandoc -s <file> --to markdown
            command = pandocPath;
            cmdArgs = ['-s', params.file, '--to', 'markdown'];
        }

        // 执行 pandoc 命令
        return new Promise((resolve) => {
            // 指定工作目录
            childProcess.execFile(command, cmdArgs, { cwd: fileDir }, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        status: ToolExecuteStatus.ERROR,
                        error: `Pandoc 执行错误: ${error.message}\n${stderr}`
                    });
                    return;
                }

                resolve({
                    status: ToolExecuteStatus.SUCCESS,
                    data: stdout || 'Pandoc 运行完成，无输出'
                });
            });
        });
    }
};

/**
 * 脚本工具组
 */
export const scriptTools: ToolGroup = {
    name: '脚本执行工具组',
    tools: [shellTool, pythonTool, javascriptTool, pandocTool],
    rulePrompt: `提供本地脚本执行能力的工具组

建议在需要和系统进行交互或者执行复杂运算的时候选用这些工具。
以及在需要大量数据处理、统计、固定流程算法执行等大语言模型不擅长的领域来使用这些。（例如：用户询问了数学计算问题等）

Shell 工具会根据当前系统自动选择使用 PowerShell 或 Bash。
Python 工具需要确保当前系统已经安装 Python。
JavaScript 工具运行在一个特殊环境中，document 对象被禁用。
Pandoc 工具使用思源自带的 Pandoc 进行文档格式转换，默认转换为 Markdown 格式。如果需要读取外部的 docx 等文件的内容可以用它。

`
};