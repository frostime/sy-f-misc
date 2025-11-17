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
        const prefix = (i + 1) === highlight ? '→' : ' ';
        result.push(`${prefix} ${(i + 1).toString().padStart(4)}: ${lines[i]}`);
    }
    return result.join('\n');
};

/**
 * 编辑操作接口
 */
interface EditOperation {
    type: 'replace' | 'insert' | 'delete';
    line: number;           // 起始行号（1-based，基于原始文件）
    endLine?: number;       // 结束行号（仅用于 replace/delete，1-based）
    position?: 'before' | 'after';  // 插入位置（仅用于 insert）
    content?: string;       // 新内容（用于 replace/insert）
}

/**
 * 批量编辑结果
 */
interface BatchEditResult {
    success: boolean;
    lines?: string[];
    error?: string;
    details: string;
}

/**
 * 核心函数：批量应用编辑操作
 * 
 * 关键算法：从后向前执行操作，确保所有操作都基于原始行号
 * 
 * @param lines 原始文件行数组
 * @param operations 编辑操作列表
 * @param totalLines 原始文件总行数
 * @returns 批量编辑结果
 */
const applyBatchEdits = (
    lines: string[],
    operations: EditOperation[],
    totalLines: number
): BatchEditResult => {
    const getAffectedPosition = (op: EditOperation): number => {
        const baseLine = op.line - 1;
        if (op.type === 'insert') {
            return baseLine + (op.position === 'after' ? 1 : 0);
        }
        return (op.endLine ?? op.line) - 1;
    };

    // 验证阶段：检查所有操作的行号是否有效
    for (const op of operations) {
        if (op.line < 1 || op.line > totalLines) {
            return {
                success: false,
                error: `操作 ${op.type} 的行号 ${op.line} 超出范围 [1, ${totalLines}]`,
                details: ''
            };
        }

        if (op.type === 'replace' || op.type === 'delete') {
            if (op.endLine === undefined) {
                return {
                    success: false,
                    error: `操作 ${op.type} 缺少 endLine 参数`,
                    details: ''
                };
            }
            if (op.endLine < op.line || op.endLine > totalLines) {
                return {
                    success: false,
                    error: `操作 ${op.type} 的 endLine ${op.endLine} 无效（line: ${op.line}, totalLines: ${totalLines}）`,
                    details: ''
                };
            }
        }

        if (op.type === 'insert') {
            if (!op.position || !['before', 'after'].includes(op.position)) {
                return {
                    success: false,
                    error: `操作 insert 的 position 参数必须是 'before' 或 'after'`,
                    details: ''
                };
            }
            if (op.content === undefined) {
                return {
                    success: false,
                    error: `操作 insert 缺少 content 参数`,
                    details: ''
                };
            }
        }

        if (op.type === 'replace' && op.content === undefined) {
            return {
                success: false,
                error: `操作 replace 缺少 content 参数`,
                details: ''
            };
        }
    }

    // 排序阶段：按照"影响位置"降序排序（从文件末尾向开头处理）
    const sortedOps = [...operations].sort((a, b) => getAffectedPosition(b) - getAffectedPosition(a));

    // 执行阶段：依次执行排序后的操作
    const resultLines = [...lines];
    const details: string[] = [];

    for (const op of sortedOps) {
        const lineIndex = op.line - 1;
        const endLineIndex = op.endLine !== undefined ? op.endLine - 1 : undefined;
        switch (op.type) {
            case 'replace': {
                const originalLines = resultLines.slice(lineIndex, endLineIndex! + 1);
                const newLines = op.content!.split('\n');
                resultLines.splice(lineIndex, endLineIndex! - lineIndex + 1, ...newLines);
                details.push(
                    `✓ Replace [${op.line}-${op.endLine}]: ${originalLines.length} 行 → ${newLines.length} 行`
                );
                break;
            }
            case 'insert': {
                const insertIndex = op.position === 'before' ? lineIndex : lineIndex + 1;
                const newLines = op.content!.split('\n');
                resultLines.splice(insertIndex, 0, ...newLines);
                details.push(
                    `✓ Insert at ${op.line} (${op.position}): ${newLines.length} 行`
                );
                break;
            }
            case 'delete': {
                const deletedLines = resultLines.slice(lineIndex, endLineIndex! + 1);
                resultLines.splice(lineIndex, endLineIndex! - lineIndex + 1);
                details.push(
                    `✓ Delete [${op.line}-${op.endLine}]: ${deletedLines.length} 行`
                );
                break;
            }
        }
    }

    return {
        success: true,
        lines: resultLines,
        details: details.reverse().join('\n') // 反转以恢复原始顺序显示
    };
};

/**
 * BatchEdit 工具：批量执行多个编辑操作
 */
