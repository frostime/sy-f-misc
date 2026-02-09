/**
 * Viewer 工具组公共函数 - 直接使用 Node.js API
 * 提供文件类型检测、大小格式化、流式读取等功能
 */

const nodeFs: typeof import('fs') = window?.require?.('fs');
const nodePath: typeof import('path') = window?.require?.('path');
const nodeReadline: typeof import('readline') = window?.require?.('readline');

// ============================================================
// 常量定义
// ============================================================

export const LIMITS = {
    MAX_FILE_SIZE: 0.5 * 1024 * 1024,      // 0.5MB - 单次读取最大文件大小
    MAX_PREVIEW_LINES: 100,               // 预览模式最大行数
    MAX_LIST_ITEMS: 500,                  // 列表最大项目数
    BINARY_DETECT_BYTES: 8192,            // 二进制检测采样字节数
};

export const EXCLUDED_DIRS = [
    'node_modules', '.git', '.svn', '.hg',
    'dist', 'build', 'out', 'target',
    '.next', '.nuxt', '.vscode', '.idea',
    '__pycache__', '.pytest_cache',
    'vendor', 'coverage', '.venv'
];

// 常见文本文件扩展名
const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'markdown', 'rst', 'adoc',
    'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env',
    'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'hpp',
    'cs', 'go', 'rs', 'php', 'swift', 'kt', 'scala', 'clj', 'ex', 'exs',
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
    'html', 'xml', 'svg', 'css', 'scss', 'sass', 'less',
    'csv', 'tsv', 'sql', 'graphql', 'proto',
    'log', 'diff', 'patch', 'dockerfile', 'makefile', 'cmake',
    'vue', 'svelte', 'astro'
]);

const KNOWN_BINARY_EXT = new Set([
    'exe', 'dll', 'so', 'dylib', 'bin', 'obj', 'o',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp',
    'mp3', 'mp4', 'wav', 'avi', 'mkv', 'mov',
    'zip', 'tar', 'gz', 'rar', '7z', 'pdf', 'doc', 'docx', 'xls', 'xlsx'
]);

// ============================================================
// 可用性检查
// ============================================================

export function isNodeAvailable(): boolean {
    return !!(nodeFs && nodePath);
}

// ============================================================
// 文件类型检测
// ============================================================

/**
 * 检测文件是否为二进制文件
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
    try {
        const ext = nodePath.extname(filePath).slice(1).toLowerCase();
        if (KNOWN_BINARY_EXT.has(ext)) return true;
        if (TEXT_EXTENSIONS.has(ext)) return false;

        // 读取前 8KB 检测
        const fd = nodeFs.openSync(filePath, 'r');
        try {
            const stat = nodeFs.fstatSync(fd);
            const readSize = Math.min(stat.size, LIMITS.BINARY_DETECT_BYTES);
            if (readSize === 0) return false; // 空文件视为文本

            const buffer = new Uint8Array(readSize);
            nodeFs.readSync(fd, buffer, 0, readSize, 0);

            let nullBytes = 0;
            let controlBytes = 0;
            for (let i = 0; i < buffer.length; i++) {
                const byte = buffer[i];
                if (byte === 0) {
                    nullBytes++;
                    if (nullBytes > 1) return true;
                }
                if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
                    controlBytes++;
                }
            }
            return controlBytes / buffer.length > 0.1;
        } finally {
            nodeFs.closeSync(fd);
        }
    } catch {
        return true; // 无法读取时保守处理
    }
}

/**
 * 检测文件类型
 */
export async function detectFileType(filePath: string): Promise<'text' | 'binary' | 'directory'> {
    const stat = nodeFs.statSync(filePath);
    if (stat.isDirectory()) return 'directory';

    const ext = nodePath.extname(filePath).slice(1).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) return 'text';

    const basename = nodePath.basename(filePath).toLowerCase();
    const noExtTextFiles = [
        'readme', 'license', 'changelog', 'authors', 'contributors',
        'makefile', 'dockerfile', 'gemfile', 'rakefile', 'vagrantfile'
    ];
    if (noExtTextFiles.includes(basename)) return 'text';

    return await isBinaryFile(filePath) ? 'binary' : 'text';
}

// ============================================================
// 文件读取
// ============================================================

/**
 * 安全读取文件全部内容（含大小和类型检查）
 */
