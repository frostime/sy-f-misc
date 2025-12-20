/**
 * Node.js 本地文件系统适配器
 */
import type { IVFS, IFileStat } from './types';

export const SIYUAN_DISK_PATH = {
    WORKSPACE: String(window.siyuan.config.system.workspaceDir),
    DATA_DIR: String(window.siyuan.config.system.dataDir),
}

export class LocalDiskVFS implements IVFS {
    private basePath: string;
    private fs: any = null;
    private pathModule: any = null;

    readonly SIYUAN_DISK_PATH = SIYUAN_DISK_PATH;

    /**
     * @param basePath 根目录路径，所有操作都限制在此目录内。传空则不限制。
     */
    constructor(basePath: string = '') {
        this.basePath = basePath;

        // 延迟加载，捕获错误
        try {
            this.fs = window?.require?.('fs') ?? require('fs');
            this.pathModule = window?.require?.('path') ?? require('path');
        } catch (e) {
            console.warn('[LocalDiskVFS] Node.js modules not available:', e);
        }
    }

    /** 检查适配器是否可用 */
    public isAvailable(): boolean {
        return !!(this.fs && this.pathModule);
    }

    /** 获取能力描述 */
    public getCapabilities() {
        return {
            supportsRealPath: true,
            supportsBinary: true,
            supportsWatch: true,
            supportsStream: true,
            supportsAdvancedStream: true
        };
    }

    /** 路径规范化：Node.js path.normalize 处理跨平台 */
    normalizePath(path: string): string {
        this.ensureAvailable();
        return this.pathModule.normalize(path);
    }

    // ========== 路径操作 ==========

    basename(path: string, ext?: string): string {
        this.ensureAvailable();
        return this.pathModule.basename(path, ext);
    }

    dirname(path: string): string {
        this.ensureAvailable();
        return this.pathModule.dirname(path);
    }

    join(...paths: string[]): string {
        this.ensureAvailable();
        return this.pathModule.join(...paths);
    }

    extname(path: string): string {
        this.ensureAvailable();
        return this.pathModule.extname(path);
    }

    resolve(...paths: string[]): string {
        this.ensureAvailable();
        if (!this.basePath) {
            return this.pathModule.resolve(...paths);
        }

        const normalizedBase = this.pathModule.resolve(this.basePath);
        const resolved = this.pathModule.resolve(normalizedBase, ...paths.map(p =>
            p.replace(/^[/\\]+/, '')  // 移除开头斜杠
        ));

        // 规范化后比较，并确保是目录边界（防止 /base-other 被误判为 /base 子目录）
        const resolvedNorm = this.pathModule.resolve(resolved);
        const baseWithSep = normalizedBase.endsWith(this.pathModule.sep)
            ? normalizedBase
            : normalizedBase + this.pathModule.sep;

        if (resolvedNorm !== normalizedBase && !resolvedNorm.startsWith(baseWithSep)) {
            throw new Error(`Path escape detected: ${paths.join(', ')} -> ${resolvedNorm}`);
        }
        return resolvedNorm;
    }

    /** 确保环境可用 */
    private ensureAvailable(): void {
        if (!this.isAvailable()) {
            throw new Error('LocalDiskVFS is not available in current environment (browser or modules not loaded)');
        }
    }

    /** 解析并限制路径 */
    // private resolve(p: string): string {
    //     this.ensureAvailable();
    //     if (!this.basePath) {
    //         return this.pathModule.resolve(p);
    //     }
    //     // 沙箱限制：确保路径在 basePath 内
    //     const resolved = this.pathModule.resolve(this.basePath, p.replace(/^\/+/, ''));
    //     if (!resolved.startsWith(this.pathModule.resolve(this.basePath))) {
    //         throw new Error(`Path escape detected: ${p}`);
    //     }
    //     return resolved;
    // }

    async readFile(path: string): Promise<string> {
        this.ensureAvailable();
        return this.fs.promises.readFile(this.resolve(path), 'utf-8');
    }

    async writeFile(path: string, content: string): Promise<void> {
        this.ensureAvailable();
        const target = this.resolve(path);
        await this.fs.promises.mkdir(this.pathModule.dirname(target), { recursive: true });
        await this.fs.promises.writeFile(target, content, 'utf-8');
    }

    async appendFile(path: string, content: string): Promise<void> {
        this.ensureAvailable();
        const target = this.resolve(path);
        await this.fs.promises.mkdir(this.pathModule.dirname(target), { recursive: true });
        await this.fs.promises.appendFile(target, content, 'utf-8');
    }

    async exists(path: string): Promise<boolean> {
        this.ensureAvailable();
        try {
            await this.fs.promises.access(this.resolve(path));
            return true;
        } catch {
            return false;
        }
    }

    async stat(path: string): Promise<IFileStat> {
        this.ensureAvailable();
        const stats = await this.fs.promises.stat(this.resolve(path));
        return {
            size: stats.size,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            isSymbolicLink: stats.isSymbolicLink?.() ?? false,
            mtime: stats.mtime,
            birthtime: stats.birthtime,
        };
    }

    async readdir(path: string): Promise<string[]> {
        this.ensureAvailable();
        return this.fs.promises.readdir(this.resolve(path));
    }

