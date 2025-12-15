/**
 * Viewer 工具组公共函数 - VFS 版本
 * 提供文件类型检测、大小格式化、流式读取等功能
 * 完全基于 IVFS 抽象，不依赖 Node.js
 */

import { IVFS } from '../../../../libs/vfs';

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
// 创建工具适配器
// ============================================================

export function createViewerUtils(vfs: IVFS) {
    const capabilities = vfs.getCapabilities?.() || {
        supportsRealPath: false,
        supportsBinary: false,
        supportsWatch: false,
        supportsStream: false,
        supportsAdvancedStream: false
    };

    // ============================================================
    // 文件类型检测
    // ============================================================

    /**
     * 检测文件是否为二进制文件
     * 方法：读取前 8KB，检查是否包含 null 字节或过多控制字符
     */
    async function isBinaryFile(filePath: string): Promise<boolean> {
        try {
            // 如果 VFS 支持二进制读取，使用 readFileBytes
            if (capabilities.supportsBinary && vfs.readFileBytes) {
                const buffer = await vfs.readFileBytes(filePath, 0, LIMITS.BINARY_DETECT_BYTES);

                if (buffer.length === 0) return false; // 空文件视为文本

                let nullBytes = 0;
                let controlBytes = 0;

                for (let i = 0; i < buffer.length; i++) {
                    const byte = buffer[i];

                    // Null 字节 - 明确的二进制标志
                    if (byte === 0) {
                        nullBytes++;
                        if (nullBytes > 1) return true;
                    }

                    // 控制字符（排除常见的 \n \r \t）
                    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
                        controlBytes++;
                    }
                }

                // 如果控制字符超过 10%，视为二进制
                return controlBytes / buffer.length > 0.1;
            }

            // Fallback: 读取文本内容检测
            const stat = await vfs.stat(filePath);
            if (stat.size > LIMITS.BINARY_DETECT_BYTES) {
                // 对于大文件，读取前N行检测
                if (capabilities.supportsAdvancedStream && vfs.readFirstLines) {
                    const lines = await vfs.readFirstLines(filePath, 10);
                    const sample = lines.join('\n');
                    return sample.includes('\0') || /[\x00-\x08\x0E-\x1F]/.test(sample);
                }
            }

            // 最终fallback：读取全文
            const content = await vfs.readFile(filePath);
            return content.includes('\0') || /[\x00-\x08\x0E-\x1F]/.test(content.substring(0, LIMITS.BINARY_DETECT_BYTES));

        } catch (error) {
            // 无法读取时保守处理
            return true;
        }
    }

    /**
     * 检测文件类型
     */
    async function detectFileType(filePath: string): Promise<'text' | 'binary' | 'directory'> {
        try {
            const stat = await vfs.stat(filePath);

            if (stat.isDirectory) {
                return 'directory';
            }

            // 快速路径：检查扩展名
            const ext = vfs.extname(filePath).slice(1).toLowerCase();
            if (TEXT_EXTENSIONS.has(ext)) {
                return 'text';
            }

            // 没有扩展名的常见文本文件
            const basename = vfs.basename(filePath).toLowerCase();
            const noExtTextFiles = [
                'readme', 'license', 'changelog', 'authors', 'contributors',
                'makefile', 'dockerfile', 'gemfile', 'rakefile', 'vagrantfile'
            ];
            if (noExtTextFiles.includes(basename)) {
                return 'text';
            }

            // 深度检测
            return await isBinaryFile(filePath) ? 'binary' : 'text';
        } catch (error: any) {
            throw new Error(`无法检测文件类型: ${error.message}`);
        }
    }

    // ============================================================
    // 文件读取
    // ============================================================

    /**
     * 安全读取文件全部内容
     * 包含大小检查和二进制检测
     */
    async function safeReadFile(filePath: string, maxSize: number = LIMITS.MAX_FILE_SIZE): Promise<{
        content?: string;
        error?: string;
        fileType?: 'text' | 'binary';
        size: number;
    }> {
        try {
            const stat = await vfs.stat(filePath);
            const size = stat.size;

            // 检查大小
            if (size > maxSize) {
                return {
                    error: `文件过大（${formatFileSize(size)}），超过限制（${formatFileSize(maxSize)}）`,
                    size,
                    fileType: 'text'
                };
            }

            // 检查类型
            const fileType = await detectFileType(filePath);
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
            const content = await vfs.readFile(filePath);
            return { content, size, fileType: 'text' };

        } catch (error: any) {
            return {
                error: `读取文件失败: ${error.message}`,
                size: 0
            };
        }
    }

    /**
     * 读取文件的前 N 行
     */
    async function readFirstLines(filePath: string, count: number): Promise<string[]> {
        if (capabilities.supportsAdvancedStream && vfs.readFirstLines) {
            return await vfs.readFirstLines(filePath, count);
        }
        // Fallback: 读取全文并切片
        const content = await vfs.readFile(filePath);
        return content.split('\n').slice(0, count);
    }

    /**
     * 读取文件的后 N 行
     */
    async function readLastLines(filePath: string, count: number): Promise<string[]> {
        if (capabilities.supportsAdvancedStream && vfs.readLastLines) {
            return await vfs.readLastLines(filePath, count);
        }
        // Fallback: 读取全文并切片
        const content = await vfs.readFile(filePath);
        const lines = content.split('\n');
        return lines.slice(-count);
    }

    /**
     * 读取指定行范围
     */
    async function readLineRange(
        filePath: string,
        start: number,
        end: number
    ): Promise<{ lines: string[]; totalLines?: number }> {
        // 使用 VFS 的 readLines 方法（0-based）
        const content = await vfs.readLines(filePath, start - 1, end);
        const lines = content.split('\n');

        // 计算总行数（如果支持）
        let totalLines: number | undefined;
        if (capabilities.supportsAdvancedStream && vfs.countLines) {
            totalLines = await vfs.countLines(filePath);
        }

        return { lines, totalLines };
    }

    /**
     * 快速统计文件行数
     */
    async function countLines(filePath: string): Promise<number> {
        if (capabilities.supportsAdvancedStream && vfs.countLines) {
            return await vfs.countLines(filePath);
        }
        // Fallback: 读取全文计数
        const content = await vfs.readFile(filePath);
        return content.split('\n').length;
    }

    // ============================================================
    // 格式化函数
    // ============================================================

    /**
     * 格式化文件大小
     */
    function formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = bytes / Math.pow(1024, i);
        return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    }

    /**
     * 为文本添加行号
     */
    function addLineNumbers(text: string, startLine: number = 1): string {
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
    function formatLineRange(start: number, end: number): string {
        if (start === end) return `L${start}`;
        return `L${start}-${end}`;
    }

    // ============================================================
    // 路径处理
    // ============================================================

    /**
     * 检查路径是否应该被排除
     */
    function shouldExclude(itemName: string, excludePatterns: string[]): boolean {
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
    function matchPattern(fileName: string, pattern: string, isRegex: boolean): boolean {
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
     * 搜索文件内容
     */
    async function searchInFile(
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

        // 读取文件内容
        const content = await vfs.readFile(filePath);
        const lines = content.split('\n');
        const matches: Array<{ lineNum: number; line: string; context?: string[] }> = [];
        const recentLines: string[] = [];  // 用于上下文

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];

            // 维护滚动窗口（用于上下文）
            recentLines.push(line);
            if (recentLines.length > contextLines * 2 + 1) {
                recentLines.shift();
            }

            // 检查匹配
            if (searchRegex.test(line)) {
                const context = contextLines > 0 ? [...recentLines] : undefined;
                matches.push({ lineNum: lineNum + 1, line: line.trim(), context });

                if (matches.length >= maxMatches) {
                    break;
                }
            }
        }

        return matches;
    }

    // ============================================================
    // 错误处理
    // ============================================================

    class ViewerError extends Error {
        constructor(
            message: string,
            public code: 'FILE_TOO_LARGE' | 'BINARY_FILE' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_RANGE' | 'UNKNOWN'
        ) {
            super(message);
            this.name = 'ViewerError';
        }
    }

    function handleFileError(error: any, filePath: string): ViewerError {
        const errorMsg = error.message || String(error);
        if (errorMsg.includes('ENOENT')) {
            return new ViewerError(`文件不存在: ${filePath}`, 'NOT_FOUND');
        }
        if (errorMsg.includes('EACCES') || errorMsg.includes('EPERM')) {
            return new ViewerError(`没有权限访问: ${filePath}`, 'PERMISSION_DENIED');
        }
        return new ViewerError(`操作失败: ${errorMsg}`, 'UNKNOWN');
    }

    // 返回所有工具函数
    return {
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
        formatLineRange,
        shouldExclude,
        matchPattern,
        searchInFile,
        ViewerError,
        handleFileError,
    };
}