export async function safeReadFile(filePath: string, maxSize: number = LIMITS.MAX_FILE_SIZE): Promise<{
    content?: string;
    error?: string;
    fileType?: 'text' | 'binary';
    size: number;
}> {
    try {
        const stat = nodeFs.statSync(filePath);
        const size = stat.size;

        if (size > maxSize) {
            return {
                error: `文件过大（${formatFileSize(size)}），超过限制（${formatFileSize(maxSize)}）`,
                size, fileType: 'text'
            };
        }

        const fileType = await detectFileType(filePath);
        if (fileType === 'binary') {
            return { error: '二进制文件，无法以文本查看', size, fileType: 'binary' };
        }
        if (fileType === 'directory') {
            return { error: '这是一个目录，请使用 List 工具', size, fileType: 'text' };
        }

        const content = nodeFs.readFileSync(filePath, 'utf-8');
        return { content, size, fileType: 'text' };
    } catch (error: any) {
        return { error: `读取失败: ${error.message}`, size: 0 };
    }
}

/**
 * 高效读取文件前 N 行
 */
export function readFirstLines(filePath: string, n: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const lines: string[] = [];
        const rl = nodeReadline.createInterface({
            input: nodeFs.createReadStream(filePath, { encoding: 'utf-8' }),
            crlfDelay: Infinity
        });
        rl.on('line', (line: string) => {
            lines.push(line);
            if (lines.length >= n) rl.close();
        });
        rl.on('close', () => resolve(lines));
        rl.on('error', reject);
    });
}

/**
 * 读取文件后 N 行
 */
export async function readLastLines(filePath: string, n: number): Promise<string[]> {
    const stat = nodeFs.statSync(filePath);
    // 中小文件直接读全文
    if (stat.size < 2 * 1024 * 1024) {
        const content = nodeFs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        return lines.slice(-n);
    }
    // 大文件从末尾读取一块
    const chunkSize = Math.min(stat.size, n * 200); // 估算每行 ~200 字节
    const buffer = new Uint8Array(chunkSize);
    const fd = nodeFs.openSync(filePath, 'r');
    try {
        nodeFs.readSync(fd, buffer, 0, chunkSize, Math.max(0, stat.size - chunkSize));
    } finally {
        nodeFs.closeSync(fd);
    }
    const chunk = Buffer.from(buffer).toString('utf-8');
    const lines = chunk.split('\n');
    // 首行可能不完整，跳过
    return lines.slice(1).slice(-n);
}

/**
 * 读取指定行范围 (1-based, inclusive)
 */
export function readLineRange(filePath: string, start: number, end: number): Promise<{ lines: string[]; totalLines: number }> {
    return new Promise((resolve, reject) => {
        const lines: string[] = [];
        let lineNum = 0;
        let totalLines = 0;
        const rl = nodeReadline.createInterface({
            input: nodeFs.createReadStream(filePath, { encoding: 'utf-8' }),
            crlfDelay: Infinity
        });
        rl.on('line', (line: string) => {
            lineNum++;
            totalLines = lineNum;
            if (lineNum >= start && lineNum <= end) {
                lines.push(line);
            }
            // 不提前关闭，需要统计总行数
        });
        rl.on('close', () => resolve({ lines, totalLines }));
        rl.on('error', reject);
    });
}

/**
 * 统计文件行数
 */
export function countLines(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        let count = 0;
        const rl = nodeReadline.createInterface({
            input: nodeFs.createReadStream(filePath, { encoding: 'utf-8' }),
            crlfDelay: Infinity
        });
        rl.on('line', () => { count++; });
        rl.on('close', () => resolve(count));
        rl.on('error', reject);
    });
}

// ============================================================
// 格式化函数
// ============================================================

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

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

// ============================================================
// 路径 / 模式匹配
// ============================================================

export function shouldExclude(itemName: string, excludePatterns: string[]): boolean {
    if (excludePatterns.includes(itemName)) return true;
    for (const pattern of excludePatterns) {
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            if (regex.test(itemName)) return true;
        }
    }
    return false;
}

export function matchPattern(fileName: string, pattern: string, isRegex: boolean): boolean {
    try {
        if (isRegex) {
            return new RegExp(pattern, 'i').test(fileName);
        }
        const regexPattern = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp('^' + regexPattern + '$', 'i').test(fileName);
    } catch {
        return false;
    }
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
    const msg = error.message || String(error);
    if (msg.includes('ENOENT')) return new ViewerError(`文件不存在: ${filePath}`, 'NOT_FOUND');
    if (msg.includes('EACCES') || msg.includes('EPERM')) return new ViewerError(`没有权限访问: ${filePath}`, 'PERMISSION_DENIED');
    return new ViewerError(`操作失败: ${msg}`, 'UNKNOWN');
}
