import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import {
    LIMITS,
    EXCLUDED_DIRS,
    detectFileType,
    safeReadFile,
    readFirstLines,
    readLastLines,
    readLineRange,
    countLines,
    formatFileSize,
    addLineNumbers,
    // formatLineRange,
    shouldExclude,
    matchPattern,
    searchInFile as utilSearchInFile,
    handleFileError,
    // ViewerError
} from './viewer-utils';

const fs = window?.require?.('fs');
const path = window?.require?.('path');

// ============================================================
// 1. View - 智能文件查看
// ============================================================

export const viewTool: Tool = {
    declaredReturnType: {
        type: `{
    path: string;           // 文件绝对路径
    content: string;        // 文件内容
    mode: string;           // 查看模式
    range: {                // 显示的行范围
        start: number;      // 起始行号（1-based）
        end: number;        // 结束行号（1-based）
    };
    totalLines: number;     // 文件总行数
    size: string;           // 格式化的文件大小（如 "1.5 MB"）
    sizeBytes: number;      // 文件字节数
}`,
        note: '结构化的文件内容数据，content 字段包含实际内容'
    },

    definition: {
        type: 'function',
        function: {
            name: 'fs.View',
            description: `智能查看文件内容，自动处理大文件和二进制文件。

**查看模式**：
- preview（默认）：小文件完整显示，大文件显示前 100 行
- full：完整内容（最大 10MB）
- head：显示前 N 行
- tail：显示后 N 行
- range：显示指定行范围

**使用场景**：
- 查看代码文件
- 预览配置文件
- 查看日志文件末尾（tail 模式）
- 读取大文件的特定部分（range 模式）`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    mode: {
                        type: 'string',
                        enum: ['preview', 'full', 'head', 'tail', 'range'],
                        description: '查看模式（默认 preview）'
                    },
                    lines: {
                        type: 'number',
                        description: 'head/tail 模式：显示的行数（默认 50）',
                        minimum: 1,
                        maximum: 1000
                    },
                    range: {
                        type: 'array',
                        description: 'range 模式：[起始行, 结束行]（1-based，闭区间）',
                        items: { type: 'number' },
                        // minItems: 2,
                        // maxItems: 2
                    },
                    lineNumbers: {
                        type: 'boolean',
                        description: '是否显示行号（默认 false）'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: {
        path: string;
        mode?: 'preview' | 'full' | 'head' | 'tail' | 'range';
        lines?: number;
        range?: [number, number];
        lineNumbers?: boolean;
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
        }

        try {
            const filePath = path.resolve(args.path);
            const mode = args.mode || 'preview';
            const showLineNumbers = args.lineNumbers || false;

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `文件不存在: ${filePath}`
                };
            }

            const stats = fs.statSync(filePath);
            const fileType = detectFileType(filePath);

            // 检查是否为目录
            if (fileType === 'directory') {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: '这是一个目录，请使用 List 工具查看目录内容'
                };
            }

            // 检查是否为二进制文件
            if (fileType === 'binary') {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `这是二进制文件（${formatFileSize(stats.size)}），无法以文本形式查看`
                };
            }

            // 根据模式处理
            let content: string;
            let displayRange: string;
            let totalLines: number | undefined;

            switch (mode) {
                case 'full': {
                    const result = safeReadFile(filePath, LIMITS.MAX_FILE_SIZE);
                    if (result.error) {
                        return { status: ToolExecuteStatus.ERROR, error: result.error };
                    }
                    content = result.content!;
                    totalLines = content.split('\n').length;
                    displayRange = `1-${totalLines}`;
                    break;
                }

                case 'head': {
                    const count = Math.min(args.lines || 50, 1000);
                    const lines = await readFirstLines(filePath, count);
                    content = lines.join('\n');
                    totalLines = await countLines(filePath);
                    displayRange = `1-${lines.length}`;
                    break;
                }

                case 'tail': {
                    const count = Math.min(args.lines || 50, 1000);
                    const lines = await readLastLines(filePath, count);
                    content = lines.join('\n');
                    totalLines = await countLines(filePath);
                    const startLine = Math.max(1, totalLines - lines.length + 1);
                    displayRange = `${startLine}-${totalLines}`;
                    break;
                }

                case 'range': {
                    if (!args.range || args.range.length !== 2) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: 'range 模式需要提供 range 参数，格式：[起始行, 结束行]'
                        };
                    }
                    const [start, end] = args.range;
                    if (start < 1 || end < start) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `无效的行范围：[${start}, ${end}]`
                        };
                    }
                    const result = await readLineRange(filePath, start, end);
                    content = result.lines.join('\n');
                    totalLines = result.totalLines;
                    displayRange = `${start}-${Math.min(end, totalLines || end)}`;
                    break;
                }

                case 'preview':
                default: {
                    // 智能预览：小文件全显示，大文件显示前 100 行
                    if (stats.size <= LIMITS.MAX_FILE_SIZE) {
                        const result = safeReadFile(filePath);
                        if (result.error) {
                            // 尝试用 head 模式
                            const lines = await readFirstLines(filePath, LIMITS.MAX_PREVIEW_LINES);
                            content = lines.join('\n');
                            totalLines = await countLines(filePath);
                            displayRange = `1-${lines.length}`;
                            break;
                        }
                        content = result.content!;
                        totalLines = content.split('\n').length;
                        displayRange = `1-${totalLines}`;
                    } else {
                        const lines = await readFirstLines(filePath, LIMITS.MAX_PREVIEW_LINES);
                        content = lines.join('\n');
                        totalLines = await countLines(filePath);
                        displayRange = `1-${lines.length}`;
                    }
                    break;
                }
            }

            // 添加行号
            if (showLineNumbers) {
                const startLine = parseInt(displayRange.split('-')[0]);
                content = addLineNumbers(content, startLine);
            }

            // 解析 displayRange 为结构化格式
            const [rangeStart, rangeEnd] = displayRange.split('-').map(Number);

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    path: filePath,
                    content,
                    mode,
                    range: {
                        start: rangeStart,
                        end: rangeEnd
                    },
                    totalLines,
                    size: formatFileSize(stats.size),
                    sizeBytes: stats.size
                }
            };

        } catch (error: any) {
            const err = handleFileError(error, args.path);
            return { status: ToolExecuteStatus.ERROR, error: err.message };
        }
    },

    formatForLLM: (data: any) => {
        const { path: filePath, content, range, totalLines, mode } = data;
        const fileName = filePath.split(/[\\/]/).pop();

        let header = `📄 ${fileName}`;
        if (totalLines) {
            header += ` (显示 ${range.start}-${range.end} / 共 ${totalLines} 行)`;
        }
        if (mode === 'preview' && range.end !== totalLines) {
            header += ' [预览模式]';
        }

        return `${header}\n${'─'.repeat(60)}\n${content}`;
    }
};