    async mkdir(path: string): Promise<void> {
        this.ensureAvailable();
        await this.fs.promises.mkdir(this.resolve(path), { recursive: true });
    }

    async unlink(path: string): Promise<void> {
        this.ensureAvailable();
        await this.fs.promises.unlink(this.resolve(path));
    }

    async rmdir(path: string): Promise<void> {
        this.ensureAvailable();
        await this.fs.promises.rm(this.resolve(path), { recursive: true, force: true });
    }

    async readLines(path: string, start: number, end: number): Promise<string> {
        this.ensureAvailable();
        const readline = window?.require?.('readline') ?? require('readline');
        const target = this.resolve(path);

        return new Promise((resolve, reject) => {
            const stream = this.fs.createReadStream(target, { encoding: 'utf-8' });
            const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

            const lines: string[] = [];
            let lineNum = 0;

            rl.on('line', (line: string) => {
                if (lineNum >= start && lineNum < end) {
                    lines.push(line);
                }
                lineNum++;
                if (lineNum >= end) {
                    rl.close();
                    stream.destroy();
                }
            });

            rl.on('close', () => resolve(lines.join('\n')));
            rl.on('error', reject);
        });
    }

    async copyFile(src: string, dest: string): Promise<void> {
        this.ensureAvailable();
        const srcPath = this.resolve(src);
        const destPath = this.resolve(dest);

        // 确保目标目录存在
        await this.fs.promises.mkdir(this.pathModule.dirname(destPath), { recursive: true });
        await this.fs.promises.copyFile(srcPath, destPath);
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        this.ensureAvailable();
        const oldResolved = this.resolve(oldPath);
        const newResolved = this.resolve(newPath);

        // 确保目标目录存在
        await this.fs.promises.mkdir(this.pathModule.dirname(newResolved), { recursive: true });
        await this.fs.promises.rename(oldResolved, newResolved);
    }

    async toRealPath(path: string): Promise<string | null> {
        this.ensureAvailable();
        return this.resolve(path);
    }

    async materialize(virtualPath: string, _targetDir?: string): Promise<string> {
        // LocalDiskVFS 本身就是真实文件系统，直接返回路径
        // targetDir 参数在此处不需要，因为文件已经在真实文件系统上
        return this.resolve(virtualPath);
    }

    // ========== 二进制文件支持 ==========

    async readFileBuffer(path: string): Promise<Buffer> {
        this.ensureAvailable();
        return this.fs.promises.readFile(this.resolve(path));
    }

    async writeFileBuffer(path: string, buffer: Buffer): Promise<void> {
        this.ensureAvailable();
        const target = this.resolve(path);
        await this.fs.promises.mkdir(this.pathModule.dirname(target), { recursive: true });
        await this.fs.promises.writeFile(target, buffer);
    }

    async readFileBytes(path: string, start: number, length: number): Promise<Buffer> {
        this.ensureAvailable();
        const target = this.resolve(path);
        const buffer = Buffer.alloc(length);

        return new Promise((resolve, reject) => {
            const fd = this.fs.openSync(target, 'r');
            try {
                const bytesRead = this.fs.readSync(fd, buffer, 0, length, start);
                this.fs.closeSync(fd);
                resolve(buffer.slice(0, bytesRead));
            } catch (error) {
                this.fs.closeSync(fd);
                reject(error);
            }
        });
    }

    // ========== 高级流式读取 ==========

    async readFirstLines(path: string, count: number): Promise<string[]> {
        this.ensureAvailable();
        const readline = window?.require?.('readline') ?? require('readline');
        const target = this.resolve(path);

        return new Promise((resolve, reject) => {
            const lines: string[] = [];
            const stream = this.fs.createReadStream(target, { encoding: 'utf-8' });
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

    async readLastLines(path: string, count: number): Promise<string[]> {
        this.ensureAvailable();
        const target = this.resolve(path);

        return new Promise((resolve, reject) => {
            const stats = this.fs.statSync(target);
            const bufferSize = Math.min(64 * 1024, stats.size); // 64KB 或文件大小
            const buffer = Buffer.alloc(bufferSize);

            const fd = this.fs.openSync(target, 'r');
            try {
                const bytesRead = this.fs.readSync(fd, buffer, 0, bufferSize, Math.max(0, stats.size - bufferSize));
                this.fs.closeSync(fd);

                const text = buffer.slice(0, bytesRead).toString('utf-8');
                const allLines = text.split('\n');
                const lines = allLines.slice(-count);
                resolve(lines);
            } catch (error) {
                this.fs.closeSync(fd);
                reject(error);
            }
        });
    }

    async countLines(path: string): Promise<number> {
        this.ensureAvailable();
        const readline = window?.require?.('readline') ?? require('readline');
        const target = this.resolve(path);

        return new Promise((resolve, reject) => {
            let count = 0;
            const stream = this.fs.createReadStream(target, { encoding: 'utf-8' });
            const rl = readline.createInterface({ input: stream });

            rl.on('line', () => count++);
            rl.on('close', () => resolve(count));
            rl.on('error', reject);
            stream.on('error', reject);
        });
    }
}
