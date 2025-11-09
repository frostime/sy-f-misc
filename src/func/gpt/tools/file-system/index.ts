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
import { markitdownTool } from "./markitdown";
import { editorTools } from "./editor";

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
            description: '读取文件内容，可指定起始行 [beginLine, endLine] 闭区间',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    beginLine: {
                        type: 'number',
                        description: '起始行号（从0开始计数，闭区间）; 如果仅指定 beginLine，表示从 beginLine 开始读取末尾',
                        minimum: 0
                    },
                    endLine: {
                        type: 'number',
                        description: '结束行号（从0开始计数，闭区间）; 如果仅指定 endLine，表示从开头读取到 endLine',
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

    execute: async (args: { path: string; beginLine?: number; endLine?: number; limit?: number }): Promise<ToolExecuteResult> => {
        const limit = args.limit ?? 7000;
        const filePath = path.resolve(args.path);

        // 读取文件内容
        const content = fs.readFileSync(filePath, 'utf-8');

        // 处理行范围
        if (args.beginLine !== undefined || args.endLine !== undefined) {
            const lines = content.split('\n');
            const totalLines = lines.length;

            // 确定起始行和结束行（闭区间）
            const startLine = args.beginLine !== undefined ? Math.max(0, args.beginLine) : 0;
            let endLine = args.endLine !== undefined ? Math.min(totalLines - 1, args.endLine) : totalLines - 1;

            // 验证行范围
            if (startLine > endLine) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `起始行(${startLine})不能大于结束行(${endLine})`
                };
            }

            // 提取指定行范围（闭区间）
            let resultContent = lines.slice(startLine, endLine + 1).join('\n');
            let warning = '';
            if (limit > 0 && resultContent.length > limit) {
                const originalLen = resultContent.length;
                const originalLineCount = endLine - startLine + 1;
                resultContent = resultContent.substring(0, limit);
                const truncatedLineCount = resultContent.split('\n').length;
                endLine = startLine + truncatedLineCount - 1;
                warning = `⚠️ 原始内容过长 (${originalLen} 字符, ${originalLineCount} 行), 已截断为前 ${limit} 字符 (${truncatedLineCount} 行)\n\n`;
            }
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `
${warning}\`\`\`${filePath} [${startLine}-${endLine}]
${resultContent}
\`\`\`
`.trim(),
            };
        }

        // 没有指定行范围，返回全部内容（需应用 limit 限制）
        let resultContent = content;
        let warning = '';
        if (limit > 0 && resultContent.length > limit) {
            const originalLen = resultContent.length;
            const originalLineCount = content.split('\n').length;
            resultContent = resultContent.substring(0, limit);
            const truncatedLineCount = resultContent.split('\n').length;
            warning = `⚠️ 原始内容过长 (${originalLen} 字符, ${originalLineCount} 行), 已截断为前 ${limit} 字符 (${truncatedLineCount} 行)\n\n`;
        }

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: `${warning}${resultContent}`
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
            description: '指定路径和内容创建文本文件，如果文件已存在则报错。如果不指定完整路径（相对路径），文件将会被创建到系统临时目录的 siyuan_temp 子目录下',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径（支持绝对路径和相对路径，相对路径将写入到临时目录）'
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
        const os = window?.require?.('os');
        let filePath: string;

        // 检查是否为绝对路径
        if (path.isAbsolute(args.path)) {
            filePath = args.path;
        } else {
            // 相对路径，写入到临时目录
            const tempDir = path.join(os.tmpdir(), 'siyuan_temp');
            // 确保临时目录存在
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            filePath = path.join(tempDir, args.path);
        }

        // 检查文件是否已存在
        if (fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件已存在: ${filePath}`
            };
        }

        // 确保文件所在目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
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
const TEXT_FILE = [
    // 通用与文档
    'txt', 'md', 'markdown',
    // 配置
    'yml', 'yaml', 'ini', 'toml', 'json', 'conf', 'cfg',
    // 代码
    'js', 'ts', 'py', 'cpp', 'java', 'html', 'xml', 'css',
    // 数据与日志
    'csv', 'log'
];
const fileStateTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'FileState',
            description: '指定路径，查看文件的详细信息（如大小、创建时间、修改时间、文本文件行数等）',
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
        const fileInfo: any = {
            path: filePath,
            size: fileSize(stats.size),
            isDirectory: stats.isDirectory(),
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
            accessedAt: stats.atime.toISOString()
        };

        // if is plaintext file
        const isPlainText = TEXT_FILE.includes(path.extname(filePath).slice(1));
        if (isPlainText) {
            // 直接读取二进制数据统计行数，避免编码问题
            const buffer = fs.readFileSync(filePath);
            let lineCount = 1; // 至少有一行
            for (let i = 0; i < buffer.length; i++) {
                if (buffer[i] === 0x0A) { // LF
                    lineCount++;
                }
            }
            fileInfo.lineCount = lineCount;
        }

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
            description: '树状列出目录内容，支持深度和正则表达式匹配',
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
                    regexPattern: {
                        type: 'string',
                        description: '可选的正则表达式模式，用于过滤文件和目录（匹配相对路径），例如 \\.js$ 或 src/.*\\.ts$'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },
    execute: async (args: { path: string; depth?: number; regexPattern?: string }): Promise<ToolExecuteResult> => {
        const { path: startPath, depth = 1, regexPattern } = args;
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

        // 编译正则表达式（如果提供）
        let regex: RegExp | null = null;
        if (regexPattern) {
            try {
                regex = new RegExp(regexPattern, 'i');
            } catch (error) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `无效的正则表达式: ${error.message}`
                };
            }
        }

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

                    // 如果有正则表达式，检查是否匹配相对路径
                    const shouldInclude = !regex || regex.test(itemRelativePath);

                    if (isDirectory) {
                        if (shouldInclude || !regex) {
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
        copyFileTool,
        markitdownTool,
    ] : [],
    rulePrompt: ''
};

export const fileEditorTools = {
    name: '文件编辑工具组',
    tools: fs ? [
        ...editorTools.tools
    ] : [],
    rulePrompt: editorTools.rulePrompt
}

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

### 文件系统工具

- TreeList: 树状列出目录结构，支持深度和 glob 匹配，显示文件大小
- FileState: 获取特定文件元信息
- ReadFile: 读取文本文件内容
- CreateFile: 创建文本文件
- Mkdir: 创建目录 (支持 recursive 类似 -p)
- MoveFile: 移动文件或目录
- CopyFile: 复制文件或目录
- MarkitdownRead: 读取 Word (.docx), PDF (.pdf) 等文件，转换为 Markdown 格式（需要安装 markitdown 工具）
`.trim();
}