// ============================================================
// 2. Search - 统一搜索工具
// ============================================================

export const searchTool: Tool = {
    declaredReturnType: {
        type: `{
    directory: string;      // 搜索的目录路径
    searchName?: string;    // 搜索的文件名模式（如果有）
    searchContent?: string; // 搜索的内容模式（如果有）
    results: Array<{
        file: string;       // 相对文件路径
        type: 'name' | 'content';  // 匹配类型
        matches?: Array<{   // 内容匹配详情（仅 type='content' 时）
            lineNum: number;    // 行号
            line: string;       // 完整行内容
            preview: string;    // 预览文本（最多 100 字符）
        }>;
    }>;
    filesScanned: number;   // 扫描的文件数
    reachedLimit: boolean;  // 是否达到结果数上限
}`,
        note: '结构化的搜索结果，results 数组包含所有匹配项'
    },

    definition: {
        type: 'function',
        function: {
            name: 'fs.Search',
            description: `在目录中搜索文件名或文件内容（或两者）。

**搜索目标**（至少指定一个）：
- name: 搜索文件名
- content: 搜索文件内容

**特性**：
✓ 统一的搜索接口
✓ 支持正则表达式
✓ 智能排除无关目录（node_modules, .git 等）
✓ 可自定义包含/排除模式

**使用场景**：
- 查找包含特定代码的文件
- 搜索配置文件
- 查找 TODO 或 FIXME 注释
- 定位错误日志`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '搜索起始目录'
                    },
                    name: {
                        type: 'string',
                        description: '搜索文件名（支持通配符：*.ts, test*.js）'
                    },
                    content: {
                        type: 'string',
                        description: '搜索文件内容'
                    },
                    regex: {
                        type: 'boolean',
                        description: '是否使用正则表达式（默认 false）'
                    },
                    caseSensitive: {
                        type: 'boolean',
                        description: '大小写敏感（默认 false）'
                    },
                    include: {
                        type: 'array',
                        description: '包含的文件模式（如 ["*.ts", "*.js"]）',
                        items: { type: 'string' }
                    },
                    exclude: {
                        type: 'array',
                        description: `排除的目录/文件（默认排除 node_modules, .git 等）`,
                        items: { type: 'string' }
                    },
                    maxDepth: {
                        type: 'number',
                        description: '最大搜索深度（默认 5）',
                        minimum: 1,
                        maximum: 10
                    },
                    maxResults: {
                        type: 'number',
                        description: '最大结果数（默认 50）',
                        minimum: 1,
                        maximum: 200
                    },
                    contextLines: {
                        type: 'number',
                        description: '内容搜索时的上下文行数（默认 2）',
                        minimum: 0,
                        maximum: 10
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: {
        path: string;
        name?: string;
        content?: string;
        regex?: boolean;
        caseSensitive?: boolean;
        include?: string[];
        exclude?: string[];
        maxDepth?: number;
        maxResults?: number;
        contextLines?: number;
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
        }

        try {
            const dirPath = path.resolve(args.path);

            // 验证搜索参数
            if (!args.name && !args.content) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: '必须指定 name 或 content（或两者）'
                };
            }

            if (!fs.existsSync(dirPath)) {
                return { status: ToolExecuteStatus.ERROR, error: `目录不存在: ${dirPath}` };
            }

            const stats = fs.statSync(dirPath);
            if (!stats.isDirectory()) {
                return { status: ToolExecuteStatus.ERROR, error: `不是目录: ${dirPath}` };
            }

            const maxDepth = Math.min(args.maxDepth || 5, LIMITS.MAX_SEARCH_DEPTH);
            const maxResults = Math.min(args.maxResults || 50, LIMITS.MAX_SEARCH_RESULTS);
            const excludePatterns = [...EXCLUDED_DIRS, ...(args.exclude || [])];
            const includePatterns = args.include || [];
            const regex = args.regex || false;

            interface SearchResult {
                file: string;
                type: 'name' | 'content';
                matches?: Array<{
                    lineNum: number;
                    line: string;
                    preview: string;
                }>;
            }

            const results: SearchResult[] = [];
            let filesScanned = 0;

            const searchDir = async (currentPath: string, depth: number, relativePath: string = '') => {
                if (depth > maxDepth || results.length >= maxResults) return;

                let items: string[];
                try {
                    items = fs.readdirSync(currentPath);
                } catch {
                    return;
                }

                for (const item of items) {
                    if (results.length >= maxResults) break;

                    const itemPath = path.join(currentPath, item);
                    const itemRelative = relativePath ? `${relativePath}/${item}` : item;

                    try {
                        const itemStats = fs.statSync(itemPath);

                        if (itemStats.isDirectory()) {
                            // 检查是否应排除
                            if (shouldExclude(item, excludePatterns)) {
                                continue;
                            }
                            await searchDir(itemPath, depth + 1, itemRelative);
                        } else if (itemStats.isFile()) {
                            filesScanned++;

                            // 检查 include 模式
                            if (includePatterns.length > 0) {
                                const matches = includePatterns.some(pattern =>
                                    matchPattern(item, pattern, false)
                                );
                                if (!matches) continue;
                            }

                            // 搜索文件名
                            if (args.name && matchPattern(itemRelative, args.name, regex)) {
                                results.push({
                                    file: itemRelative,
                                    type: 'name'
                                });
                                continue; // 找到文件名匹配，跳过内容搜索
                            }

                            // 搜索文件内容
                            if (args.content) {
                                // 跳过二进制文件和大文件
                                if (itemStats.size > LIMITS.MAX_FILE_SIZE) continue;
                                const fileType = detectFileType(itemPath);
                                if (fileType !== 'text') continue;

                                try {
                                    const matches = await utilSearchInFile(itemPath, args.content, {
                                        regex,
                                        caseSensitive: args.caseSensitive,
                                        contextLines: args.contextLines || 2,
                                        maxMatches: 5
                                    });

                                    if (matches.length > 0) {
                                        results.push({
                                            file: itemRelative,
                                            type: 'content',
                                            matches: matches.map(m => ({
                                                lineNum: m.lineNum,
                                                line: m.line,
                                                preview: m.line.substring(0, 100)
                                            }))
                                        });
                                    }
                                } catch {
                                    // 跳过无法读取的文件
                                }
                            }
                        }
                    } catch {
                        // 跳过无法访问的项
                    }
                }
            };

            await searchDir(dirPath, 0);

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    directory: dirPath,
                    searchName: args.name,
                    searchContent: args.content,
                    results,
                    filesScanned,
                    reachedLimit: results.length >= maxResults
                }
            };

        } catch (error: any) {
            const err = handleFileError(error, args.path);
            return { status: ToolExecuteStatus.ERROR, error: err.message };
        }
    },

    formatForLLM: (data: any) => {
        const { directory, results, filesScanned, reachedLimit, searchName, searchContent } = data;
        const dirName = directory.split(/[\\/]/).pop() || directory;

        if (results.length === 0) {
            return `在 ${dirName} 中未找到匹配的文件（已扫描 ${filesScanned} 个文件）`;
        }

        let output = `🔍 在 ${dirName} 中找到 ${results.length} 个匹配`;
        if (reachedLimit) output += '（已达上限）';
        output += `\n扫描了 ${filesScanned} 个文件\n\n`;

        const nameMatches = results.filter((r: any) => r.type === 'name');
        const contentMatches = results.filter((r: any) => r.type === 'content');

        if (nameMatches.length > 0) {
            output += `📁 文件名匹配 (${nameMatches.length}):\n`;
            nameMatches.forEach((r: any, i: number) => {
                output += `  ${i + 1}. ${r.file}\n`;
            });
            output += '\n';
        }

        if (contentMatches.length > 0) {
            output += `📝 内容匹配 (${contentMatches.length}):\n`;
            contentMatches.forEach((r: any, i: number) => {
                output += `  ${i + 1}. ${r.file}\n`;
                r.matches.slice(0, 3).forEach((m: any) => {
                    output += `     L${m.lineNum}: ${m.preview}${m.preview.length === 100 ? '...' : ''}\n`;
                });
                if (r.matches.length > 3) {
                    output += `     ... 还有 ${r.matches.length - 3} 处匹配\n`;
                }
            });
        }

        return output.trim();
    }
};

