import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

/**
 * 文件系统工具组
 * 包含 ListDir 和 ReadFile 两个工具
 */

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');
const path = window?.require?.('path');
const os = window?.require?.('os');

const DEFAULT_OUTPUT_LIMIT = 7000;

const safeCreateTempDir = (dir: string) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

/**
 * 持久化工具结果到临时文件
 */
const persistToolResult = (toolKey: string, content: string) => {
    try {
        const tempRoot = path.join(os.tmpdir(), 'siyuan_temp');
        safeCreateTempDir(tempRoot);
        const suffix = Math.random().toString(16).slice(2, 10);
        const filePath = path.join(tempRoot, `${toolKey}_result_${Date.now()}_${suffix}.log`);
        fs.writeFileSync(filePath, content, 'utf-8');
        return filePath;
    } catch (error) {
        console.error('Failed to persist tool result:', error);
        return '';
    }
};

/**
 * 格式化输出，超过限制时截断并提示保存路径
 */
const formatOutputWithLimit = (fullOutput: string, limit: number, toolKey: string) => {
    const filePath = persistToolResult(toolKey, fullOutput);
    const savedPathLine = filePath ? `完整输出已保存至: ${filePath}` : '完整输出保存失败，请检查日志。';

    if (!Number.isFinite(limit) || fullOutput.length <= limit) {
        return `${fullOutput}\n\n${savedPathLine}`.trim();
    }

    const headLength = Math.floor(limit / 2);
    const tailLength = limit - headLength;
    const head = fullOutput.slice(0, headLength);
    const tail = fullOutput.slice(fullOutput.length - tailLength);
    const omitted = fullOutput.length - limit;

    return `${head}\n\n...输出过长，省略 ${omitted} 个字符。${savedPathLine}\n\n${tail}`.trim();
};

const normalizeOutputLimit = (limit?: number) => {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
        return DEFAULT_OUTPUT_LIMIT;
    }
    return limit <= 0 ? Number.POSITIVE_INFINITY : limit;
};

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
 * 辅助函数：为文本内容添加行号
 * @param text 文本内容
 * @param beginLine 起始行号（从 1 开始）
 * @returns 带行号的文本
 */
const renderTextWithLineNum = (text: string, beginLine: number = 1): string => {
    const lines = text.split('\n');
    const maxLineNum = beginLine + lines.length - 1;
    const padding = maxLineNum.toString().length;

    return lines.map((line, index) => {
        const lineNum = beginLine + index;
        return `${lineNum.toString().padStart(padding)}: ${line}`;
    }).join('\n');
}

/**
 * ReadFile 工具：读取文件内容
 */
