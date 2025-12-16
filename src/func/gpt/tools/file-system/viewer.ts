import { VFSManager, IVFS } from '@/libs/vfs';
import { Tool, ToolGroup, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { createViewerUtils } from './viewer-utils';

export function createViewerTools(vfs: VFSManager): ToolGroup {
    const {
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
        shouldExclude,
        matchPattern,
        searchInFile,
        handleFileError
    } = createViewerUtils(vfs);

    const viewTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs.View',
                description: '智能查看文件内容，处理大文件、二进制与范围读取',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '文件路径' },
                        mode: { type: 'string', enum: ['preview', 'full', 'head', 'tail', 'range'] },
                        lines: { type: 'number', minimum: 1, maximum: 1000 },
                        range: { type: 'array', items: { type: 'number' } },
                        showLineNumbers: { type: 'boolean' }
                    },
                    required: ['path']
                }
            },
            permissionLevel: ToolPermissionLevel.MODERATE,
            requireResultApproval: true
        },
        execute: async (args): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
            try {
                const { fs, path } = vfs.route(args.path);
                const filePath = fs.resolve(path);
                if (!await fs.exists(filePath)) return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };

                const mode = args.mode || 'preview';
                const showLineNumbers = !!args.showLineNumbers;

                const stats = await fs.stat(filePath);
                const fileType = await detectFileType(args.path); // detectFileType handles parsePath internally
                if (fileType === 'directory') return { status: ToolExecuteStatus.ERROR, error: '目录，请用 List' };
                if (fileType === 'binary') return { status: ToolExecuteStatus.ERROR, error: `二进制文件（${formatFileSize(stats.size)}），无法文本查看` };

                let content = '';
                let totalLines: number | undefined;
                let displayRange = '';

                if (mode === 'full') {
                    const res = await safeReadFile(args.path, LIMITS.MAX_FILE_SIZE); // safeReadFile handles parsePath
                    if (res.error) return { status: ToolExecuteStatus.ERROR, error: res.error };
                    content = res.content!;
                    totalLines = content.split('\n').length;
                    displayRange = `1-${totalLines}`;
                } else if (mode === 'head') {
                    const n = Math.min(args.lines || 50, 1000);
                    const lines = await readFirstLines(args.path, n); // handles parsePath
                    content = lines.join('\n');
                    totalLines = await countLines(args.path); // handles parsePath
                    displayRange = `1-${lines.length}`;
                } else if (mode === 'tail') {
                    const n = Math.min(args.lines || 50, 1000);
                    const lines = await readLastLines(args.path, n); // handles parsePath
                    content = lines.join('\n');
                    totalLines = await countLines(args.path); // handles parsePath
                    const startLine = Math.max(1, totalLines - lines.length + 1);
                    displayRange = `${startLine}-${totalLines}`;
                } else if (mode === 'range') {
                    if (!args.range || args.range.length !== 2) {
                        return { status: ToolExecuteStatus.ERROR, error: 'range 需要 [start, end]' };
                    }
                    const [start, end] = args.range;
                    if (start < 1 || end < start) return { status: ToolExecuteStatus.ERROR, error: '无效行范围' };
                    const res = await readLineRange(args.path, start, end); // handles parsePath
                    content = res.lines.join('\n');
                    totalLines = res.totalLines;
                    displayRange = `${start}-${Math.min(end, totalLines || end)}`;
                } else {
                    if (stats.size <= LIMITS.MAX_FILE_SIZE) {
                        const res = await safeReadFile(args.path); // handles parsePath
                        if (res.error) {
                            const lines = await readFirstLines(args.path, LIMITS.MAX_PREVIEW_LINES); // handles parsePath
                            content = lines.join('\n');
                            totalLines = await countLines(args.path); // handles parsePath
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
                        fileName: fs.basename(path),
                        content,
                        mode,
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
            if (data.mode === 'preview' && data.range.end !== data.totalLines) header += ' [预览模式]';
            return `${header}\n${'─'.repeat(60)}\n${data.content}`;
        }
    };

    const searchTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs.Search',
                description: '在目录中按文件名或内容搜索',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        name: { type: 'string' },
                        content: { type: 'string' },
                        regex: { type: 'boolean' },
                        caseSensitive: { type: 'boolean' },
                        include: { type: 'array', items: { type: 'string' } },
                        exclude: { type: 'array', items: { type: 'string' } },
                        maxDepth: { type: 'number', minimum: 1, maximum: 10 },
                        maxResults: { type: 'number', minimum: 1, maximum: 200 },
                        contextLines: { type: 'number', minimum: 0, maximum: 10 }
                    },
                    required: ['path']
                }
            },
            permissionLevel: ToolPermissionLevel.MODERATE,
            requireResultApproval: true
        },
        execute: async (args): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
            if (!args.name && !args.content) return { status: ToolExecuteStatus.ERROR, error: '需指定 name 或 content' };

            try {
                const { fs: rootFS, path: rootPath } = vfs.route(args.path);
                const root = rootFS.resolve(rootPath);
                const maxDepth = Math.min(args.maxDepth || 5, LIMITS.MAX_SEARCH_DEPTH);
                const maxResults = Math.min(args.maxResults || 50, LIMITS.MAX_SEARCH_RESULTS);
                const exclude = [...EXCLUDED_DIRS, ...(args.exclude || [])];
                const include = args.include || [];
                const regex = !!args.regex;

                const results: any[] = [];
                let filesScanned = 0;

                const walk = async (currentFS: IVFS, dir: string, depth: number, rel: string) => {
                    if (depth > maxDepth || results.length >= maxResults) return;
                    let items: string[];
                    try { items = await currentFS.readdir(dir); } catch { return; }

                    for (const item of items) {
                        if (results.length >= maxResults) break;
                        const full = currentFS.join(dir, item);
                        const rpath = rel ? `${rel}/${item}` : item;
                        let st; try { st = await currentFS.stat(full); } catch { continue; }
                        if (st.isDirectory) {
                            if (shouldExclude(item, exclude)) continue;
                            await walk(currentFS, full, depth + 1, rpath);
                        } else if (st.isFile) {
                            filesScanned++;
                            if (include.length && !include.some(p => matchPattern(item, p, false))) continue;
                            if (args.name && matchPattern(rpath, args.name, regex)) {
                                results.push({ file: rpath, type: 'name' });
                                continue;
                            }
                            if (args.content && st.size <= LIMITS.MAX_FILE_SIZE) {
                                const ft = await detectFileType(full, currentFS);
                                if (ft !== 'text') continue;
                                try {
                                    const matches = await searchInFile(full, args.content, {
                                        regex,
                                        caseSensitive: args.caseSensitive,
                                        contextLines: args.contextLines || 2,
                                        maxMatches: 5
                                    }, currentFS);
                                    if (matches.length) {
                                        results.push({
                                            file: rpath,
                                            type: 'content',
                                            matches: matches.map(m => ({
                                                lineNum: m.lineNum,
                                                line: m.line,
                                                preview: m.line.slice(0, 100)
                                            }))
                                        });
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                    }
                };

                await walk(rootFS, root, 0, '');
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        directory: root,
                        dirName: rootFS.basename(root),
                        searchName: args.name,
                        searchContent: args.content,
                        results,
                        filesScanned,
                        reachedLimit: results.length >= maxResults
                    }
                };
            } catch (error) {
                const err = handleFileError(error, args.path || '.');
                return { status: ToolExecuteStatus.ERROR, error: err.message };
            }
        },
        formatForLLM: (data: any) => {
            const dirName = data.dirName || data.directory;
            if (!data.results.length) return `在 ${dirName} 未找到匹配（扫描 ${data.filesScanned} 个文件）`;
            let out = `🔍 在 ${dirName} 找到 ${data.results.length} 个匹配`;
            if (data.reachedLimit) out += '（已达上限）';
            out += `\n扫描 ${data.filesScanned} 个文件\n\n`;
            const names = data.results.filter((r: any) => r.type === 'name');
            const contents = data.results.filter((r: any) => r.type === 'content');
            if (names.length) {
                out += `📁 文件名匹配 (${names.length}):\n`;
                names.forEach((r: any, i: number) => { out += `  ${i + 1}. ${r.file}\n`; });
                out += '\n';
            }
            if (contents.length) {
                out += `📝 内容匹配 (${contents.length}):\n`;
                contents.forEach((r: any, i: number) => {
                    out += `  ${i + 1}. ${r.file}\n`;
                    r.matches.slice(0, 3).forEach((m: any) => { out += `     L${m.lineNum}: ${m.preview}${m.preview.length === 100 ? '...' : ''}\n`; });
                    if (r.matches.length > 3) out += `     ... 还有 ${r.matches.length - 3} 处匹配\n`;
                });
            }
            return out.trim();
        }
    };

    const listTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs.List',
                description: '列出目录内容，支持树状/扁平',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        tree: { type: 'boolean' },
                        pattern: { type: 'string' },
                        depth: { type: 'number', minimum: 1, maximum: 8 },
                        showSize: { type: 'boolean' },
                        showHidden: { type: 'boolean' },
                        onlyFiles: { type: 'boolean' },
                        onlyDirs: { type: 'boolean' }
                    },
                    required: ['path']
                }
            },
            permissionLevel: ToolPermissionLevel.MODERATE,
            requireResultApproval: true
        },
        execute: async (args): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
            try {
                const { fs, path } = vfs.route(args.path);
                const dirPath = fs.resolve(path);
                if (!await fs.exists(dirPath)) return { status: ToolExecuteStatus.ERROR, error: `目录不存在: ${dirPath}` };
                const stat = await fs.stat(dirPath);
                if (!stat.isDirectory) return { status: ToolExecuteStatus.ERROR, error: `不是目录: ${dirPath}` };

                const maxDepth = Math.min(args.depth || 2, 8);
                const showSize = args.showSize !== false;
                const showHidden = !!args.showHidden;
                const onlyFiles = !!args.onlyFiles;
                const onlyDirs = !!args.onlyDirs;

                interface TreeNode { name: string; type: 'file' | 'dir'; size?: number; sizeFormatted?: string; children?: TreeNode[]; }
                let itemCount = 0;

                const build = async (cur: string, depth: number, name: string): Promise<TreeNode | null> => {
                    if (depth > maxDepth || itemCount >= LIMITS.MAX_LIST_ITEMS) return null;
                    let s; try { s = await fs.stat(cur); } catch { return null; }
                    const isDir = s.isDirectory;
                    if (!showHidden && name.startsWith('.')) return null;
                    if (onlyFiles && isDir) return null;
                    if (onlyDirs && !isDir) return null;
                    if (args.pattern && !isDir && !matchPattern(name, args.pattern, false)) return null;
                    itemCount++;
                    if (isDir) {
                        if (EXCLUDED_DIRS.includes(name)) return { name, type: 'dir' };
                        let items: string[];
                        try { items = await fs.readdir(cur); } catch { return { name, type: 'dir' }; }
                        const children: TreeNode[] = [];
                        for (const it of items) {
                            if (itemCount >= LIMITS.MAX_LIST_ITEMS) break;
                            const child = await build(fs.join(cur, it), depth + 1, it);
                            if (child) children.push(child);
                        }
                        return { name, type: 'dir', children };
                    }
                    return { name, type: 'file', size: showSize ? s.size : undefined, sizeFormatted: showSize ? formatFileSize(s.size) : undefined };
                };

                const root = await build(dirPath, 0, fs.basename(dirPath));

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: { directory: dirPath, dirName: fs.basename(dirPath), tree: root, itemCount, truncated: itemCount >= LIMITS.MAX_LIST_ITEMS }
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
                if (node.type === 'dir') disp += '/'; else if (node.sizeFormatted) disp += ` (${node.sizeFormatted})`;
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

    const inspectTool: Tool = {
        SKIP_CACHE_RESULT: true,
        definition: {
            type: 'function',
            function: {
                name: 'fs.Inspect',
                description: '查看文件或目录元信息',
                parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
            },
            permissionLevel: ToolPermissionLevel.PUBLIC
        },
        execute: async (args): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
            try {
                const { fs, path } = vfs.route(args.path);
                const filePath = fs.resolve(path);
                if (!await fs.exists(filePath)) return { status: ToolExecuteStatus.ERROR, error: `路径不存在: ${filePath}` };
                const stats = await fs.stat(filePath);
                const fileType = await detectFileType(args.path); // handles parsePath
                const info: any = {
                    path: filePath,
                    name: fs.basename(filePath),
                    type: fileType,
                    size: formatFileSize(stats.size),
                    sizeBytes: stats.size,
                    created: stats.birthtime.toISOString(),
                    modified: stats.mtime.toISOString()
                };
                if (fileType === 'directory') {
                    try { info.itemCount = (await fs.readdir(filePath)).length; } catch { info.itemCount = 0; }
                } else if (fileType === 'text') {
                    try { info.lines = await countLines(args.path); } catch { info.lines = null; } // handles parsePath
                    const ext = fs.extname(filePath).slice(1).toLowerCase();
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

    const tools = [viewTool, searchTool, listTool, inspectTool];

    const rulePrompt = `
## 文件查看工具组使用指南

你有 4 个专业的文件查看工具：

1) View - 智能文件查看：preview/full/head/tail/range
2) Search - 统一搜索：文件名/内容，支持正则与包含/排除
3) List - 目录列表：树状/扁平，支持过滤与深度限制
4) Inspect - 元信息：类型/大小/行数/子项统计

最佳实践：
- 不确定先 Inspect，再 View
- 日志用 tail，CSV 大文件用 range
- 搜索加 include/exclude 控制范围
- 避免对大文件用 full 模式
`.trim();

    return { name: '文件查看工具组', tools, rulePrompt };
}
