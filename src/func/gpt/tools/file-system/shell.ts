/**
 * Shell-based 文件系统工具：fs-Glob, fs-Grep, fs-FileOps
 * 底层调用系统 shell 命令，跨平台处理
 *
 * 所有工具在定义时即确定当前平台和 Shell 类型，
 * 确保 LLM 生成的命令语法与运行环境一致。
 */

import { Tool, ToolExecuteResult, ToolExecuteStatus } from "../types";
import { execScript, getPlatform, getScriptName, type ExecResult } from "@/libs/system-utils";

const nodePath: typeof import('path') = window?.require?.('path');

// ============================================================
// 平台检测（模块加载时确定，与 script-tools 一致）
// ============================================================

const platform = getPlatform();
const shellName = getScriptName();   // 'PowerShell' | 'Bash'
const isWin = platform === 'win32';

// ============================================================
// 内部辅助
// ============================================================

/** 安全转义 shell 参数（防止注入） */
function escapeShellArg(arg: string): string {
    if (isWin) {
        // PowerShell: 用单引号包裹，内部单引号用两个单引号转义
        return `'${arg.replace(/'/g, "''")}'`;
    }
    // Bash: 用单引号包裹，内部单引号用 '\'' 转义
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** 执行 shell 并返回结果 */
async function runShell(script: string, cwd?: string): Promise<{ result: ExecResult; output: string }> {
    const result = await execScript(script, { cwd });
    const output = result.stdout?.trim() || '';
    return { result, output };
}

/** 解析输出行为列表 */
function parseLines(output: string): string[] {
    if (!output) return [];
    return output.split(/\r?\n/).filter(line => line.trim());
}

// ============================================================
// fs-Glob
// ============================================================

const globDescription = isWin
    ? `按文件名/路径模式搜索文件（${shellName}，底层 Get-ChildItem -Recurse -Filter）`
    : `按文件名/路径模式搜索文件（${shellName}，底层 find -name）`;

export const globTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs-Glob',
            description: globDescription,
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '搜索根目录' },
                    pattern: { type: 'string', description: '文件名模式，如 "*.ts", "test_*.py", "README*"' },
                    maxDepth: { type: 'number', minimum: 1, maximum: 20, description: '最大搜索深度，默认 10' },
                    type: {
                        type: 'string', enum: ['file', 'dir', 'all'],
                        description: '类型过滤：file=只文件，dir=只目录，all=全部（默认 file）'
                    },
                    maxResults: { type: 'number', minimum: 1, maximum: 500, description: '最大结果数，默认 100' }
                },
                required: ['path', 'pattern']
            }
        }
    },
    permission: {
        executionPolicy: 'ask-once',
        resultApprovalPolicy: 'always'
    },
    execute: async (args): Promise<ToolExecuteResult> => {
        try {
            const dir = nodePath.resolve(args.path);
            const pattern = args.pattern;
            const maxDepth = args.maxDepth || 10;
            const type = args.type || 'file';
            const maxResults = args.maxResults || 100;

            let script: string;
            if (isWin) {
                const typeFilter = type === 'dir' ? '| Where-Object { $_.PSIsContainer }'
                    : type === 'file' ? '| Where-Object { -not $_.PSIsContainer }'
                    : '';
                script = `Get-ChildItem -Path ${escapeShellArg(dir)} -Recurse -Depth ${maxDepth} -Filter ${escapeShellArg(pattern)} -ErrorAction SilentlyContinue ${typeFilter} | Select-Object -First ${maxResults} | ForEach-Object { $_.FullName }`;
            } else {
                const typeFlag = type === 'dir' ? '-type d' : type === 'file' ? '-type f' : '';
                script = `find ${escapeShellArg(dir)} -maxdepth ${maxDepth} -name ${escapeShellArg(pattern)} ${typeFlag} 2>/dev/null | head -n ${maxResults}`;
            }

            const { result, output } = await runShell(script);
            const files = parseLines(output);

            // 转换为相对路径
            const relFiles = files.map(f => {
                try { return nodePath.relative(dir, f); } catch { return f; }
            });

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    directory: dir,
                    pattern,
                    results: relFiles,
                    count: relFiles.length,
                    reachedLimit: relFiles.length >= maxResults
                }
            };
        } catch (error: any) {
            return { status: ToolExecuteStatus.ERROR, error: error.message };
        }
    },
    formatForLLM: (data: any) => {
        if (data.count === 0) return `在 ${data.directory} 未找到匹配 "${data.pattern}" 的文件`;
        let out = `🔍 在 ${nodePath.basename(data.directory)} 找到 ${data.count} 个匹配 "${data.pattern}"`;
        if (data.reachedLimit) out += '（已达上限）';
        out += '\n';
        data.results.forEach((f: string, i: number) => { out += `  ${i + 1}. ${f}\n`; });
        return out.trim();
    }
};

