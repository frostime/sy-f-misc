import { VFSManager, IVFS } from '@/libs/vfs';
import { Tool, ToolGroup, ToolExecuteResult, ToolExecuteStatus } from "../types";
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
                            description: '读取模式：full=完整文件（小文件适用），head=前N行，tail=后N行，range=指定行范围。不指定时自动选择（小文件完整读取，大文件读取前部）'
                        },
                        lines: {
                            type: 'number',
                            minimum: 1,
                            maximum: 1000,
                            description: 'head/tail 模式需要：要读取的行数（1-1000），默认50行'
                        },
                        range: {
                            type: 'array',
                            items: { type: 'number' },
                            description: 'range 模式需要：[起始行, 结束行]，从1开始计数，包含边界。必须是长度为2的数组，例如 [10, 50] 读取第10-50行'
                        },
                        showLineNumbers: {
                            type: 'boolean',
                            description: '是否在输出中显示行号，默认 false'
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
            if (!vfs.isAvailable()) return { status: ToolExecuteStatus.ERROR, error: '文件系统不可用' };
            try {
                const { fs, path } = vfs.route(args.path);
                const filePath = fs.resolve(path);
                if (!await fs.exists(filePath)) return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };

                const showLineNumbers = !!args.showLineNumbers;

                const stats = await fs.stat(filePath);
                const fileType = await detectFileType(args.path); // detectFileType handles parsePath internally
                if (fileType === 'directory') return { status: ToolExecuteStatus.ERROR, error: '目录，请用 List' };
                if (fileType === 'binary') return { status: ToolExecuteStatus.ERROR, error: `二进制文件（${formatFileSize(stats.size)}），无法文本查看` };

                let content = '';
                let totalLines: number | undefined;
                let displayRange = '';
                let mode = args.mode;

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
                    // 自动模式：小文件完整读取，大文件读取前部
                    mode = 'auto';
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
            if (data.mode === 'auto' && data.range.end !== data.totalLines) header += ' [智能模式: 部分显示]';
            return `${header}\n${'─'.repeat(60)}\n${data.content}`;
        }
    };

    const searchTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs-Search',
                description: '在目录树中按文件名或文件内容进行搜索。支持正则表达式、通配符模式、包含/排除过滤。适用于查找特定文件或代码片段。',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: '搜索的根目录路径'
                        },
                        name: {
                            type: 'string',
                            description: '按文件名搜索的模式。支持通配符（*匹配任意字符，?匹配单个字符）或正则表达式（需设置 regex=true）。例如："*.ts" 或 "test.*\.js"'
                        },
                        content: {
                            type: 'string',
                            description: '在文件内容中搜索的文本或正则模式。只搜索文本文件，自动跳过二进制文件'
                        },
                        regex: {
                            type: 'boolean',
                            description: '是否将 name/content 视为正则表达式，默认 false（通配符模式）'
                        },
                        caseSensitive: {
                            type: 'boolean',
                            description: '搜索是否区分大小写，默认 false（不区分）'
                        },
                        include: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '只搜索匹配这些模式的文件。例如：["*.ts", "*.tsx"] 只搜索 TypeScript 文件'
                        },
                        exclude: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '排除匹配这些模式的文件/目录。例如：["test", "*.log"]。默认会自动排除 node_modules 等常见目录'
                        },
                        maxDepth: {
                            type: 'number',
                            minimum: 1,
                            maximum: 10,
                            description: '最大搜索深度（目录层级），默认5层，最大10层'
                        },
                        maxResults: {
                            type: 'number',
                            minimum: 1,
                            maximum: 200,
                            description: '最大返回结果数，默认50，最大200。达到上限时停止搜索'
                        },
                        contextLines: {
                            type: 'number',
                            minimum: 0,
                            maximum: 10,
                            description: '内容搜索时，显示匹配行前后的上下文行数，默认2行'
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
                name: 'fs-List',
                description: '列出目录内容，以树状结构展示文件和子目录。支持深度控制、文件过滤、隐藏文件显示等。适用于了解项目结构或查找特定类型文件。',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: '要列出的目录路径'
                        },
                        tree: {
                            type: 'boolean',
                            description: '是否以树状格式显示，默认 true。false 时为扁平列表'
                        },
                        pattern: {
                            type: 'string',
                            description: '文件名过滤模式（通配符）。例如："*.ts" 只显示 TypeScript 文件，"test*" 只显示 test 开头的文件'
                        },
                        depth: {
                            type: 'number',
                            minimum: 1,
                            maximum: 8,
                            description: '递归深度（目录层级），默认2层，最大8层。深度越大，返回内容越多'
                        },
                        showSize: {
                            type: 'boolean',
                            description: '是否显示文件大小，默认 true'
                        },
                        showHidden: {
                            type: 'boolean',
                            description: '是否显示隐藏文件（.开头的文件/目录），默认 false'
                        },
                        onlyFiles: {
                            type: 'boolean',
                            description: '只列出文件，不显示目录，默认 false'
                        },
                        onlyDirs: {
                            type: 'boolean',
                            description: '只列出目录，不显示文件，默认 false'
                        },
                        skipDir: {
                            type: 'string',
                            description: '要跳过的目录名称，多个用逗号分隔。例如："test,dist,tmp"。不指定时使用默认配置（node_modules, .git 等常见目录）'
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

                // 处理 skipDir 参数
                const skipDirs = args.skipDir
                    ? args.skipDir.split(',').map(d => d.trim()).filter(d => d)
                    : EXCLUDED_DIRS;

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
                        if (skipDirs.includes(name)) return { name, type: 'dir' };
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
                name: 'fs-Inspect',
                description: '查看文件或目录的元信息（metadata）。返回类型、大小、创建/修改时间、行数（文本文件）、子项数量（目录）等详细信息。适用于在操作前了解文件属性。',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: '要检查的文件或目录路径'
                        }
                    },
                    required: ['path']
                }
            }
        },

        permission: {
            executionPolicy: 'auto'
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

1) **fs-View** - 智能文件查看
   - 支持模式：full（完整）/ head（前N行）/ tail（后N行）/ range（指定范围）
   - 不指定模式时自动选择：小文件完整读取，大文件智能预览
   - 可选显示行号

2) **fs-Search** - 目录树搜索
   - 按文件名或内容搜索，支持通配符和正则表达式
   - 使用 include/exclude 精确控制搜索范围
   - 自动跳过二进制文件和常见无关目录

3) **fs-List** - 目录内容列表
   - 树状结构展示，支持深度和文件类型过滤
   - skipDir 参数可自定义跳过的目录（逗号分隔）
   - 适合了解项目结构

4) **fs-Inspect** - 文件/目录元信息
   - 快速查看类型、大小、行数、修改时间等
   - 操作前先检查，避免误操作

**最佳实践：**
- 不确定文件类型/大小时，先用 Inspect 检查
- 查看日志文件用 tail，大数据文件用 range 分段读取
- 搜索时善用 include/exclude 和 skipDir，减少无关结果
- 避免对大文件使用 full 模式，优先用 head/tail/range
- List 大型项目时控制 depth，避免返回过多内容
`.trim();

    return { name: '文件查看工具组', tools, rulePrompt };
}