export const readFileTool: Tool = {
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
                        description: '起始行号（从1开始计数，闭区间）; 如果仅指定 beginLine，表示从 beginLine 开始读取末尾',
                        minimum: 1
                    },
                    endLine: {
                        type: 'number',
                        description: '结束行号（从1开始计数，闭区间）; 如果仅指定 endLine，表示从开头读取到 endLine',
                        minimum: 1
                    },
                    limit: {
                        type: 'number',
                        description: '为了防止文件内容过大，限制最大字符数量；默认 7000, 如果设置为 < 0 则不限制'
                    },
                    showLineNum: {
                        type: 'boolean',
                        description: '是否在每行开头显示行号，默认 false; 涉及大文件批量读取建议开启'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { path: string; beginLine?: number; endLine?: number; limit?: number; showLineNum?: boolean }): Promise<ToolExecuteResult> => {
        const limit = args.limit ?? 7000;
        const showLineNum = args.showLineNum ?? false;
        const filePath = path.resolve(args.path);

        // 读取文件内容
        const content = fs.readFileSync(filePath, 'utf-8');

        // 处理行范围
        if (args.beginLine !== undefined || args.endLine !== undefined) {
            const lines = content.split('\n');
            const totalLines = lines.length;

            // 确定起始行和结束行（闭区间），输入为 1-based，内部转 0-based
            const startLine = args.beginLine !== undefined ? Math.max(0, args.beginLine - 1) : 0;
            let endLine = args.endLine !== undefined ? Math.min(totalLines - 1, args.endLine - 1) : totalLines - 1;

            // 验证行范围
            if (args.beginLine !== undefined && args.endLine !== undefined && args.beginLine > args.endLine) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `起始行(${args.beginLine})不能大于结束行(${args.endLine})`
                };
            }

            if (startLine > endLine) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `起始行(${startLine + 1})不能大于结束行(${endLine + 1})`
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
                warning = `⚠️ 原始内容过长 (${originalLen} 字符, ${originalLineCount} 行), 已截断为前 ${limit} 字符 (${truncatedLineCount} 行)`;
            }

            // 如果需要显示行号，添加行号
            if (showLineNum) {
                resultContent = renderTextWithLineNum(resultContent, startLine + 1);
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `
${warning}
----- 文件 "${filePath}" 内容如下 (${startLine + 1}-${endLine + 1}) -----
${resultContent}
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
            warning = `⚠️ 原始内容过长 (${originalLen} 字符, ${originalLineCount} 行), 已截断为前 ${limit} 字符 (${truncatedLineCount} 行)`;
        }

        // 如果需要显示行号，添加行号
        if (showLineNum) {
            resultContent = renderTextWithLineNum(resultContent, 1);
        }

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: `${warning}
--- 文件 "${filePath}" 内容如下 (1-${resultContent.split('\n').length}) ---
${resultContent}
`.trim(),
        };
    }
};

/**
 * CreateFile 工具：创建文件
 */
export const createFileTool: Tool = {
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
export const fileStateTool: Tool = {
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
export const treeListTool: Tool = {
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
                    },
                    skipHiddenDir: {
                        type: 'boolean',
                        description: '不查看隐藏目录内部结构（以 . 开头的目录，如 .git），默认 true',
                    },
                    limit: {
                        type: 'number',
                        description: '限制返回的最大字符数，默认为 7000，传入 <= 0 表示不限制'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },
    execute: async (args: { path: string; depth?: number; regexPattern?: string; skipHiddenDir?: boolean; limit?: number }): Promise<ToolExecuteResult> => {
        const { path: startPath, depth = 1, regexPattern, skipHiddenDir = true } = args;
        const MAX_DEPTH = 7;
        const outputLimit = normalizeOutputLimit(args.limit);

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

        const listDirRecursive = (dirPath: string, currentDepth: number, prefix: string, relativePath: string = '', skipHiddenDir: boolean = true): string[] => {
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
                        const isHiddenDir = item.startsWith('.');
                        if (shouldInclude || !regex) {
                            if (isHiddenDir && skipHiddenDir) {
                                output.push(`${entryPrefix}${item}/ (内部结构略)`);
                            } else {
                                output.push(`${entryPrefix}${item}/`);
                            }
                        }
                        // 继续递归，除非是隐藏目录且需要跳过
                        if (!(isHiddenDir && skipHiddenDir)) {
                            const subOutput = listDirRecursive(itemPath, currentDepth + 1, newPrefix, itemRelativePath, skipHiddenDir);
                            output.push(...subOutput);
                        }
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

        const result = listDirRecursive(resolvedPath, 0, '', '', skipHiddenDir);
        const fullOutput = [resolvedPath, ...result].join('\n');
        const formattedOutput = formatOutputWithLimit(fullOutput, outputLimit, 'TreeList');

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: formattedOutput
        };
    }
};

/**
 * 辅助函数：读取文件并分割成行数组
 */
const readFileLines = (filePath: string, encoding: string = 'utf-8'): string[] => {
    const content = fs.readFileSync(filePath, encoding);
    return content.split('\n');
};

/**
 * 辅助函数：格式化行范围显示
 */
const formatLineRange = (lines: string[], start: number, end: number, highlight?: number): string => {
    const result: string[] = [];
    for (let i = start; i <= end; i++) {
        const prefix = (i + 1) === highlight ? '→' : ' ';
        result.push(`${prefix} ${(i + 1).toString().padStart(4)}: ${lines[i]}`);
    }
    return result.join('\n');
};

/**
 * SearchInFile 工具：在文件中搜索内容
 */
export const searchInFileTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'SearchInFile',
            description: '在指定文本文件中搜索匹配的内容，返回行号和上下文; 注意：该工具适用于文本文件，不建议用于二进制文件',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    pattern: {
                        type: 'string',
                        description: '搜索模式（设置 regex 为 true 以支持正则表达式）'
                    },
                    regex: {
                        type: 'boolean',
                        description: '是否使用正则表达式，默认 false'
                    },
                    contextLines: {
                        type: 'number',
                        description: '返回匹配行的上下文行数，默认 2',
                        minimum: 0
                    },
                    encoding: {
                        type: 'string',
                        description: '文件编码，默认 utf-8',
                    },
                    limit: {
                        type: 'number',
                        description: '限制返回的最大字符数，默认为 7000，传入 <= 0 表示不限制'
                    }
                },
                required: ['path', 'pattern', 'regex']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true

    },

    execute: async (args: {
        path: string;
        pattern: string;
        regex?: boolean;
        contextLines?: number;
        encoding?: string;
        limit?: number
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }

        const filePath: string = path.resolve(args.path);
        const outputLimit = normalizeOutputLimit(args.limit);

        if (!fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件不存在: ${filePath}`
            };
        }

        if (filePath.endsWith('.exe') || filePath.endsWith('.lib') || filePath.endsWith('.dll')) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `不支持在二进制文件中搜索内容: ${filePath}`
            };
        }

        try {
            const lines = readFileLines(filePath, args.encoding ?? 'utf-8');
            const useRegex = args.regex ?? false;
            const contextLines = args.contextLines ?? 2;

            let searchRegex: RegExp;
            if (useRegex) {
                try {
                    searchRegex = new RegExp(args.pattern, 'i');
                } catch (error: any) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `无效的正则表达式: ${error.message}`
                    };
                }
            } else {
                // 转义特殊字符
                const escaped = args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                searchRegex = new RegExp(escaped, 'i');
            }

            // 搜索匹配
            const matches: Array<{ lineNum: number; line: string }> = [];
            lines.forEach((line, index) => {
                if (searchRegex.test(line)) {
                    matches.push({ lineNum: index + 1, line });
                }
            });

            if (matches.length === 0) {
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: `未找到匹配的内容`
                };
            }

            // 构建结果
            let resultMsg = `在 ${path.basename(filePath)} 中找到 ${matches.length} 处匹配:\n\n`;

            matches.forEach((match, index) => {
                const lineIndex = match.lineNum - 1;
                const startLine = Math.max(0, lineIndex - contextLines);
                const endLine = Math.min(lines.length - 1, lineIndex + contextLines);

                resultMsg += `${index + 1}: L${match.lineNum}\n`;
                resultMsg += formatLineRange(lines, startLine, endLine, match.lineNum);
                resultMsg += '\n\n';
            });

            const fullOutput = resultMsg.trim();
            const formattedOutput = formatOutputWithLimit(fullOutput, outputLimit, 'SearchInFile');

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: formattedOutput
            };

        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `搜索失败: ${error.message}`
            };
        }
    }
};