// ============================================================
// 3. List - 目录列表工具
// ============================================================

export const listTool: Tool = {
    declaredReturnType: {
        type: `{
    directory: string;      // 目录路径
    tree: TreeNode;         // 结构化的树数据（根节点）
    itemCount: number;      // 总项目数
    truncated: boolean;     // 是否被截断
}

interface TreeNode {
    name: string;           // 文件/目录名
    type: 'file' | 'dir';   // 类型
    size?: number;          // 文件大小（字节）
    sizeFormatted?: string; // 格式化的大小
    children?: TreeNode[];  // 子节点（仅目录）
}`,
        note: '结构化的目录树，tree 字段包含完整的层级结构，便于编程处理'
    },

    definition: {
        type: 'function',
        function: {
            name: 'fs.List',
            description: `列出目录内容，支持树状和扁平两种显示方式。

**特性**：
✓ 树状或扁平显示
✓ 支持文件名过滤
✓ 可选显示文件大小
✓ 自动排除隐藏文件和常见无关目录`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '目录路径'
                    },
                    tree: {
                        type: 'boolean',
                        description: '是否树状显示（默认 true）'
                    },
                    pattern: {
                        type: 'string',
                        description: '文件名过滤模式（支持通配符：*.ts）'
                    },
                    depth: {
                        type: 'number',
                        description: '递归深度（默认 2）',
                        minimum: 1,
                        maximum: 8
                    },
                    showSize: {
                        type: 'boolean',
                        description: '显示文件大小（默认 true）'
                    },
                    showHidden: {
                        type: 'boolean',
                        description: '显示隐藏文件（默认 false）'
                    },
                    onlyFiles: {
                        type: 'boolean',
                        description: '只显示文件（默认 false）'
                    },
                    onlyDirs: {
                        type: 'boolean',
                        description: '只显示目录（默认 false）'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: {
        path: string;
        tree?: boolean;
        pattern?: string;
        depth?: number;
        showSize?: boolean;
        showHidden?: boolean;
        onlyFiles?: boolean;
        onlyDirs?: boolean;
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
        }

        try {
            const dirPath = path.resolve(args.path);

            if (!fs.existsSync(dirPath)) {
                return { status: ToolExecuteStatus.ERROR, error: `目录不存在: ${dirPath}` };
            }

            const stats = fs.statSync(dirPath);
            if (!stats.isDirectory()) {
                return { status: ToolExecuteStatus.ERROR, error: `不是目录: ${dirPath}` };
            }

            const useTree = args.tree !== false;
            const maxDepth = Math.min(args.depth || 2, 8);
            const showSize = args.showSize !== false;
            const showHidden = args.showHidden || false;
            const onlyFiles = args.onlyFiles || false;
            const onlyDirs = args.onlyDirs || false;

            interface TreeNode {
                name: string;
                type: 'file' | 'dir';
                size?: number;
                children?: TreeNode[];
                sizeFormatted?: string;
            }

            let itemCount = 0;

            const buildTree = (currentPath: string, depth: number, name: string): TreeNode | null => {
                if (depth > maxDepth || itemCount >= LIMITS.MAX_LIST_ITEMS) {
                    return null;
                }

                try {
                    const itemStats = fs.statSync(currentPath);
                    const isDir = itemStats.isDirectory();

                    // 过滤逻辑
                    if (!showHidden && name.startsWith('.')) return null;
                    if (onlyFiles && isDir) return null;
                    if (onlyDirs && !isDir) return null;
                    if (args.pattern && !isDir && !matchPattern(name, args.pattern, false)) {
                        return null;
                    }

                    itemCount++;

                    if (isDir) {
                        // 排除常见无关目录
                        if (EXCLUDED_DIRS.includes(name)) {
                            return { name, type: 'dir' }; // 显示但不展开
                        }

                        let items: string[];
                        try {
                            items = fs.readdirSync(currentPath);
                        } catch {
                            return { name, type: 'dir' }; // 无法读取的目录
                        }

                        const children: TreeNode[] = [];
                        for (const item of items) {
                            if (itemCount >= LIMITS.MAX_LIST_ITEMS) break;
                            const child = buildTree(path.join(currentPath, item), depth + 1, item);
                            if (child) children.push(child);
                        }

                        return { name, type: 'dir', children };
                    } else {
                        return {
                            name,
                            type: 'file',
                            size: showSize ? itemStats.size : undefined,
                            sizeFormatted: showSize ? formatFileSize(itemStats.size) : undefined
                        };
                    }
                } catch {
                    return null;
                }
            };

            const formatTree = (node: TreeNode, prefix: string = '', isLast: boolean = true): string[] => {
                const lines: string[] = [];
                const connector = isLast ? '└── ' : '├── ';
                const newPrefix = prefix + (isLast ? '    ' : '│   ');

                let display = node.name;
                if (node.type === 'dir') {
                    display += '/';
                } else if ((node as any).sizeFormatted) {
                    display += ` (${(node as any).sizeFormatted})`;
                }

                lines.push(prefix + connector + display);

                if (node.children && node.children.length > 0) {
                    node.children.forEach((child, i) => {
                        const childIsLast = i === node.children!.length - 1;
                        lines.push(...formatTree(child, newPrefix, childIsLast));
                    });
                }

                return lines;
            };

            const formatFlat = (node: TreeNode, relativePath: string = ''): string[] => {
                const lines: string[] = [];
                const currentPath = relativePath ? `${relativePath}/${node.name}` : node.name;

                if (node.type === 'file') {
                    let line = currentPath;
                    if ((node as any).sizeFormatted) {
                        line += ` (${(node as any).sizeFormatted})`;
                    }
                    lines.push(line);
                } else if (node.type === 'dir' && (!onlyFiles || node.children)) {
                    if (!onlyFiles) {
                        lines.push(currentPath + '/');
                    }
                    if (node.children) {
                        for (const child of node.children) {
                            lines.push(...formatFlat(child, currentPath));
                        }
                    }
                }

                return lines;
            };

            const root = buildTree(dirPath, 0, path.basename(dirPath));
            if (!root) {
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        directory: dirPath,
                        tree: { name: path.basename(dirPath), type: 'dir' as const, children: [] },
                        itemCount: 0,
                        truncated: false
                    }
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    directory: dirPath,
                    tree: root,
                    itemCount,
                    truncated: itemCount >= LIMITS.MAX_LIST_ITEMS
                }
            };

        } catch (error: any) {
            const err = handleFileError(error, args.path);
            return { status: ToolExecuteStatus.ERROR, error: err.message };
        }
    },

    formatForLLM: (data: any) => {
        const { directory, tree, itemCount, truncated } = data;
        const dirName = directory.split(/[\\/]/).pop() || directory;

        // 从 tree 生成格式化文本
        const formatTree = (node: any, prefix: string = '', isLast: boolean = true): string[] => {
            const lines: string[] = [];
            const connector = isLast ? '└── ' : '├── ';
            const newPrefix = prefix + (isLast ? '    ' : '│   ');

            let display = node.name;
            if (node.type === 'dir') {
                display += '/';
            } else if (node.sizeFormatted) {
                display += ` (${node.sizeFormatted})`;
            }

            lines.push(prefix + connector + display);

            if (node.children && node.children.length > 0) {
                node.children.forEach((child: any, i: number) => {
                    const childIsLast = i === node.children.length - 1;
                    lines.push(...formatTree(child, newPrefix, childIsLast));
                });
            }

            return lines;
        };

        const text = formatTree(tree).join('\n');

        let header = `📂 ${dirName} (${itemCount} 项)`;
        if (truncated) header += ' [已截断]';

        return `${header}\n${'─'.repeat(60)}\n${text}`;
    }
};

