import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

/**
 * 文件编辑工具组
 * 提供类似 Cursor/Copilot 的文件编辑能力
 */

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');
const path = window?.require?.('path');

if (!fs || !path) {
    console.warn('[editor] Node.js fs/path module not found. Editor tools are disabled.');
}

/**
 * 辅助函数：读取文件并分割成行数组
 */
const readFileLines = (filePath: string): string[] => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n');
};

/**
 * 辅助函数：将行数组写入文件
 */
const writeFileLines = (filePath: string, lines: string[]): void => {
    const content = lines.join('\n');
    fs.writeFileSync(filePath, content, 'utf-8');
};

/**
 * 辅助函数：格式化行范围显示
 */
const formatLineRange = (lines: string[], start: number, end: number, highlight?: number): string => {
    const result: string[] = [];
    for (let i = start; i <= end; i++) {
        const prefix = i === highlight ? '→' : ' ';
        result.push(`${prefix} ${i.toString().padStart(4)}: ${lines[i]}`);
    }
    return result.join('\n');
};

/**
 * ReplaceLines 工具：替换指定行范围的内容
 */
export const replaceLinesTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'ReplaceLines',
            description: '替换文件中指定行范围的内容（闭区间），这是最核心的编辑操作',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    beginLine: {
                        type: 'number',
                        description: '起始行号（从 0 开始，闭区间）',
                        minimum: 0
                    },
                    endLine: {
                        type: 'number',
                        description: '结束行号（从 0 开始，闭区间）',
                        minimum: 0
                    },
                    newContent: {
                        type: 'string',
                        description: '新内容（多行文本，将替换指定行范围）'
                    }
                },
                required: ['path', 'beginLine', 'endLine', 'newContent']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { 
        path: string; 
        beginLine: number; 
        endLine: number; 
        newContent: string 
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }

        const filePath = path.resolve(args.path);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件不存在: ${filePath}`
            };
        }

        try {
            const lines = readFileLines(filePath);
            const totalLines = lines.length;

            // 验证行号范围
            if (args.beginLine < 0 || args.endLine >= totalLines) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `行号超出范围。文件总行数: ${totalLines}，请求范围: [${args.beginLine}, ${args.endLine}]`
                };
            }

            if (args.beginLine > args.endLine) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `起始行号(${args.beginLine})不能大于结束行号(${args.endLine})`
                };
            }

            // 保存原始内容（用于显示）
            const originalLines = lines.slice(args.beginLine, args.endLine + 1);

            // 执行替换
            const newLines = args.newContent.split('\n');
            lines.splice(args.beginLine, args.endLine - args.beginLine + 1, ...newLines);

            // 写入文件
            writeFileLines(filePath, lines);

            // 构建结果信息
            const replacedCount = args.endLine - args.beginLine + 1;
            const newCount = newLines.length;
            
            let resultMsg = `✓ 成功替换 ${path.basename(filePath)} 的第 ${args.beginLine}-${args.endLine} 行\n`;
            resultMsg += `  原始: ${replacedCount} 行 → 新内容: ${newCount} 行\n\n`;
            resultMsg += `--- 原始内容 ---\n${originalLines.join('\n')}\n\n`;
            resultMsg += `--- 新内容 ---\n${args.newContent}`;

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: resultMsg
            };

        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `替换失败: ${error.message}`
            };
        }
    }
};

/**
 * InsertLines 工具：在指定位置插入内容
 */
export const insertLinesTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'InsertLines',
            description: '在文件的指定行之前或之后插入新内容',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    line: {
                        type: 'number',
                        description: '插入位置的行号（从 0 开始）',
                        minimum: 0
                    },
                    position: {
                        type: 'string',
                        enum: ['before', 'after'],
                        description: '在该行之前(before)还是之后(after)插入'
                    },
                    content: {
                        type: 'string',
                        description: '要插入的内容（多行文本）'
                    }
                },
                required: ['path', 'line', 'position', 'content']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { 
        path: string; 
        line: number; 
        position: 'before' | 'after'; 
        content: string 
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }

        const filePath = path.resolve(args.path);

        if (!fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件不存在: ${filePath}`
            };
        }

        try {
            const lines = readFileLines(filePath);
            const totalLines = lines.length;

            // 验证行号
            if (args.line < 0 || args.line >= totalLines) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `行号超出范围。文件总行数: ${totalLines}，请求行号: ${args.line}`
                };
            }

            // 计算实际插入位置
            const insertIndex = args.position === 'before' ? args.line : args.line + 1;

            // 插入内容
            const newLines = args.content.split('\n');
            lines.splice(insertIndex, 0, ...newLines);

            // 写入文件
            writeFileLines(filePath, lines);

            // 构建结果信息
            let resultMsg = `✓ 成功在 ${path.basename(filePath)} 的第 ${args.line} 行${args.position === 'before' ? '前' : '后'}插入 ${newLines.length} 行内容\n\n`;
            resultMsg += `--- 插入位置上下文 ---\n`;
            
            const contextStart = Math.max(0, args.line - 2);
            const contextEnd = Math.min(totalLines - 1, args.line + 2);
            resultMsg += formatLineRange(lines.slice(0, totalLines), contextStart, contextEnd, args.line);
            
            resultMsg += `\n\n--- 插入的内容 ---\n${args.content}`;

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: resultMsg
            };

        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `插入失败: ${error.message}`
            };
        }
    }
};