/**
 * SearchInDirectory 工具：在目录中搜索内容
 */
export const searchInDirectoryTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'SearchInDirectory',
            description: '在指定目录下搜索包含特定内容的文本文件',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '目录路径'
                    },
                    pattern: {
                        type: 'string',
                        description: '搜索模式（文件内容）'
                    },
                    filePattern: {
                        type: 'string',
                        description: '文件名过滤模式（如 *.ts, *.js），可选'
                    },
                    regex: {
                        type: 'boolean',
                        description: '是否使用正则表达式搜索内容，默认 false'
                    },
                    maxResults: {
                        type: 'number',
                        description: '最大返回结果数，默认 20',
                        minimum: 1
                    },
                    encoding: {
                        type: 'string',
                        description: '文件编码，默认 utf-8',
                    },
                    limit: {
                        type: 'number',
                        description: '限制返回的最大字符数，默认为 7000，传入 <= 0 表示不限制'
                    }
                },
                required: ['path', 'pattern']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true

    },

    execute: async (args: {
        path: string;
        pattern: string;
        filePattern?: string;
        regex?: boolean;
        maxResults?: number;
        encoding?: string;
        limit?: number
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }

        const dirPath = path.resolve(args.path);
        const outputLimit = normalizeOutputLimit(args.limit);

        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `目录不存在或不是一个目录: ${dirPath}`
            };
        }

        try {
            const useRegex = args.regex ?? false;
            const maxResults = args.maxResults ?? 20;

            // 编译搜索正则
            let searchRegex: RegExp;
            if (useRegex) {
                try {
                    searchRegex = new RegExp(args.pattern, 'i');
                } catch (error: any) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `无效的正则表达式: ${error.message}`
                    };
                }
            } else {
                const escaped = args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                searchRegex = new RegExp(escaped, 'i');
            }

            // 编译文件名过滤正则
            let fileRegex: RegExp | null = null;
            if (args.filePattern) {
                const pattern = args.filePattern
                    .replace(/\./g, '\\.')
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.');
                fileRegex = new RegExp(`^${pattern}$`, 'i');
            }

            // 递归搜索文件
            interface FileMatch {
                file: string;
                matches: Array<{
                    lineNum: number;
                    line: string;
                    preview: string;  // 包含匹配内容的预览文本
                }>;
            }
            const results: FileMatch[] = [];
            let totalMatchCount = 0;

            const searchDir = (currentPath: string, depth: number = 0) => {
                if (depth > 5 || results.length >= maxResults) return; // 限制深度和结果数

                const items = fs.readdirSync(currentPath);

                // 排除二进制文件和常见无关目录
                const execludeSuffixes = [
                    '.exe', '.dll', '.bin', '.lib', '.class',
                    '.so', '.sys', '.db', '.msi', '.zip',
                    '.rar', '.jpg', '.png', '.gif'
                ];
                if (execludeSuffixes.some(suffix => currentPath.toLocaleLowerCase().endsWith(suffix))) {
                    return;
                }
                const execludeDirname = ['.git', 'node_modules', '.vscode', 'dist', 'build'];
                if (execludeDirname.includes(path.basename(currentPath))) {
                    return;
                }
                // 跳过大于 20MB 的内容
                const stats = fs.statSync(currentPath);
                const MAX_FILE_SIZE = 20 * 1024 * 1024;
                if (stats.isFile() && stats.size > MAX_FILE_SIZE) {
                    return;
                }

                for (const item of items) {
                    if (results.length >= maxResults) break;

                    const itemPath = path.join(currentPath, item);

                    try {
                        const stats = fs.statSync(itemPath);

                        if (stats.isDirectory()) {
                            // 跳过常见的无关目录
                            if (['.git', 'node_modules', '.vscode', 'dist', 'build'].includes(item)) {
                                continue;
                            }
                            searchDir(itemPath, depth + 1);
                        } else if (stats.isFile()) {
                            // 检查文件名是否匹配
                            if (fileRegex && !fileRegex.test(item)) {
                                continue;
                            }

                            // 尝试读取文件内容
                            try {
                                const content = fs.readFileSync(itemPath, args.encoding || 'utf-8');

                                // 使用全局正则一次性找到所有匹配
                                const globalRegex = new RegExp(searchRegex.source, 'g' + searchRegex.flags.replace('g', ''));
                                const matches: RegExpMatchArray[] = Array.from(content.matchAll(globalRegex));

                                if (matches.length === 0) continue;

                                const fileMatches: FileMatch['matches'] = [];

                                // 构建行索引映射（字符位置 -> 行号）
                                const lines = content.split('\n');
                                const lineStarts: number[] = [0];
                                let pos = 0;
                                for (let i = 0; i < lines.length - 1; i++) {
                                    pos += lines[i].length + 1; // +1 for '\n'
                                    lineStarts.push(pos);
                                }

                                // 处理每个匹配
                                for (const match of matches) {
                                    const matchPos = match.index ?? 0;

                                    // 二分查找定位行号
                                    let lineNum = lineStarts.findIndex((start, idx) => {
                                        const nextStart = lineStarts[idx + 1] ?? content.length + 1;
                                        return matchPos >= start && matchPos < nextStart;
                                    }) + 1;

                                    // 获取该行的起止位置
                                    const lineStart = lineStarts[lineNum - 1];
                                    const lineEnd = lineStarts[lineNum] ? lineStarts[lineNum] - 1 : content.length;
                                    const line = content.substring(lineStart, lineEnd);

                                    // 生成预览：匹配位置前后各50字符
                                    const matchInLine = matchPos - lineStart;
                                    const previewStart = Math.max(0, matchInLine - 50);
                                    const previewEnd = Math.min(line.length, matchInLine + match[0].length + 50);

                                    let preview = line.substring(previewStart, previewEnd);
                                    if (previewStart > 0) preview = '...' + preview;
                                    if (previewEnd < line.length) preview = preview + '...';

                                    fileMatches.push({
                                        lineNum,
                                        line: line.trim(),
                                        preview: preview.trim()
                                    });
                                }

                                totalMatchCount += fileMatches.length;
                                results.push({
                                    file: path.relative(dirPath, itemPath),
                                    matches: fileMatches
                                });
                            } catch {
                                // 跳过无法读取的文件（二进制文件等）
                            }
                        }
                    } catch {
                        // 跳过无法访问的文件
                    }
                }
            };

            searchDir(dirPath);

            if (results.length === 0) {
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: `在目录 ${path.basename(dirPath)} 中未找到匹配的文件`
                };
            }

            // 构建结果
            let resultMsg = `在 ${path.basename(dirPath)} 中找到 ${results.length} 个匹配的文件（共 ${totalMatchCount} 处匹配）:\n\n`;

            results.forEach((result, fileIndex) => {
                resultMsg += `📄 ${fileIndex + 1}. ${result.file}\n`;

                // 如果匹配数量不多，显示所有匹配；否则只显示前几个
                const maxMatchesToShow = 5;
                const matchesToShow = result.matches.slice(0, maxMatchesToShow);

                matchesToShow.forEach((match, matchIndex) => {
                    resultMsg += `${matchIndex + 1}: L${match.lineNum}\n`;
                    resultMsg += `  ${match.preview}\n`;
                });

                if (result.matches.length > maxMatchesToShow) {
                    resultMsg += `   ... 还有 ${result.matches.length - maxMatchesToShow} 处匹配未显示\n`;
                }

                resultMsg += '\n';
            });

            if (results.length >= maxResults) {
                resultMsg += `(已达到最大文件数 ${maxResults}，可能有更多匹配文件)`;
            }

            const fullOutput = resultMsg;
            const formattedOutput = formatOutputWithLimit(fullOutput, outputLimit, 'SearchInDirectory');

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: formattedOutput
            };

        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `搜索失败: ${error.message}`
            };
        }
    }
};