import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

/**
 * 文件系统工具组
 * 包含 ListDir 和 ReadFile 两个工具
 */

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');
const path = window?.require?.('path');

// additional file operation tools
import { mkdirTool, moveFileTool, copyFileTool } from "./shutil";

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
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
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
 * TreeList 工具：树状列出目录内容
 */
const treeListTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'TreeList',
            description: '树状列出目录内容，支持深度和 glob 匹配',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '起始目录路径'
                    },
                    depth: {
                        type: 'number',
                        description: '遍历深度，默认为 1; 设置为 -1 表示深度搜索（最大 7 层）'
                    },
                    globPattern: {
                        type: 'string',
                        description: '可选的 glob 模式，用于过滤文件和目录, 例如 *.js 或 **/*.ts'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },
    execute: async (args: { path: string; depth?: number; globPattern?: string }): Promise<ToolExecuteResult> => {
        const { path: startPath, depth = 1, globPattern } = args;
        const MAX_DEPTH = 7;

        // 处理深度参数：-1 表示深度搜索，使用最大深度限制
        const effectiveDepth = depth === -1 ? MAX_DEPTH : Math.min(depth, MAX_DEPTH);
        const resolvedPath = path.resolve(startPath);

        if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `目录不存在或不是一个目录: ${resolvedPath}`
            };
        }

        // 简单的 glob 匹配函数
        const matchGlob = (filePath: string, pattern: string): boolean => {
            if (!pattern) return true;

            // 将 glob 模式转换为正则表达式
            const regexPattern = pattern
                .replace(/\./g, '\\.')  // 转义 .
                .replace(/\*\*/g, '§§') // 临时替换 **
                .replace(/\*/g, '[^/\\\\]*')  // * 匹配除路径分隔符外的任意字符
                .replace(/§§/g, '.*')  // ** 匹配任意字符包括路径分隔符
                .replace(/\?/g, '[^/\\\\]'); // ? 匹配单个字符

            const regex = new RegExp(`^${regexPattern}$`, 'i');
            return regex.test(filePath);
        };

        const listDirRecursive = (dirPath: string, currentDepth: number, prefix: string, relativePath: string = ''): string[] => {
            if (currentDepth >= effectiveDepth) {
                return [];
            }

            let items: string[];
            try {
                items = fs.readdirSync(dirPath);
            } catch (error) {
                return [`${prefix}└── [读取错误: ${error.message}]`];
            }

            const output: string[] = [];
            items.forEach((item, index) => {
                const itemPath = path.join(dirPath, item);
                const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
                const isLast = index === items.length - 1;
                const newPrefix = prefix + (isLast ? '    ' : '│   ');
                const entryPrefix = prefix + (isLast ? '└── ' : '├── ');

                try {
                    const stats = fs.statSync(itemPath);
                    const isDirectory = stats.isDirectory();

                    // 如果有 glob 模式，检查是否匹配
                    const shouldInclude = !globPattern || matchGlob(itemRelativePath, globPattern);

                    if (isDirectory) {
                        if (shouldInclude || !globPattern) {
                            output.push(`${entryPrefix}${item}/`);
                        }
                        // 继续递归，即使当前目录不匹配（因为子文件可能匹配）
                        const subOutput = listDirRecursive(itemPath, currentDepth + 1, newPrefix, itemRelativePath);
                        output.push(...subOutput);
                    } else {
                        if (shouldInclude) {
                            const size = fileSize(stats.size);
                            output.push(`${entryPrefix}${item} (${size})`);
                        }
                    }
                } catch (error) {
                    output.push(`${entryPrefix}${item} [访问错误]`);
                }
            });
            return output;
        };

        const result = listDirRecursive(resolvedPath, 0, '', '');
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: [resolvedPath, ...result].join('\n')
        };
    }
};/**
 * 文件系统工具组
 */
export const fileSystemTools = {
    name: '文件系统工具组',
    tools: fs ? [
        treeListTool,
        readFileTool,
        createFileTool,
        fileStateTool,
        mkdirTool,
        moveFileTool,
        copyFileTool
    ] : [],
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

### 工具使用
- TreeList: 树状列出目录结构，支持深度和 glob 匹配，显示文件大小
- FileState: 获取特定文件元信息
- ReadFile: 读取文本文件内容
- CreateFile: 创建文本文件
- Mkdir: 创建目录 (支持 recursive 类似 -p)
- MoveFile: 移动文件或目录
- CopyFile: 复制文件或目录
`.trim();
}