export const batchEditTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'BatchEdit',
            description: '批量执行多个文件编辑操作。所有操作基于原始文件的行号，自动处理行号偏移问题。这是执行多个编辑的推荐方式。',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    operations: {
                        type: 'array',
                        description: '编辑操作列表，将按照从后向前的顺序自动执行',
                        items: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['replace', 'insert', 'delete'],
                                    description: '操作类型：replace=替换, insert=插入, delete=删除'
                                },
                                line: {
                                    type: 'number',
                                    description: '起始行号（从1开始计数，基于原始文件）',
                                    minimum: 1
                                },
                                endLine: {
                                    type: 'number',
                                    description: '结束行号（仅 replace/delete 需要，1-based）',
                                    minimum: 1
                                },
                                position: {
                                    type: 'string',
                                    enum: ['before', 'after'],
                                    description: '插入位置（仅 insert 需要）：before=行前, after=行后'
                                },
                                content: {
                                    type: 'string',
                                    description: '新内容（replace/insert 需要）'
                                }
                            },
                            required: ['type', 'line']
                        }
                    }
                },
                required: ['path', 'operations']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: {
        path: string;
        operations: EditOperation[]
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

        if (!args.operations || args.operations.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '操作列表不能为空'
            };
        }

        try {
            const lines = readFileLines(filePath);
            const totalLines = lines.length;

            // 执行批量编辑
            const result = applyBatchEdits(lines, args.operations, totalLines);

            if (!result.success) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: result.error!
                };
            }

            // 写入文件
            writeFileLines(filePath, result.lines!);

            // 构建结果信息
            let resultMsg = `✓ 成功在 ${path.basename(filePath)} 中执行 ${args.operations.length} 个批量操作\n\n`;
            resultMsg += `文件变化: ${totalLines} 行 → ${result.lines!.length} 行\n\n`;
            resultMsg += `--- 执行详情 ---\n${result.details}`;

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: resultMsg
            };

        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `批量编辑失败: ${error.message}`
            };
        }
    }
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
                        description: '起始行号（从 1 开始，闭区间）',
                        minimum: 1
                    },
                    endLine: {
                        type: 'number',
                        description: '结束行号（从 1 开始，闭区间）',
                        minimum: 1
                    },
                    newContent: {
                        type: 'string',
                        description: '新内容（多行文本，将替换指定行范围）'
                    }
                },
                required: ['path', 'beginLine', 'endLine', 'newContent']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
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
            const beginIndex = args.beginLine - 1;
            const endIndex = args.endLine - 1;
            if (beginIndex < 0 || endIndex >= totalLines) {
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
            const originalLines = lines.slice(beginIndex, endIndex + 1);

            // 执行替换
            const newLines = args.newContent.split('\n');
            lines.splice(beginIndex, endIndex - beginIndex + 1, ...newLines);

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
                        description: '插入位置的行号（从 1 开始）',
                        minimum: 1
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
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
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
            if (args.line < 1 || args.line > totalLines) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `行号超出范围。文件总行数: ${totalLines}，请求行号: ${args.line}`
                };
            }

            const lineIndex = args.line - 1;
            // 计算实际插入位置
            const insertIndex = args.position === 'before' ? lineIndex : lineIndex + 1;

            // 插入内容
            const newLines = args.content.split('\n');
            lines.splice(insertIndex, 0, ...newLines);

            // 写入文件
            writeFileLines(filePath, lines);

            // 构建结果信息
            let resultMsg = `✓ 成功在 ${path.basename(filePath)} 的第 ${args.line} 行${args.position === 'before' ? '前' : '后'}插入 ${newLines.length} 行内容\n\n`;
            resultMsg += `--- 插入位置上下文 ---\n`;

            const contextStart = Math.max(0, lineIndex - 2);
            const contextEnd = Math.min(totalLines - 1, lineIndex + 2);
            resultMsg += formatLineRange(lines.slice(0, totalLines), contextStart, contextEnd, lineIndex);

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
                        description: '起始行号（从 1 开始，闭区间）',
                        minimum: 1
                    },
                    endLine: {
                        type: 'number',
                        description: '结束行号（从 1 开始，闭区间）',
                        minimum: 1
                    }
                },
                required: ['path', 'beginLine', 'endLine']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true

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
            const beginIndex = args.beginLine - 1;
            const endIndex = args.endLine - 1;
            if (beginIndex < 0 || endIndex >= totalLines) {
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
            const deletedLines = lines.slice(beginIndex, endIndex + 1);

            // 删除行
            lines.splice(beginIndex, endIndex - beginIndex + 1);

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
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true

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

                resultMsg += `匹配 ${index + 1} (第 ${match.lineNum} 行):\n`;
                resultMsg += formatLineRange(lines, startLine, endLine, lineIndex);
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
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true

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
                    resultMsg += `   ${matchIndex + 1}) 第 ${match.lineNum} 行:\n`;
                    resultMsg += `      ${match.preview}\n`;
                });

                if (result.matches.length > maxMatchesToShow) {
                    resultMsg += `   ... 还有 ${result.matches.length - maxMatchesToShow} 处匹配未显示\n`;
                }

                resultMsg += '\n';
            });

            if (results.length >= maxResults) {
                resultMsg += `(已达到最大文件数 ${maxResults}，可能有更多匹配文件)`;
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
        batchEditTool,          // 批量编辑（推荐）
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

**批量编辑工具（推荐）**:
- BatchEdit: 一次性执行多个编辑操作（替换、插入、删除），自动处理行号偏移
  - 所有操作基于原始文件的行号
  - 自动按照从后向前的顺序执行，避免行号冲突
  - 支持混合不同类型的操作
  - 示例：[{type: 'replace', line: 10, endLine: 15, content: '...'}, {type: 'insert', line: 5, position: 'after', content: '...'}]

**单次编辑工具**:
- ReplaceLines: 替换指定行范围的内容
- InsertLines: 在指定位置插入新内容
- DeleteLines: 删除指定行范围
- ReplaceString: 字符串查找替换（支持正则）

**搜索工具**:
- SearchInFile: 在文件中搜索并显示上下文
- SearchInDirectory: 在目录中搜索包含特定内容的文件

**使用建议**:
0. 指定编辑某个文件前，使用 fileState 查看文件的大小、行数
1. 用 ReadFile 查看文件内容; 每次读取建议指定行号
2. 使用 SearchInFile 定位需要修改的具体位置
3. 行号统一从 1 开始计数
4. **需要多处修改时，优先使用 BatchEdit 工具，一次性完成所有编辑**
5. 复杂修改建议分步进行，每次修改后验证结果
6. 使用 ReplaceString 进行批量重命名或格式调整
`.trim()
};
