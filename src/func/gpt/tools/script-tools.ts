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

const platform = os?.platform();


const testHasCommand = async (command: string) => {
    try {
        childProcess.execSync(`where ${command}`, { stdio: 'ignore' });
        return true;
    } catch (_) {
        return false;
    }
}

let hasPwsh = null;

/**
 * 执行 Shell 命令工具
 */
const shellTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'Shell',
            description: `在${platform} 运行 ${platform === 'win32' ? 'PowerShell' : 'Bash'} 指令/脚本`,
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

        // 创建临时脚本文件
        const isWindows = os.platform() === 'win32';
        const tempDir = os.tmpdir();
        const timestamp = new Date().getTime();
        const scriptExt = isWindows ? 'ps1' : 'sh';
        const scriptPath = path.join(tempDir, `shell_script_${timestamp}.${scriptExt}`);

        // 写入脚本内容
        fs.writeFileSync(scriptPath, args.command, 'utf-8');

        // 确定使用的 shell 和参数
        let shell: string;
        if (isWindows) {
            // 优先使用 PowerShell Core (pwsh) 如果存在，否则退回到 powershell.exe
            if (hasPwsh === null) {
                hasPwsh = await testHasCommand('pwsh');
            }
            shell = hasPwsh ? 'pwsh' : 'powershell.exe';
        } else {
            shell = 'bash';
        }
        const shellArgs = [scriptPath];

        // 执行脚本
        return new Promise((resolve) => {
            childProcess.execFile(shell, shellArgs, { cwd }, (error, stdout, stderr) => {
                try {
                    fs.unlinkSync(scriptPath);
                } catch (e) {
                    console.error('Failed to delete temporary shell script:', e);
                }

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
                    directory: {
                        type: 'string',
                        description: '脚本文件保存位置，默认为自动配置的临时目录'
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

    execute: async (args: { code: string; directory?: string; keepFile?: boolean }): Promise<ToolExecuteResult> => {
        // 创建临时文件
        const tempDir = args.directory || os.tmpdir();
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

const scriptName = platform === 'win32' ? 'PowerShell' : 'Bash';

/**
 * 脚本工具组
 */
export const scriptTools: ToolGroup = {
    name: '脚本执行工具组',
    tools: [shellTool, pythonTool, javascriptTool, pandocTool],
    rulePrompt: `本地脚本执行工具组

这些工具适用于需要与系统交互或执行复杂运算的场景，以及在处理大量数据、数学计算、 统计分析、固定流程算法等大语言模型不擅长的领域（如数学计算问题）。

- Shell 工具：运行当前系统的 ${scriptName} 命令; 通过创建临时脚本文件执行, 请传入完整的脚本代码或者命令代码
- Python 工具：需确保系统已安装 Python; 返回结果为 python 的标准流输出
- JavaScript 工具：运行在特殊环境中，禁用 document 对象; 返回结果为 JavaScript console.log 等 api 输出
- Pandoc 工具：使用思源自带的 Pandoc 进行文档格式转换，默认转换为 Markdown 格式。适用于读取外部 docx 等文件内容。
`
};