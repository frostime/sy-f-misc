/**
 * 虚拟文件系统 - 统一入口
 *
 * 使用方式：
 *   import { vfs, createVFS } from './vfs';
 *
 *   // 使用全局单例
 *   vfs.mount('memory', new InMemoryVFS(true));
 *   await vfs.writeFile('memory:///context/task.md', '...');
 *
 *   // 或创建独立实例
 *   const myVFS = createVFS({ mountMemory: true });
 */

import type { IVFS, IFileStat } from './types';
import { InMemoryVFS } from './vfs-inmemory-adpater';
import { LocalDiskVFS } from './vfs-localdisk-adpater';

// ========== 导出类型和实现 ==========
export type { IVFS, IFileStat, VFSSnapshot, VFSCapabilities } from './types';
export { InMemoryVFS } from './vfs-inmemory-adpater';
export { LocalDiskVFS } from './vfs-localdisk-adpater';

// ========== 文件系统管理器 ==========

export class VFSManager implements IVFS {
    private mounts = new Map<string, IVFS>();
    private defaultFS: IVFS | null = null;

    /**
     * 挂载文件系统
     * @param protocol 协议名（如 'memory', 'siyuan'），传 null 设为默认
     */
    mount(protocol: string | null, fs: IVFS): this {
        if (!protocol) {
            this.defaultFS = fs;
        } else {
            this.mounts.set(protocol.replace(/:\/\/$/, ''), fs);
        }
        return this;
    }

    /** 卸载 */
    unmount(protocol: string): boolean {
        return this.mounts.delete(protocol);
    }

    /** 获取已挂载的协议列表 */
    getMountedProtocols(): string[] {
        return Array.from(this.mounts.keys());
    }

    /**
     * 解析路径，返回对应的 FS 和相对路径
     * 支持格式：memory:///path 或 memory://path 或 /path（默认 FS）
     */
    resolve(fullPath: string): { fs: IVFS; path: string } {
        const match = fullPath.match(/^([a-zA-Z0-9_-]+):\/\/\/?(.*)$/);

        if (match) {
            const [, protocol, relativePath] = match;
            const adapter = this.mounts.get(protocol);
            if (!adapter) {
                throw new Error(`Unknown protocol: ${protocol}://`);
            }
            return {
                fs: adapter,
                path: '/' + relativePath.replace(/^\/+/, ''),
            };
        }

        if (this.defaultFS) {
            return { fs: this.defaultFS, path: fullPath };
        }

        throw new Error(`No default filesystem mounted for: ${fullPath}`);
    }

    // ========== IFileSystem 代理实现 ==========

    async readFile(path: string): Promise<string> {
        const { fs, path: p } = this.resolve(path);
        return fs.readFile(p);
    }

    async writeFile(path: string, content: string): Promise<void> {
        const { fs, path: p } = this.resolve(path);
        return fs.writeFile(p, content);
    }

    async appendFile(path: string, content: string): Promise<void> {
        const { fs, path: p } = this.resolve(path);
        return fs.appendFile(p, content);
    }

    async exists(path: string): Promise<boolean> {
        try {
            const { fs, path: p } = this.resolve(path);
            return await fs.exists(p);
        } catch {
            return false;
        }
    }

    async stat(path: string): Promise<IFileStat> {
        const { fs, path: p } = this.resolve(path);
        return fs.stat(p);
    }

    async readdir(path: string): Promise<string[]> {
        const { fs, path: p } = this.resolve(path);
        return fs.readdir(p);
    }

    async mkdir(path: string): Promise<void> {
        const { fs, path: p } = this.resolve(path);
        return fs.mkdir(p);
    }

    async unlink(path: string): Promise<void> {
        const { fs, path: p } = this.resolve(path);
        return fs.unlink(p);
    }

    async rmdir(path: string): Promise<void> {
        const { fs, path: p } = this.resolve(path);
        return fs.rmdir(p);
    }

    async readLines(path: string, start: number, end: number): Promise<string> {
        const { fs, path: p } = this.resolve(path);
        return fs.readLines(p, start, end);
    }