// ============================================================
// 4. Inspect - 文件元信息工具
// ============================================================

export const inspectTool: Tool = {
    SKIP_CACHE_RESULT: true,

    declaredReturnType: {
        type: `{
    path: string;           // 文件绝对路径
    name: string;           // 文件/目录名
    type: 'text' | 'binary' | 'directory';  // 类型
    size: string;           // 格式化的大小（如 "1.5 MB"）
    sizeBytes: number;      // 字节数
    created: string;        // ISO 时间字符串
    modified: string;       // ISO 时间字符串
    accessed: string;       // ISO 时间字符串
    lines?: number;         // 文本文件的行数
    language?: string;      // 文本文件的语言（根据扩展名）
    itemCount?: number;     // 目录包含的项目数
}`,
        note: '结构化的文件元信息，包含类型、大小、时间等'
    },

    definition: {
        type: 'function',
        function: {
            name: 'fs.Inspect',
            description: `检查文件或目录的详细元信息。

**返回信息**：
- 文件类型（text/binary/directory）
- 文件大小
- 创建/修改时间
- 文本文件：行数、编码检测
- 目录：子项数量

**使用场景**：
- 在读取前检查文件大小
- 确认文件类型
- 快速统计行数`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件或目录路径'
                    }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { path: string }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
        }

        try {
            const filePath = path.resolve(args.path);

            if (!fs.existsSync(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `路径不存在: ${filePath}` };
            }

            const stats = fs.statSync(filePath);
            const fileType = detectFileType(filePath);

            const info: any = {
                path: filePath,
                name: path.basename(filePath),
                type: fileType,
                size: formatFileSize(stats.size),
                sizeBytes: stats.size,
                created: stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString(),
                accessed: stats.atime.toISOString()
            };

            if (fileType === 'directory') {
                try {
                    const items = fs.readdirSync(filePath);
                    info.itemCount = items.length;
                } catch {
                    info.itemCount = 0;
                }
            } else if (fileType === 'text') {
                // 统计行数
                try {
                    const lineCount = await countLines(filePath);
                    info.lines = lineCount;
                } catch {
                    info.lines = null;
                }

                // 检测语言（根据扩展名）
                const ext = path.extname(filePath).slice(1).toLowerCase();
                const langMap: Record<string, string> = {
                    js: 'JavaScript', ts: 'TypeScript', jsx: 'React', tsx: 'React/TypeScript',
                    py: 'Python', rb: 'Ruby', java: 'Java', cpp: 'C++', c: 'C', h: 'C/C++',
                    go: 'Go', rs: 'Rust', php: 'PHP', swift: 'Swift',
                    html: 'HTML', css: 'CSS', scss: 'SCSS',
                    json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
                    md: 'Markdown', txt: 'Plain Text'
                };
                info.language = langMap[ext] || null;
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: info
            };

        } catch (error: any) {
            const err = handleFileError(error, args.path);
            return { status: ToolExecuteStatus.ERROR, error: err.message };
        }
    },

    formatForLLM: (data: any) => {
        const { name, type, size, lines, language, itemCount, modified } = data;

        let output = `📋 ${name}\n`;
        output += `类型: ${type === 'text' ? '文本文件' : type === 'binary' ? '二进制文件' : '目录'}\n`;
        output += `大小: ${size}\n`;

        if (type === 'text') {
            if (lines !== null) output += `行数: ${lines}\n`;
            if (language) output += `语言: ${language}\n`;
        }

        if (type === 'directory') {
            output += `包含: ${itemCount} 项\n`;
        }

        output += `修改: ${new Date(modified).toLocaleString()}`;

        return output;
    }
};

