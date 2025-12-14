/**
 * Viewer 工具组公共函数
 * 提供文件类型检测、大小格式化、流式读取等功能
 */

const fs = window?.require?.('fs');
const path = window?.require?.('path');
const readline = window?.require?.('readline');

// ============================================================
// 常量定义
// ============================================================

export const LIMITS = {
    MAX_FILE_SIZE: 3 * 1024 * 1024,      // 3MB - 单次读取最大文件大小
    MAX_PREVIEW_LINES: 100,               // 预览模式最大行数
    MAX_SEARCH_DEPTH: 10,                 // 搜索最大深度
    MAX_SEARCH_RESULTS: 100,              // 搜索最大结果数
    MAX_LIST_ITEMS: 500,                  // 列表最大项目数
    BINARY_DETECT_BYTES: 8192,            // 二进制检测采样字节数
};

export const EXCLUDED_DIRS = [
    'node_modules', '.git', '.svn', '.hg',
    'dist', 'build', 'out', 'target',
    '.next', '.nuxt', '.vscode', '.idea',
    '__pycache__', '.pytest_cache',
    'vendor', 'coverage'
];

// 常见文本文件扩展名
const TEXT_EXTENSIONS = new Set([
    // 文档
    'txt', 'md', 'markdown', 'rst', 'adoc',
    // 配置
    'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env',
    // 代码
    'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'hpp',
    'cs', 'go', 'rs', 'php', 'swift', 'kt', 'scala', 'clj', 'ex', 'exs',
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
    // 标记语言
    'html', 'xml', 'svg', 'css', 'scss', 'sass', 'less',
    // 数据
    'csv', 'tsv', 'sql', 'graphql', 'proto',
    // 其他
    'log', 'diff', 'patch', 'dockerfile', 'makefile', 'cmake',
    'vue', 'svelte', 'astro'
]);

// ============================================================
// 文件类型检测
// ============================================================

/**
 * 检测文件是否为二进制文件
 * 方法：读取前 8KB，检查是否包含 null 字节或过多控制字符
 */
export function isBinaryFile(filePath: string): boolean {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(LIMITS.BINARY_DETECT_BYTES);
        const bytesRead = fs.readSync(fd, buffer, 0, LIMITS.BINARY_DETECT_BYTES, 0);
        fs.closeSync(fd);

        if (bytesRead === 0) return false; // 空文件视为文本

        let nullBytes = 0;
        let controlBytes = 0;

        for (let i = 0; i < bytesRead; i++) {
            const byte = buffer[i];

            // Null 字节 - 明确的二进制标志
            if (byte === 0) {
                nullBytes++;
                if (nullBytes > 1) return true; // 超过 1 个 null 就是二进制
            }

            // 控制字符（排除常见的 \n \r \t）
            if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
                controlBytes++;
            }
        }

        // 如果控制字符超过 10%，视为二进制
        return controlBytes / bytesRead > 0.1;
    } catch (error) {
        return true; // 无法读取时保守处理
    }
}

/**
 * 检测文件类型
 */
export function detectFileType(filePath: string): 'text' | 'binary' | 'directory' {
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
        return 'directory';
    }

    // 快速路径：检查扩展名
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) {
        return 'text';
    }

    // 没有扩展名的常见文本文件
    const basename = path.basename(filePath).toLowerCase();
    const noExtTextFiles = [
        'readme', 'license', 'changelog', 'authors', 'contributors',
        'makefile', 'dockerfile', 'gemfile', 'rakefile', 'vagrantfile'
    ];
    if (noExtTextFiles.includes(basename)) {
        return 'text';
    }

    // 深度检测
    return isBinaryFile(filePath) ? 'binary' : 'text';
}

// ============================================================
// 文件读取
// ============================================================

/**
 * 安全读取文件全部内容
 * 包含大小检查和二进制检测
 */
export function safeReadFile(filePath: string, maxSize: number = LIMITS.MAX_FILE_SIZE): {
    content?: string;
    error?: string;
    fileType?: 'text' | 'binary';
    size: number;
} {
    try {
        const stats = fs.statSync(filePath);
        const size = stats.size;

        // 检查大小
        if (size > maxSize) {
            return {
                error: `文件过大（${formatFileSize(size)}），超过限制（${formatFileSize(maxSize)}）`,
                size,
                fileType: 'text'
            };
        }

        // 检查类型
        const fileType = detectFileType(filePath);
        if (fileType === 'binary') {
            return {
                error: '这是二进制文件，无法以文本形式查看',
                size,
                fileType: 'binary'
            };
        }

        if (fileType === 'directory') {
            return {
                error: '这是一个目录，请使用 List 工具查看',
                size,
                fileType: 'text'
            };
        }

        // 读取内容
        const content = fs.readFileSync(filePath, 'utf-8');
        return { content, size, fileType: 'text' };

    } catch (error: any) {
        return {
            error: `读取文件失败: ${error.message}`,
            size: 0
        };
    }
}

/**
 * 流式读取文件的前 N 行
 */
export async function readFirstLines(filePath: string, count: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const lines: string[] = [];
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream });

        rl.on('line', (line: string) => {
            lines.push(line);
            if (lines.length >= count) {
                rl.close();
                stream.destroy();
            }
        });

        rl.on('close', () => resolve(lines));
        rl.on('error', reject);
        stream.on('error', reject);
    });
}

/**
 * 流式读取文件的后 N 行
 */