    async copyFile(src: string, dest: string): Promise<void> {
        const { fs: srcFs, path: srcPath } = this.resolve(src);
        const { fs: destFs, path: destPath } = this.resolve(dest);

        // 如果源和目标在同一文件系统，直接调用
        if (srcFs === destFs) {
            return srcFs.copyFile(srcPath, destPath);
        }

        // 跨文件系统复制：读取后写入
        const content = await srcFs.readFile(srcPath);
        await destFs.writeFile(destPath, content);
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        const { fs: oldFs, path: oldP } = this.resolve(oldPath);
        const { fs: newFs, path: newP } = this.resolve(newPath);

        // 如果在同一文件系统，直接调用
        if (oldFs === newFs) {
            return oldFs.rename(oldP, newP);
        }

        // 跨文件系统移动：复制后删除
        await this.copyFile(oldPath, newPath);
        await oldFs.unlink(oldP);
    }

    isAvailable(): boolean {
        // VFSManager 本身总是可用的
        return true;
    }

    getCapabilities() {
        // 返回所有已挂载适配器的能力并集
        const capabilities = {
            supportsRealPath: false,
            supportsBinary: false,
            supportsWatch: false,
            supportsStream: false,
            supportsAdvancedStream: false
        };

        for (const adapter of this.mounts.values()) {
            if (adapter.getCapabilities) {
                const caps = adapter.getCapabilities();
                capabilities.supportsRealPath = capabilities.supportsRealPath || caps.supportsRealPath;
                capabilities.supportsBinary = capabilities.supportsBinary || caps.supportsBinary;
                capabilities.supportsWatch = capabilities.supportsWatch || caps.supportsWatch;
                capabilities.supportsStream = capabilities.supportsStream || caps.supportsStream;
                capabilities.supportsAdvancedStream = capabilities.supportsAdvancedStream || caps.supportsAdvancedStream;
            }
        }

        return capabilities;
    }

    normalizePath(path: string): string {
        const { fs } = this.resolve(path);
        if (fs.normalizePath) {
            return fs.normalizePath(path);
        }
        // 默认：统一使用正斜杠
        return path.replace(/\\/g, '/');
    }

    // ============ Binary Operations ============
    async readFileBuffer(path: string): Promise<Buffer> {
        const { fs, path: resolvedPath } = this.resolve(path);
        if (!fs.readFileBuffer) {
            throw new Error(`readFileBuffer not supported by ${path} filesystem`);
        }
        return await fs.readFileBuffer(resolvedPath);
    }

    async writeFileBuffer(path: string, buffer: Buffer): Promise<void> {
        const { fs, path: resolvedPath } = this.resolve(path);
        if (!fs.writeFileBuffer) {
            throw new Error(`writeFileBuffer not supported by ${path} filesystem`);
        }
        await fs.writeFileBuffer(resolvedPath, buffer);
    }

    async readFileBytes(path: string, start: number, length: number): Promise<Buffer> {
        const { fs, path: resolvedPath } = this.resolve(path);
        if (!fs.readFileBytes) {
            throw new Error(`readFileBytes not supported by ${path} filesystem`);
        }
        return await fs.readFileBytes(resolvedPath, start, length);
    }

    // ============ Advanced Stream Operations ============
    async readFirstLines(path: string, count: number): Promise<string[]> {
        const { fs, path: resolvedPath } = this.resolve(path);
        if (!fs.readFirstLines) {
            throw new Error(`readFirstLines not supported by ${path} filesystem`);
        }
        return await fs.readFirstLines(resolvedPath, count);
    }

    async readLastLines(path: string, count: number): Promise<string[]> {
        const { fs, path: resolvedPath } = this.resolve(path);
        if (!fs.readLastLines) {
            throw new Error(`readLastLines not supported by ${path} filesystem`);
        }
        return await fs.readLastLines(resolvedPath, count);
    }

    async countLines(path: string): Promise<number> {
        const { fs, path: resolvedPath } = this.resolve(path);
        if (!fs.countLines) {
            throw new Error(`countLines not supported by ${path} filesystem`);
        }
        return await fs.countLines(resolvedPath);
    }

    async materialize(virtualPath: string, targetDir?: string): Promise<string> {
        const { fs, path: p } = this.resolve(virtualPath);

        // 如果适配器支持 materialize，直接调用
        if (fs.materialize) {
            return fs.materialize(p, targetDir);
        }

        // 否则，读取内容并写入到临时目录
        const os = window?.require?.('os');
        const pathModule = window?.require?.('path');

        if (!os || !pathModule) {
            throw new Error('Cannot materialize: Node.js modules not available');
        }

        const tmpdir = targetDir || os.tmpdir();
        const filename = pathModule.basename(virtualPath);
        const tempPath = pathModule.join(tmpdir, `vfs_${Date.now()}_${filename}`);

        // 读取虚拟文件内容并写入真实文件
        const content = await fs.readFile(p);
        const localFs = window?.require?.('fs');
        if (!localFs) {
            throw new Error('Cannot materialize: fs module not available');
        }

        await localFs.promises.writeFile(tempPath, content, 'utf-8');
        return tempPath;
    }
}