// ============================================================
// 导出工具组
// ============================================================

export const viewerTools = {
    name: '文件查看工具组',
    tools: fs ? [
        viewTool,
        searchTool,
        listTool,
        inspectTool
    ] : [],
    rulePrompt: `
## 文件查看工具组使用指南

你有 4 个专业的文件查看工具：

### 1. View - 智能文件查看
**场景**: 查看文件内容

**模式选择**:
- \`preview\` (默认): 智能预览，自动处理大文件
- \`full\`: 完整内容（<10MB）
- \`head\`: 前 N 行（查看文件开头）
- \`tail\`: 后 N 行（查看日志文件末尾）
- \`range\`: 指定行范围

**示例**:
\`\`\`
View({ path: "app.js" })                    # 智能预览
View({ path: "app.log", mode: "tail" })     # 查看日志末尾
View({ path: "data.csv", range: [100, 200] }) # 查看第 100-200 行
\`\`\`

### 2. Search - 统一搜索
**场景**: 查找文件或内容

**搜索类型**:
- \`name\`: 搜索文件名（支持通配符 *.ts）
- \`content\`: 搜索文件内容
- 可同时指定两者

**示例**:
\`\`\`
Search({ path: ".", name: "*.test.ts" })           # 查找测试文件
Search({ path: ".", content: "TODO" })             # 查找包含 TODO 的文件
Search({ path: ".", name: "*.js", content: "API" }) # 组合搜索
\`\`\`

### 3. List - 目录列表
**场景**: 浏览目录结构

**显示方式**:
- \`tree: true\` (默认): 树状显示
- \`tree: false\`: 扁平列表

**示例**:
\`\`\`
List({ path: "src" })                          # 树状显示项目结构
List({ path: "src", pattern: "*.ts" })         # 只显示 TypeScript 文件
List({ path: ".", depth: 1, onlyDirs: true })  # 只显示一级子目录
\`\`\`

### 4. Inspect - 文件元信息
**场景**: 快速了解文件基本信息

**示例**:
\`\`\`
Inspect({ path: "large-file.log" })  # 查看大小、行数等
\`\`\`

## 最佳实践

1. **查看前先检查**: 对未知文件先用 \`Inspect\` 查看大小和类型
2. **大文件处理**: 
   - 日志文件用 \`tail\` 模式
   - CSV 文件用 \`range\` 查看特定部分
3. **搜索优化**: 
   - 使用 \`include\` 限制文件类型
   - 调整 \`maxDepth\` 控制搜索范围
4. **避免**: 
   - ❌ 对大文件使用 \`full\` 模式
   - ❌ 在 node_modules 目录搜索
`.trim()
};
