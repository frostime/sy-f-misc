/**
 * 文件查看工具：fs-View
 * 直接使用 Node.js API，不依赖 VFS 抽象
 */

import { Tool, ToolExecuteResult, ToolExecuteStatus } from "../types";
import {
    LIMITS,
    detectFileType, safeReadFile,
    readFirstLines, readLastLines, readLineRange, countLines,
    formatFileSize, addLineNumbers,
    handleFileError
} from './viewer-utils';

const nodeFs: typeof import('fs') = window?.require?.('fs');
const nodePath: typeof import('path') = window?.require?.('path');

// ============================================================
// fs-View
// ============================================================

export const viewTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs-View',
            description: '智能查看文件内容。支持完整读取、头部/尾部预览、指定行范围读取。自动处理大文件和二进制文件。',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径（相对或绝对路径）'
                    },
                    mode: {
                        type: 'string',
                        enum: ['full', 'head', 'tail', 'range'],
                        description: '读取模式：full=完整文件，head=前N行，tail=后N行，range=指定行范围。不指定时自动选择'
                    },
                    lines: {
                        type: 'number',
                        minimum: 1,
                        maximum: 1000,
                        description: 'head/tail 模式：要读取的行数（1-1000），默认50行'
                    },
                    range: {
                        type: 'array',
                        items: { type: 'number' },
                        description: 'range 模式：[起始行, 结束行]，1-based 包含边界'
                    },
                    showLineNumbers: {
                        type: 'boolean',
                        description: '是否显示行号，默认 false'
                    }
                },
                required: ['path']
            }
        },
    },
    permission: {
        executionPolicy: 'ask-once',
        resultApprovalPolicy: 'always'
    },
    execute: async (args): Promise<ToolExecuteResult> => {
        try {
            const filePath = nodePath.resolve(args.path);
            if (!nodeFs.existsSync(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
            }

            const showLineNumbers = !!args.showLineNumbers;
            const stats = nodeFs.statSync(filePath);
            const fileType = await detectFileType(filePath);
            if (fileType === 'directory') return { status: ToolExecuteStatus.ERROR, error: '目录无法读取' };
            if (fileType === 'binary') return { status: ToolExecuteStatus.ERROR, error: `二进制文件（${formatFileSize(stats.size)}），无法文本查看` };

            let content = '';
            let totalLines: number | undefined;
            let displayRange = '';
            let mode = args.mode;

            if (mode === 'full') {
                const res = await safeReadFile(filePath, LIMITS.MAX_FILE_SIZE);
                if (res.error) return { status: ToolExecuteStatus.ERROR, error: res.error };
                content = res.content!;
                totalLines = content.split('\n').length;
                displayRange = `1-${totalLines}`;
            } else if (mode === 'head') {
                const n = Math.min(args.lines || 50, 1000);
                const lines = await readFirstLines(filePath, n);
                content = lines.join('\n');
                totalLines = await countLines(filePath);
                displayRange = `1-${lines.length}`;
            } else if (mode === 'tail') {
                const n = Math.min(args.lines || 50, 1000);
                const lines = await readLastLines(filePath, n);
                content = lines.join('\n');
                totalLines = await countLines(filePath);
                const startLine = Math.max(1, totalLines - lines.length + 1);
                displayRange = `${startLine}-${totalLines}`;
            } else if (mode === 'range') {
                if (!args.range || args.range.length !== 2) {
                    return { status: ToolExecuteStatus.ERROR, error: 'range 需要 [start, end]' };
                }
                const [start, end] = args.range;
                if (start < 1 || end < start) return { status: ToolExecuteStatus.ERROR, error: '无效行范围' };
                const res = await readLineRange(filePath, start, end);
                content = res.lines.join('\n');
                totalLines = res.totalLines;
                displayRange = `${start}-${Math.min(end, totalLines || end)}`;
            } else {
                // 自动模式
                mode = 'auto';
                if (stats.size <= LIMITS.MAX_FILE_SIZE) {
                    const res = await safeReadFile(filePath);
                    if (res.error) {
                        const lines = await readFirstLines(filePath, LIMITS.MAX_PREVIEW_LINES);
                        content = lines.join('\n');
                        totalLines = await countLines(filePath);
                        displayRange = `1-${lines.length}`;
                    } else {
                        content = res.content!;
                        totalLines = content.split('\n').length;
                        displayRange = `1-${totalLines}`;
                    }
                } else {
                    const lines = await readFirstLines(filePath, LIMITS.MAX_PREVIEW_LINES);
                    content = lines.join('\n');
                    totalLines = await countLines(filePath);
                    displayRange = `1-${lines.length}`;
                }
            }

            if (showLineNumbers) {
                const startLine = parseInt(displayRange.split('-')[0]);
                content = addLineNumbers(content, startLine);
            }

            const [rs, re] = displayRange.split('-').map(Number);
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    path: filePath,
                    fileName: nodePath.basename(filePath),
                    content, mode,
                    range: { start: rs, end: re },
                    totalLines,
                    size: formatFileSize(stats.size),
                    sizeBytes: stats.size
                }
            };
        } catch (error) {
            const err = handleFileError(error, args.path);
            return { status: ToolExecuteStatus.ERROR, error: err.message };
        }
    },
    formatForLLM: (data: any) => {
        const fileName = data.fileName || data.path;
        let header = `📄 ${fileName}`;
        if (data.totalLines) header += ` (显示 ${data.range.start}-${data.range.end} / 共 ${data.totalLines} 行)`;
        if (data.mode === 'auto' && data.range.end !== data.totalLines) header += ' [智能模式: 部分显示]';
        return `${header}\n${'─'.repeat(60)}\n${data.content}`;
    }
};