// ============================================================
// fs-Grep
// ============================================================

const grepDescription = isWin
    ? `在文件内容中搜索文本/正则（${shellName}，底层 Get-ChildItem | Select-String）`
    : `在文件内容中搜索文本/正则（${shellName}，底层 grep -rn）`;

export const grepTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs-Grep',
            description: grepDescription,
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '搜索根目录' },
                    pattern: { type: 'string', description: '搜索模式（文本或正则表达式）' },
                    include: { type: 'string', description: '文件名过滤，如 "*.ts"、"*.py"' },
                    caseSensitive: { type: 'boolean', description: '区分大小写，默认 false' },
                    contextLines: { type: 'number', minimum: 0, maximum: 10, description: '上下文行数，默认 0' },
                    maxResults: { type: 'number', minimum: 1, maximum: 200, description: '最大结果数，默认 50' },
                    regex: { type: 'boolean', description: '是否为正则表达式，默认 false（纯文本匹配）' }
                },
                required: ['path', 'pattern']
            }
        }
    },
    permission: {
        executionPolicy: 'ask-once',
        resultApprovalPolicy: 'always'
    },
    execute: async (args): Promise<ToolExecuteResult> => {
        try {
            const dir = nodePath.resolve(args.path);
            const pattern = args.pattern;
            const include = args.include || '';
            const caseSensitive = !!args.caseSensitive;
            const contextLines = args.contextLines || 0;
            const maxResults = args.maxResults || 50;
            const isRegex = !!args.regex;

            let script: string;
            if (isWin) {
                const csFlag = caseSensitive ? '-CaseSensitive' : '';
                const ctxFlag = contextLines > 0 ? `-Context ${contextLines},${contextLines}` : '';
                const simpleFlag = isRegex ? '' : '-SimpleMatch';

                if (include) {
                    script = `Get-ChildItem -Path ${escapeShellArg(dir)} -Recurse -Include ${escapeShellArg(include)} -File -ErrorAction SilentlyContinue | Select-String -Pattern ${escapeShellArg(pattern)} ${csFlag} ${ctxFlag} ${simpleFlag} | Select-Object -First ${maxResults} | ForEach-Object { $_.ToString() }`;
                } else {
                    script = `Get-ChildItem -Path ${escapeShellArg(dir)} -Recurse -File -ErrorAction SilentlyContinue | Select-String -Pattern ${escapeShellArg(pattern)} ${csFlag} ${ctxFlag} ${simpleFlag} | Select-Object -First ${maxResults} | ForEach-Object { $_.ToString() }`;
                }
            } else {
                const flags = ['-rn'];
                if (!caseSensitive) flags.push('-i');
                if (contextLines > 0) flags.push(`-C ${contextLines}`);
                if (!isRegex) flags.push('-F');
                if (include) flags.push(`--include=${escapeShellArg(include)}`);

                const excludes = ['node_modules', '.git', 'dist', 'build', '__pycache__']
                    .map(d => `--exclude-dir=${escapeShellArg(d)}`).join(' ');

                script = `grep ${flags.join(' ')} ${excludes} ${escapeShellArg(pattern)} ${escapeShellArg(dir)} 2>/dev/null | head -n ${maxResults}`;
            }

            const { result, output } = await runShell(script);
            const lines = parseLines(output);

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    directory: dir,
                    pattern,
                    include: include || undefined,
                    results: lines,
                    count: lines.length,
                    reachedLimit: lines.length >= maxResults
                }
            };
        } catch (error: any) {
            return { status: ToolExecuteStatus.ERROR, error: error.message };
        }
    },
    formatForLLM: (data: any) => {
        if (data.count === 0) return `在 ${data.directory} 未找到匹配 "${data.pattern}" 的内容`;
        let out = `🔍 grep "${data.pattern}" 找到 ${data.count} 处匹配`;
        if (data.include) out += ` (include: ${data.include})`;
        if (data.reachedLimit) out += '（已达上限）';
        out += '\n\n';
        out += data.results.join('\n');
        return out.trim();
    }
};

// ============================================================
// fs-FileOps - 受限 Shell，仅允许文件操作命令
// ============================================================

// ---- 平台相关白名单 ----

