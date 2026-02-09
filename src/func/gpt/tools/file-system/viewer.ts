/**
 * 文件查看工具：fs-View, fs-List, fs-Inspect
 * 直接使用 Node.js API，不依赖 VFS 抽象
 */

import { Tool, ToolExecuteResult, ToolExecuteStatus } from "../types";
import {
    LIMITS, EXCLUDED_DIRS,
    detectFileType, safeReadFile,
    readFirstLines, readLastLines, readLineRange, countLines,
    formatFileSize, addLineNumbers,
    shouldExclude, matchPattern, handleFileError
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
            if (fileType === 'directory') return { status: ToolExecuteStatus.ERROR, error: '目录，请用 List' };
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

// ============================================================
// fs-List
// ============================================================

export const listTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs-List',
            description: '列出目录内容，以树状结构展示。支持深度控制、文件过滤、隐藏文件显示。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '目录路径' },
                    pattern: { type: 'string', description: '文件名过滤（通配符）。如 "*.ts"' },
                    depth: { type: 'number', minimum: 1, maximum: 10, description: '递归深度，默认2' },
                    showSize: { type: 'boolean', description: '显示文件大小，默认 true' },
                    showHidden: { type: 'boolean', description: '显示隐藏文件，默认 false' },
                    onlyFiles: { type: 'boolean', description: '只列出文件' },
                    onlyDirs: { type: 'boolean', description: '只列出目录' },
                    skipDir: { type: 'string', description: '跳过的目录名（逗号分隔），如 "test,dist,tmp"' }
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
            const dirPath = nodePath.resolve(args.path);
            if (!nodeFs.existsSync(dirPath)) return { status: ToolExecuteStatus.ERROR, error: `目录不存在: ${dirPath}` };
            const stat = nodeFs.statSync(dirPath);
            if (!stat.isDirectory()) return { status: ToolExecuteStatus.ERROR, error: `不是目录: ${dirPath}` };

            const maxDepth = Math.min(args.depth || 2, 10);
            const showSize = args.showSize !== false;
            const showHidden = !!args.showHidden;
            const onlyFiles = !!args.onlyFiles;
            const onlyDirs = !!args.onlyDirs;
            const skipDirs = args.skipDir
                ? args.skipDir.split(',').map((d: string) => d.trim()).filter((d: string) => d)
                : EXCLUDED_DIRS;

            interface TreeNode {
                name: string; type: 'file' | 'dir'; size?: number; sizeFormatted?: string; children?: TreeNode[];
                dirStats?: { total: number; files: number; dirs: number; };
            }
            let itemCount = 0;

            const build = async (cur: string, depth: number, name: string): Promise<TreeNode | null> => {
                if (itemCount >= LIMITS.MAX_LIST_ITEMS) return null;
                let s: ReturnType<typeof nodeFs.statSync>;
                try { s = nodeFs.statSync(cur); } catch { return null; }
                const isDir = s.isDirectory();
                if (!showHidden && name.startsWith('.')) return null;
                if (onlyFiles && isDir) return null;
                if (onlyDirs && !isDir) return null;
                if (args.pattern && !isDir && !matchPattern(name, args.pattern, false)) return null;
                itemCount++;
                if (isDir) {
                    let items: string[];
                    try { items = nodeFs.readdirSync(cur); } catch { return { name, type: 'dir', dirStats: { total: 0, files: 0, dirs: 0 } }; }

                    // 计算目录实际内容（不考虑过滤条件）
                    let actualFiles = 0, actualDirs = 0;
                    for (const it of items) {
                        const childPath = nodePath.join(cur, it);
                        try {
                            const childStat = nodeFs.statSync(childPath);
                            if (childStat.isDirectory()) actualDirs++;
                            else actualFiles++;
                        } catch {}
                    }

                    if (skipDirs.includes(name)) {
                        return { name, type: 'dir', dirStats: { total: actualFiles + actualDirs, files: actualFiles, dirs: actualDirs } };
                    }

                    const children: TreeNode[] = [];
                    // 只在未达到深度限制时递归处理子项
                    if (depth < maxDepth) {
                        let filteredFiles = 0, filteredDirs = 0;
                        for (const it of items) {
                            if (itemCount >= LIMITS.MAX_LIST_ITEMS) break;
                            const child = await build(nodePath.join(cur, it), depth + 1, it);
                            if (child) {
                                children.push(child);
                                if (child.type === 'dir') filteredDirs++;
                                else filteredFiles++;
                            }
                        }
                    }
                    return { name, type: 'dir', children, dirStats: { total: actualFiles + actualDirs, files: actualFiles, dirs: actualDirs } };
                }
                return { name, type: 'file', size: showSize ? s.size : undefined, sizeFormatted: showSize ? formatFileSize(s.size) : undefined };
            };

            const root = await build(dirPath, 0, nodePath.basename(dirPath));
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: { directory: dirPath, dirName: nodePath.basename(dirPath), tree: root, itemCount, truncated: itemCount >= LIMITS.MAX_LIST_ITEMS }
            };
        } catch (error) {
            const err = handleFileError(error, args.path);
            return { status: ToolExecuteStatus.ERROR, error: err.message };
        }
    },
    formatForLLM: (data: any) => {
        const dirName = data.dirName || data.directory;
        const formatTree = (node: any, prefix = '', last = true): string[] => {
            const conn = last ? '└── ' : '├── ';
            const next = prefix + (last ? '    ' : '│   ');
            let disp = node.name;
            if (node.type === 'dir') {
                disp += '/';
                if (node.dirStats) {
                    const { total, files, dirs } = node.dirStats;
                    if (total === 0) {
                        disp += ' [空]';
                    } else {
                        const parts = [];
                        if (files > 0) parts.push(`${files}F`);
                        if (dirs > 0) parts.push(`${dirs}D`);
                        disp += ` [${parts.join('+')}]`;
                    }
                }
            } else if (node.sizeFormatted) {
                disp += ` (${node.sizeFormatted})`;
            }
            const lines = [prefix + conn + disp];
            if (node.children) node.children.forEach((c: any, i: number) => { lines.push(...formatTree(c, next, i === node.children.length - 1)); });
            return lines;
        };
        const text = data.tree ? formatTree(data.tree).join('\n') : '';
        let header = `📂 ${dirName} (${data.itemCount} 项)`;
        if (data.truncated) header += ' [已截断]';
        return `${header}\n${'─'.repeat(60)}\n${text}`;
    }
};