export async function readLastLines(filePath: string, count: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const stats = fs.statSync(filePath);
        const bufferSize = Math.min(64 * 1024, stats.size); // 64KB 或文件大小
        const buffer = Buffer.alloc(bufferSize);

        // 从文件末尾读取
        const fd = fs.openSync(filePath, 'r');
        const bytesRead = fs.readSync(fd, buffer, 0, bufferSize, Math.max(0, stats.size - bufferSize));
        fs.closeSync(fd);

        const text = buffer.slice(0, bytesRead).toString('utf-8');
        const allLines = text.split('\n');

        // 如果文件小于缓冲区，可能读到全部内容
        const lines = allLines.slice(-count);
        resolve(lines);
    });
}

/**
 * 读取指定行范围
 */
export async function readLineRange(
    filePath: string,
    start: number,
    end: number
): Promise<{ lines: string[]; totalLines?: number }> {
    return new Promise((resolve, reject) => {
        const lines: string[] = [];
        let lineNum = 0;
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream });

        rl.on('line', (line: string) => {
            lineNum++;
            if (lineNum >= start && lineNum <= end) {
                lines.push(line);
            }
            if (lineNum >= end) {
                rl.close();
                stream.destroy();
            }
        });

        rl.on('close', () => resolve({ lines, totalLines: lineNum }));
        rl.on('error', reject);
        stream.on('error', reject);
    });
}

/**
 * 快速统计文件行数（不读取内容）
 */
export async function countLines(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        let count = 0;
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream });

        rl.on('line', () => count++);
        rl.on('close', () => resolve(count));
        rl.on('error', reject);
        stream.on('error', reject);
    });
}

// ============================================================
// 格式化函数
// ============================================================

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * 为文本添加行号
 */
export function addLineNumbers(text: string, startLine: number = 1): string {
    const lines = text.split('\n');
    const maxDigits = String(startLine + lines.length - 1).length;

    return lines
        .map((line, i) => {
            const num = (startLine + i).toString().padStart(maxDigits, ' ');
            return `${num} │ ${line}`;
        })
        .join('\n');
}

/**
 * 格式化行号范围
 */
export function formatLineRange(start: number, end: number): string {
    if (start === end) return `L${start}`;
    return `L${start}-${end}`;
}

// ============================================================
// 路径处理
// ============================================================

/**
 * 检查路径是否应该被排除
 */
export function shouldExclude(itemName: string, excludePatterns: string[]): boolean {
    // 检查是否在排除列表中
    if (excludePatterns.includes(itemName)) {
        return true;
    }

    // 检查是否匹配排除模式
    for (const pattern of excludePatterns) {
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            if (regex.test(itemName)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * 检查文件名是否匹配模式
 */
export function matchPattern(fileName: string, pattern: string, isRegex: boolean): boolean {
    try {
        if (isRegex) {
            const regex = new RegExp(pattern, 'i');
            return regex.test(fileName);
        } else {
            // 简单通配符支持
            const regexPattern = pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // 转义特殊字符
                .replace(/\*/g, '.*')                   // * -> .*
                .replace(/\?/g, '.');                   // ? -> .
            const regex = new RegExp('^' + regexPattern + '$', 'i');
            return regex.test(fileName);
        }
    } catch {
        return false;
    }
}

// ============================================================
// 搜索辅助
// ============================================================

/**
 * 流式搜索文件内容
 */
export async function searchInFile(
    filePath: string,
    pattern: string,
    options: {
        regex?: boolean;
        caseSensitive?: boolean;
        contextLines?: number;
        maxMatches?: number;
    } = {}
): Promise<Array<{ lineNum: number; line: string; context?: string[] }>> {
    const {
        regex = false,
        caseSensitive = false,
        contextLines = 2,
        maxMatches = 10
    } = options;

    // 编译搜索正则
    let searchRegex: RegExp;
    try {
        if (regex) {
            const flags = caseSensitive ? '' : 'i';
            searchRegex = new RegExp(pattern, flags);
        } else {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const flags = caseSensitive ? '' : 'i';
            searchRegex = new RegExp(escaped, flags);
        }
    } catch (error: any) {
        throw new Error(`无效的搜索模式: ${error.message}`);
    }

    return new Promise((resolve, reject) => {
        const matches: Array<{ lineNum: number; line: string; context?: string[] }> = [];
        const recentLines: string[] = [];  // 用于上下文
        let lineNum = 0;

        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream });

        rl.on('line', (line: string) => {
            lineNum++;

            // 维护滚动窗口（用于上下文）
            recentLines.push(line);
            if (recentLines.length > contextLines * 2 + 1) {
                recentLines.shift();
            }

            // 检查匹配
            if (searchRegex.test(line)) {
                const context = contextLines > 0 ? [...recentLines] : undefined;
                matches.push({ lineNum, line: line.trim(), context });

                if (matches.length >= maxMatches) {
                    rl.close();
                    stream.destroy();
                }
            }
        });

        rl.on('close', () => resolve(matches));
        rl.on('error', reject);
        stream.on('error', reject);
    });
}

// ============================================================
// 错误处理
// ============================================================

export class ViewerError extends Error {
    constructor(
        message: string,
        public code: 'FILE_TOO_LARGE' | 'BINARY_FILE' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_RANGE' | 'UNKNOWN'
    ) {
        super(message);
        this.name = 'ViewerError';
    }
}

export function handleFileError(error: any, filePath: string): ViewerError {
    if (error.code === 'ENOENT') {
        return new ViewerError(`文件不存在: ${filePath}`, 'NOT_FOUND');
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
        return new ViewerError(`没有权限访问: ${filePath}`, 'PERMISSION_DENIED');
    }
    return new ViewerError(`操作失败: ${error.message}`, 'UNKNOWN');
}