/**
 * DeleteLines 工具：删除指定行范围
 */
export const deleteLinesTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'DeleteLines',
            description: '删除文件中指定行范围的内容（闭区间）',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    beginLine: {
                        type: 'number',
                        description: '起始行号（从 0 开始，闭区间）',
                        minimum: 0
                    },
                    endLine: {
                        type: 'number',
                        description: '结束行号（从 0 开始，闭区间）',
                        minimum: 0
                    }
                },
                required: ['path', 'beginLine', 'endLine']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { 
        path: string; 
        beginLine: number; 
        endLine: number 
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }

        const filePath = path.resolve(args.path);

        if (!fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件不存在: ${filePath}`
            };
        }

        try {
            const lines = readFileLines(filePath);
            const totalLines = lines.length;

            // 验证行号范围
            if (args.beginLine < 0 || args.endLine >= totalLines) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `行号超出范围。文件总行数: ${totalLines}，请求范围: [${args.beginLine}, ${args.endLine}]`
                };
            }

            if (args.beginLine > args.endLine) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `起始行号(${args.beginLine})不能大于结束行号(${args.endLine})`
                };
            }

            // 保存被删除的内容
            const deletedLines = lines.slice(args.beginLine, args.endLine + 1);

            // 删除行
            lines.splice(args.beginLine, args.endLine - args.beginLine + 1);

            // 写入文件
            writeFileLines(filePath, lines);

            // 构建结果信息
            const deletedCount = args.endLine - args.beginLine + 1;
            let resultMsg = `✓ 成功删除 ${path.basename(filePath)} 的第 ${args.beginLine}-${args.endLine} 行（共 ${deletedCount} 行）\n\n`;
            resultMsg += `--- 已删除的内容 ---\n${deletedLines.join('\n')}`;

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: resultMsg
            };

        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `删除失败: ${error.message}`
            };
        }
    }
};

/**
 * ReplaceString 工具：字符串查找替换
 */
export const replaceStringTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'ReplaceString',
            description: '在文件中查找并替换字符串（支持正则表达式）',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    search: {
                        type: 'string',
                        description: '要查找的字符串或正则表达式'
                    },
                    replace: {
                        type: 'string',
                        description: '替换为的内容'
                    },
                    regex: {
                        type: 'boolean',
                        description: '是否使用正则表达式，默认 false'
                    },
                    replaceAll: {
                        type: 'boolean',
                        description: '是否替换所有匹配（默认只替换第一个），默认 false'
                    }
                },
                required: ['path', 'search', 'replace']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: { 
        path: string; 
        search: string; 
        replace: string; 
        regex?: boolean; 
        replaceAll?: boolean 
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }

        const filePath = path.resolve(args.path);

        if (!fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件不存在: ${filePath}`
            };
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const useRegex = args.regex ?? false;
            const replaceAll = args.replaceAll ?? false;

            let newContent: string;
            let matchCount = 0;

            if (useRegex) {
                // 使用正则表达式
                try {
                    const flags = replaceAll ? 'g' : '';
                    const regex = new RegExp(args.search, flags);
                    
                    // 统计匹配次数
                    const matches = content.match(new RegExp(args.search, 'g'));
                    matchCount = matches ? matches.length : 0;
                    
                    newContent = content.replace(regex, args.replace);
                } catch (error: any) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `无效的正则表达式: ${error.message}`
                    };
                }
            } else {
                // 普通字符串替换
                if (replaceAll) {
                    // 统计匹配次数
                    matchCount = (content.match(new RegExp(args.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                    newContent = content.split(args.search).join(args.replace);
                } else {
                    matchCount = content.includes(args.search) ? 1 : 0;
                    newContent = content.replace(args.search, args.replace);
                }
            }

            // 检查是否有变化
            if (newContent === content) {
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: `未找到匹配的内容，文件未修改`
                };
            }

            // 写入文件
            fs.writeFileSync(filePath, newContent, 'utf-8');

            // 构建结果信息
            const actualReplaced = replaceAll ? matchCount : 1;
            let resultMsg = `✓ 成功在 ${path.basename(filePath)} 中完成替换\n`;
            resultMsg += `  匹配模式: ${useRegex ? '正则表达式' : '字符串'}\n`;
            resultMsg += `  替换次数: ${actualReplaced} 处\n`;
            resultMsg += `  总匹配数: ${matchCount}\n\n`;
            resultMsg += `查找: ${args.search}\n`;
            resultMsg += `替换: ${args.replace}`;

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: resultMsg
            };

        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `替换失败: ${error.message}`
            };
        }
    }
};