// ============================================================
// fs-Inspect
// ============================================================

export const inspectTool: Tool = {
    SKIP_CACHE_RESULT: true,
    definition: {
        type: 'function',
        function: {
            name: 'fs-Inspect',
            description: '查看文件/目录元信息（类型、大小、行数、修改时间等）。操作前先检查，避免误操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '文件或目录路径' }
                },
                required: ['path']
            }
        }
    },
    permission: { executionPolicy: 'auto' },
    execute: async (args): Promise<ToolExecuteResult> => {
        try {
            const filePath = nodePath.resolve(args.path);
            if (!nodeFs.existsSync(filePath)) return { status: ToolExecuteStatus.ERROR, error: `路径不存在: ${filePath}` };
            const stats = nodeFs.statSync(filePath);
            const fileType = await detectFileType(filePath);
            const info: any = {
                path: filePath,
                name: nodePath.basename(filePath),
                type: fileType,
                size: formatFileSize(stats.size),
                sizeBytes: stats.size,
                created: stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString()
            };
            if (fileType === 'directory') {
                try { info.itemCount = nodeFs.readdirSync(filePath).length; } catch { info.itemCount = 0; }
            } else if (fileType === 'text') {
                try { info.lines = await countLines(filePath); } catch { info.lines = null; }
                const ext = nodePath.extname(filePath).slice(1).toLowerCase();
                const langMap: Record<string, string> = {
                    js: 'JavaScript', ts: 'TypeScript', jsx: 'React', tsx: 'React/TypeScript',
                    py: 'Python', rb: 'Ruby', java: 'Java', cpp: 'C++', c: 'C', h: 'C/C++', go: 'Go', rs: 'Rust', php: 'PHP', swift: 'Swift',
                    html: 'HTML', css: 'CSS', scss: 'SCSS', json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', md: 'Markdown', txt: 'Plain Text'
                };
                info.language = langMap[ext] || null;
            }
            return { status: ToolExecuteStatus.SUCCESS, data: info };
        } catch (error) {
            const err = handleFileError(error, args.path);
            return { status: ToolExecuteStatus.ERROR, error: err.message };
        }
    },
    formatForLLM: (data: any) => {
        const { name, type, size, lines, language, itemCount, modified } = data;
        let out = `📋 ${name}\n`;
        out += `类型: ${type === 'text' ? '文本文件' : type === 'binary' ? '二进制文件' : '目录'}\n`;
        out += `大小: ${size}\n`;
        if (type === 'text') {
            if (lines !== null) out += `行数: ${lines}\n`;
            if (language) out += `语言: ${language}\n`;
        }
        if (type === 'directory') out += `包含: ${itemCount} 项\n`;
        out += `修改: ${new Date(modified).toLocaleString()}`;
        return out;
    }
};