// ========== 工厂函数 ==========

/** 挂载点配置 */
export interface MountOption {
    /** 协议名，传 null 表示默认 FS（无协议路径） */
    protocol: string | null;
    /** VFS 实例 */
    fs: IVFS;
}

/** 快捷配置选项（向后兼容 + 灵活扩展） */
export interface CreateVFSOptions {
    /** 自定义挂载列表（优先级最高） */
    mounts?: MountOption[];

    /** 快捷：挂载内存 FS 到 memory:// */
    memory?: boolean | {
        protocol?: string;  // 默认 'memory'，可自定义如 'ram'
        initMode?: 'default' | 'empty' | ((fs: InMemoryVFS) => void);
    };

    /** 快捷：挂载本地磁盘 */
    local?: boolean | {
        protocol?: string | null;  // 默认 null（作为默认 FS），可指定如 'disk'
        basePath?: string;
    };
}

/**
 * 创建 VFS 管理器
 * 
 * @example
 * // 方式1：完全自定义
 * const vfs = createVFS({
 *     mounts: [
 *         { protocol: 'memory', fs: new InMemoryVFS('default') },
 *         { protocol: 'project', fs: new LocalDiskVFS('/my/project') },
 *         { protocol: null, fs: new LocalDiskVFS() }  // 默认 FS
 *     ]
 * });
 * 
 * @example
 * // 方式2：快捷配置
 * const vfs = createVFS({
 *     memory: { protocol: 'ram', initMode: 'default' },
 *     local: { protocol: 'disk', basePath: '/data' }
 * });
 * 
 * @example
 * // 方式3：混合（快捷 + 自定义）
 * const vfs = createVFS({
 *     memory: true,  // 自动挂载到 memory://
 *     mounts: [
 *         { protocol: 'siyuan', fs: new SiYuanVFS({ token: 'xxx' }) }
 *     ]
 * });
 */
export function createVFS(options: CreateVFSOptions = {}): VFSManager {
    const manager = new VFSManager();
    const { mounts = [], memory, local } = options;

    // 1. 处理快捷配置：Memory（任何环境都可用）
    if (memory) {
        const memConfig = typeof memory === 'boolean' ? {} : memory;
        const protocol = memConfig.protocol ?? 'memory';
        const initMode = memConfig.initMode ?? 'default';

        const memFS = new InMemoryVFS(initMode);
        manager.mount(protocol, memFS);
    }

    // 2. 处理快捷配置：Local（仅桌面端可用）
    if (local) {
        const localConfig = typeof local === 'boolean' ? {} : local;
        const protocol = localConfig.protocol ?? null;
        const basePath = localConfig.basePath ?? '';

        const localFS = new LocalDiskVFS(basePath);

        // ✅ 检查环境可用性
        if (localFS.isAvailable()) {
            manager.mount(protocol, localFS);
        } else {
            console.warn('[VFS] LocalDiskVFS not available in current environment (browser or Node.js modules missing)');
        }
    }

    // 3. 处理自定义挂载列表（优先级最高，可覆盖快捷配置）
    mounts.forEach(({ protocol, fs }) => {
        // 检查适配器是否可用
        if ('isAvailable' in fs && typeof fs.isAvailable === 'function') {
            if (!fs.isAvailable()) {
                console.warn(`[VFS] Skipping unavailable FS adapter: ${protocol || 'default'}`);
                return;
            }
        }
        manager.mount(protocol, fs);
    });

    return manager;
}

// ========== 全局单例 ==========

/** 全局 VFS 实例（延迟初始化） */
let _globalVFS: VFSManager | null = null;

export function getGlobalVFS(): VFSManager {
    if (!_globalVFS) {
        _globalVFS = createVFS();
    }
    return _globalVFS;
}

/** 便捷导出：全局 VFS */
export const vfs = new Proxy({} as VFSManager, {
    get(_, prop) {
        return (getGlobalVFS() as any)[prop];
    },
});