const ALLOWED_COMMANDS_UNIX = [
    // 文件/目录操作
    'mkdir', 'cp', 'mv', 'rm', 'rmdir', 'touch', 'ln', 'chmod',
    // 归档
    'tar', 'zip', 'unzip', 'gzip', 'gunzip',
    // 文本处理（只读方向）
    'cat', 'head', 'tail', 'wc', 'diff', 'stat', 'file',
    'sort', 'uniq', 'cut', 'tr', 'sed', 'awk',
    // 路径工具
    'basename', 'dirname', 'realpath', 'readlink',
    // 查看
    'ls', 'tree', 'du', 'df', 'find',
] as const;

const ALLOWED_COMMANDS_WIN = [
    // PowerShell cmdlets (小写匹配)
    'new-item', 'copy-item', 'move-item', 'remove-item', 'rename-item',
    'get-item', 'set-item', 'get-childitem', 'get-content', 'set-content', 'add-content',
    'test-path', 'resolve-path', 'split-path', 'join-path',
    'compress-archive', 'expand-archive',
    'get-filehash', 'select-string',
    // Unix-like aliases built into PowerShell
    'mkdir', 'cp', 'copy', 'mv', 'move', 'rm', 'del', 'rmdir', 'rd',
    'cat', 'type', 'dir', 'ls', 'ren',
] as const;

const ALLOWED_SET = new Set<string>(isWin ? ALLOWED_COMMANDS_WIN : ALLOWED_COMMANDS_UNIX);
const ALLOWED_LIST_STR = (isWin ? ALLOWED_COMMANDS_WIN : ALLOWED_COMMANDS_UNIX).join(', ');

function validateCommand(command: string): { valid: boolean; error?: string } {
    const trimmed = command.trim();
    if (!trimmed) return { valid: false, error: '命令不能为空' };

    // 提取首个 token（命令名）
    const firstToken = trimmed.split(/[\s;|&]/)[0].toLowerCase();

    if (!ALLOWED_SET.has(firstToken)) {
        return {
            valid: false,
            error: `命令 "${firstToken}" 不在文件操作白名单中。\n允许的命令: ${ALLOWED_LIST_STR}`
        };
    }
    return { valid: true };
}

// ---- 根据平台构建工具描述 ----

const fileOpsDescription = isWin
    ? `在 ${platform} 上运行 ${shellName} 文件操作命令（受限白名单）
允许的命令: ${ALLOWED_COMMANDS_WIN.join(', ')}
注意: 使用 PowerShell 语法编写命令`
    : `在 ${platform} 上运行 ${shellName} 文件操作命令（受限白名单）
允许的命令: ${ALLOWED_COMMANDS_UNIX.join(', ')}
注意: 使用 Bash 语法编写命令`;

const commandParamDescription = isWin
    ? `${shellName} 文件操作命令。首个命令词必须在白名单中。
示例:
  Copy-Item -Path 'src' -Destination 'backup' -Recurse
  mkdir 'new_folder'
  Get-ChildItem -Path '.' -Recurse | Measure-Object`
    : `${shellName} 文件操作命令。首个命令词必须在白名单中。
示例:
  cp -r src/ backup/
  mkdir -p new_folder/sub
  find . -name '*.log' -mtime +7 -delete`;

export const fileOpsTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs-FileOps',
            description: fileOpsDescription,
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: commandParamDescription
                    },
                    directory: {
                        type: 'string',
                        description: '工作目录（默认当前目录）'
                    }
                },
                required: ['command']
            }
        }
    },
    permission: {
        executionPolicy: 'ask-always',
        resultApprovalPolicy: 'always'
    },
    execute: async (args): Promise<ToolExecuteResult> => {
        try {
            const validation = validateCommand(args.command);
            if (!validation.valid) {
                return { status: ToolExecuteStatus.ERROR, error: validation.error! };
            }

            const cwd = args.directory ? nodePath.resolve(args.directory) : undefined;
            const { result, output } = await runShell(args.command, cwd);

            if (!result.success) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `命令执行失败 (exit ${result.exitCode})\n[stdout]\n${result.stdout}\n[stderr]\n${result.stderr}`
                };
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `[stdout]\n${result.stdout}\n\n[stderr]\n${result.stderr}`
            };
        } catch (error: any) {
            return { status: ToolExecuteStatus.ERROR, error: error.message };
        }
    }
};

// ============================================================
// 导出
// ============================================================

export const shellTools: Tool[] = [globTool, grepTool, fileOpsTool];
