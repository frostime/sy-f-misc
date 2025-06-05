import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

/**
 * 文件系统工具组
 * 包含 ListDir 和 ReadFile 两个工具
 */

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');
const path = window?.require?.('path');

const fileSize = (size: number) => {
    //注意保留两位小数
    if (size < 1024) {
        return size.toFixed(2) + ' B';
    } else if (size < 1024 * 1024) {
        return (size / 1024).toFixed(2) + ' KB';
    } else {
        return (size / (1024 * 1024)).toFixed(2) + ' MB';
    }
}

/**
 * ListDir 工具：列出目录内容
 */
const listDirTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'ListDir',
            description: '列出指定目录下的文件和子目录',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '目录路径'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: { path: string }): Promise<ToolExecuteResult> => {
        // 解析为绝对路径
        const dirPath = path.resolve(args.path);

        // 读取目录内容
        const items = fs.readdirSync(dirPath);

        // 区分文件和目录
        const result = items.map(item => {
            const itemPath = path.join(dirPath, item);
            const isDirectory = fs.statSync(itemPath).isDirectory();
            let size = undefined;
            if (!isDirectory) {
                const stats = fs.statSync(itemPath);
                size = fileSize(stats.size);
            }
            return {
                name: item,
                type: isDirectory ? 'directory' : 'file',
                size: size
            };
        });

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: result
        };
    }
};

/**
 * ReadFile 工具：读取文件内容
 */
const readFileTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'ReadFile',
            description: '读取文件内容，可指定起始行 [begin, end] 闭区间',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    begin: {
                        type: 'number',
                        description: '起始行号（从0开始计数，闭区间）; 如果仅指定 begin，表示从 begin 开始读取末尾',
                        minimum: 0
                    },
                    end: {
                        type: 'number',
                        description: '结束行号（从0开始计数，闭区间）; 如果仅指定 end，表示从开头读取到 end',
                        minimum: 0
                    },
                    limit: {
                        type: 'number',
                        description: '为了防止文件内容过大，限制最大字符数量；默认 7000, 如果设置为 < 0 则不限制'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { path: string; begin?: number; end?: number; limit?: number }): Promise<ToolExecuteResult> => {
        const limit = args.limit ?? 7000;
        const filePath = path.resolve(args.path);

        // 读取文件内容
        const content = fs.readFileSync(filePath, 'utf-8');

        // 处理行范围
        if (args.begin !== undefined || args.end !== undefined) {
            const lines = content.split('\n');
            const totalLines = lines.length;

            // 确定起始行和结束行（闭区间）
            const startLine = args.begin !== undefined ? Math.max(0, args.begin) : 0;
            const endLine = args.end !== undefined ? Math.min(totalLines - 1, args.end) : totalLines - 1;

            // 验证行范围
            if (startLine > endLine) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `起始行(${startLine})不能大于结束行(${endLine})`
                };
            }

            // 提取指定行范围（闭区间）
            let resultContent = lines.slice(startLine, endLine + 1).join('\n');
            if (limit > 0 && resultContent.length > limit) {
                const len = resultContent.length;
                resultContent = resultContent.substring(0, limit);
                resultContent += `\n\n原始内容过长 (${len} 字符), 已省略; 只保留前 ${limit} 字符`;
            }
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `
\`\`\`${filePath} [${startLine}-${endLine}]
${resultContent}
\`\`\`
`.trim(),
            };
        }

        // 没有指定行范围，返回全部内容
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: content
        };
    }
};

/**
 * CreateFile 工具：创建文件
 */
const createFileTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'CreateFile',
            description: '指定路径和内容创建文本文件，如果文件已存在则报错',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    content: {
                        type: 'string',
                        description: '文件内容'
                    }
                },
                required: ['path', 'content']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { path: string; content: string }): Promise<ToolExecuteResult> => {
        const filePath = path.resolve(args.path);

        // 检查文件是否已存在
        if (fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件已存在: ${filePath}`
            };
        }

        // 创建文件并写入内容
        fs.writeFileSync(filePath, args.content, 'utf-8');

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: `文件创建成功: ${filePath}`
        };
    }
};

/**
 * FileState 工具：查看文件详细信息
 */
const fileStateTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'FileState',
            description: '指定路径，查看文件的详细信息（如大小、创建时间、修改时间等）',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC,
    },

    execute: async (args: { path: string }): Promise<ToolExecuteResult> => {
        const filePath = path.resolve(args.path);

        // 获取文件状态
        const stats = fs.statSync(filePath);

        // 格式化文件信息
        const fileInfo = {
            path: filePath,
            size: fileSize(stats.size),
            isDirectory: stats.isDirectory(),
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
            accessedAt: stats.atime.toISOString()
        };

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: fileInfo
        };
    }
};

/**
 * 文件系统工具组
 */
export const fileSystemTools = {
    name: '文件系统工具组',
    tools: fs ? [listDirTool, readFileTool, createFileTool, fileStateTool] : [],
    rulePrompt: ''
};

if (fs && fileSystemTools.tools.length > 0) {
    const os = window?.require?.('os');
    // 获取操作系统类型
    const platform = os.platform();
    // 返回 'win32', 'darwin' (macOS), 'linux' 等

    // 获取用户家目录
    const homeDir = os.homedir();

    // 如果是 Windows，获取所有可用的驱动器
    const getWindowsDrives = () => {
        if (platform === 'win32') {
            // 获取所有驱动器
            const drives = [];
            for (let i = 65; i <= 90; i++) {
                const drive = String.fromCharCode(i) + ':\\';
                try {
                    if (fs.existsSync(drive)) {
                        drives.push(drive);
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            return drives;
        }
        return [];
    };

    const drivers = getWindowsDrives();
    let drivesStr = '';
    if (drivers.length > 0) {
        drivesStr = `可用驱动器：${drivers.join(', ')}`;
    }

    fileSystemTools.rulePrompt = `
当前主机运行的系统: ${platform}, 用户家目录: ${homeDir}
${drivesStr}
`.trim();
}