/**
 * SearchInFile 工具：在文件中搜索内容
 */
export const searchInFileTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'SearchInFile',
            description: '在指定文件中搜索匹配的内容，返回行号和上下文',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    pattern: {
                        type: 'string',
                        description: '搜索模式（支持正则表达式）'
                    },
                    regex: {
                        type: 'boolean',
                        description: '是否使用正则表达式，默认 false'
                    },
                    contextLines: {
                        type: 'number',
                        description: '返回匹配行的上下文行数，默认 2',
                        minimum: 0
                    }
                },
                required: ['path', 'pattern']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: { 
        path: string; 
        pattern: string; 
        regex?: boolean; 
        contextLines?: number 
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }

        const filePath = path.resolve(args.path);

        if (!fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件不存在: ${filePath}`
            };
        }

        try {
            const lines = readFileLines(filePath);
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
                    matches.push({ lineNum: index, line });
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
                const startLine = Math.max(0, match.lineNum - contextLines);
                const endLine = Math.min(lines.length - 1, match.lineNum + contextLines);

                resultMsg += `匹配 ${index + 1} (第 ${match.lineNum} 行):\n`;
                resultMsg += formatLineRange(lines, startLine, endLine, match.lineNum);
                resultMsg += '\n\n';
            });

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: resultMsg.trim()
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
            description: '在指定目录下搜索包含特定内容的文件',
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
                    }
                },
                required: ['path', 'pattern']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: { 
        path: string; 
        pattern: string; 
        filePattern?: string; 
        regex?: boolean; 
        maxResults?: number 
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }

        const dirPath = path.resolve(args.path);

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
            const results: Array<{ file: string; matches: number }> = [];
            
            const searchDir = (currentPath: string, depth: number = 0) => {
                if (depth > 5 || results.length >= maxResults) return; // 限制深度和结果数

                const items = fs.readdirSync(currentPath);

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
                                const content = fs.readFileSync(itemPath, 'utf-8');
                                const matches = content.match(new RegExp(searchRegex, 'g'));
                                
                                if (matches && matches.length > 0) {
                                    results.push({
                                        file: path.relative(dirPath, itemPath),
                                        matches: matches.length
                                    });
                                }
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
            let resultMsg = `在 ${path.basename(dirPath)} 中找到 ${results.length} 个匹配的文件:\n\n`;

            results.forEach((result, index) => {
                resultMsg += `${index + 1}. ${result.file} (${result.matches} 处匹配)\n`;
            });

            if (results.length >= maxResults) {
                resultMsg += `\n(已达到最大结果数 ${maxResults}，可能有更多匹配)`;
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: resultMsg
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
 * 文件编辑工具组
 */
export const editorTools = {
    name: '文件编辑工具组',
    tools: fs ? [
        replaceLinesTool,
        insertLinesTool,
        deleteLinesTool,
        replaceStringTool,
        searchInFileTool,
        searchInDirectoryTool
    ] : [],
    rulePrompt: `
### 文件编辑工具

类似 Cursor/Copilot 的精确文件编辑能力：

**编辑工具**:
- ReplaceLines: 替换指定行范围的内容
- InsertLines: 在指定位置插入新内容
- DeleteLines: 删除指定行范围
- ReplaceString: 字符串查找替换（支持正则）

**搜索工具**:
- SearchInFile: 在文件中搜索并显示上下文
- SearchInDirectory: 在目录中搜索包含特定内容的文件

**使用建议**:
1. 编辑前先用 ReadFile 查看文件内容，确定准确的行号
2. 使用 SearchInFile 定位需要修改的具体位置
3. 行号统一从 0 开始计数
4. 复杂修改建议分步进行，每次修改后验证结果
5. 使用 ReplaceString 进行批量重命名或格式调整
`.trim()
};
