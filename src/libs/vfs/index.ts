/**
 * 虚拟文件系统 - 统一入口
 *
 * 设计原则：
 * 1. 所有 FS 都通过 mount 统一管理，包括默认 FS（协议为空字符串）
 * 2. 路径格式：`protocol://path` 或直接 `/path`（使用默认 FS）
 * 3. VFSManager 实现 IVFS 接口，可作为普通 FS 使用
 */

import type { IVFS, VFSCapabilities } from './types';
import { InMemoryVFS } from './vfs-inmemory-adpater';
import { LocalDiskVFS } from './vfs-localdisk-adpater';

// ========== 导出类型和实现 ==========
export type { IVFS, IFileStat, VFSSnapshot, VFSCapabilities } from './types';
export { InMemoryVFS } from './vfs-inmemory-adpater';
export { LocalDiskVFS } from './vfs-localdisk-adpater';

// ========== 常量 ==========

/** 默认 FS 的协议标识（空字符串） */
const DEFAULT_PROTOCOL = '';

// ========== 类型定义 ==========

/** 路径解析结果（内部使用） */
interface PathHandler {
    fs: IVFS;
    path: string;
    protocol: string;
}

/** 挂载点信息 */
export interface MountInfo {
    protocol: string;
    fs: IVFS;
    isDefault: boolean;
}

// ========== VFS 管理器 ==========

export class VFSManager {
    /** 所有挂载点，key 为协议名（空字符串表示默认） */
    private readonly mounts = new Map<string, IVFS>();

    // ═══════════════════════════════════════════════════════════════
    // 挂载管理
    // ═══════════════════════════════════════════════════════════════

    /**
     * 挂载文件系统
     * @param protocol 协议名（如 'memory', 'disk'），空字符串或 null 表示默认 FS
     * @param fs 文件系统实例
     */
    mount(protocol: string | null, fs: IVFS): this {
        const key = this.normalizeProtocol(protocol);
        this.mounts.set(key, fs);
        return this;
    }

    /** 卸载文件系统 */
    unmount(protocol: string | null): boolean {
        const key = this.normalizeProtocol(protocol);
        return this.mounts.delete(key);
    }

    /** 检查协议是否已挂载 */
    has(protocol: string | null): boolean {
        const key = this.normalizeProtocol(protocol);
        return this.mounts.has(key);
    }

    /** 获取指定协议的文件系统 */
    get(protocol: string | null): IVFS | undefined {
        const key = this.normalizeProtocol(protocol);
        return this.mounts.get(key);
    }

    /** 获取所有挂载信息 */
    listMounts(): MountInfo[] {
        return Array.from(this.mounts.entries()).map(([protocol, fs]) => ({
            protocol,
            fs,
            isDefault: protocol === DEFAULT_PROTOCOL,
        }));
    }

    /** 获取已挂载的协议列表（不含默认） */
    getProtocols(): string[] {
        return Array.from(this.mounts.keys()).filter(p => p !== DEFAULT_PROTOCOL);
    }

    /** 检查是否有任何文件系统可用 */
    isAvailable(): boolean {
        return this.mounts.size > 0;
    }

    /** 规范化协议名 */
    private normalizeProtocol(protocol: string | null | undefined): string {
        if (protocol === null || protocol === undefined) {
            return DEFAULT_PROTOCOL;
        }
        return protocol.replace(/:\/\/$/, '').toLowerCase();
    }

    // ═══════════════════════════════════════════════════════════════
    // 路径解析（内部）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 解析 VFS 路径，返回对应的 FS 和相对路径
     * 
     * 支持格式：
     * - `memory:///path` 或 `memory://path` → 使用 memory 协议
     * - `/path` → 使用默认 FS
     */
    route(fullPath: string): PathHandler {
        // 尝试匹配 protocol://path 格式
        const match = fullPath.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\/\/\/?(.*)$/);

        if (match) {
            const [, rawProtocol, relativePath] = match;
            const protocol = this.normalizeProtocol(rawProtocol);
            const fs = this.mounts.get(protocol);

            if (!fs) {
                throw new Error(`[VFS] Unknown protocol: ${rawProtocol}://`);
            }

            return {
                fs,
                path: '/' + relativePath.replace(/^\/+/, ''),
                protocol,
            };
        }

        // 无协议前缀，使用默认 FS
        const defaultFS = this.mounts.get(DEFAULT_PROTOCOL);
        if (!defaultFS) {
            throw new Error(`[VFS] No default filesystem mounted for path: ${fullPath}`);
        }

        return {
            fs: defaultFS,
            path: fullPath,
            protocol: DEFAULT_PROTOCOL,
        };
    }





    async copyFile(src: string, dest: string): Promise<void> {
        const srcParsed = this.route(src);
        const destParsed = this.route(dest);

        // 同一 FS 内复制
        if (srcParsed.fs === destParsed.fs) {
            return srcParsed.fs.copyFile(srcParsed.path, destParsed.path);
        }

        // 跨 FS 复制：读取 → 写入
        const content = await srcParsed.fs.readFile(srcParsed.path);
        await destParsed.fs.writeFile(destParsed.path, content);
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        const oldParsed = this.route(oldPath);
        const newParsed = this.route(newPath);

        // 同一 FS 内重命名
        if (oldParsed.fs === newParsed.fs) {
            return oldParsed.fs.rename(oldParsed.path, newParsed.path);
        }

        // 跨 FS 移动：复制 → 删除
        await this.copyFile(oldPath, newPath);
        await oldParsed.fs.unlink(oldParsed.path);
    }

    // ═══════════════════════════════════════════════════════════════
    // 物化（虚拟文件 → 真实文件）
    // ═══════════════════════════════════════════════════════════════

    async materialize(virtualPath: string, targetDir?: string): Promise<string> {
        const { fs, path: p } = this.route(virtualPath);

        // 优先使用适配器自己的实现
        if (fs.materialize) {
            return fs.materialize(p, targetDir);
        }

        // 降级：读取内容写入临时文件
        const os = globalThis.require?.('os');
        const pathModule = globalThis.require?.('path');
        const nodeFs = globalThis.require?.('fs');

        if (!os || !pathModule || !nodeFs) {
            throw new Error('[VFS] Cannot materialize: Node.js modules not available');
        }

        const tmpdir = targetDir || os.tmpdir();
        const filename = pathModule.basename(virtualPath);
        const tempPath = pathModule.join(tmpdir, `vfs_${Date.now()}_${filename}`);

        const content = await fs.readFile(p);
        await nodeFs.promises.writeFile(tempPath, content, 'utf-8');

        return tempPath;
    }

    // ═══════════════════════════════════════════════════════════════
    // 元信息
    // ═══════════════════════════════════════════════════════════════

    getCapabilities(): VFSCapabilities {
        // 合并所有已挂载适配器的能力
        const caps: VFSCapabilities = {
            supportsRealPath: false,
            supportsBinary: false,
            supportsWatch: false,
            supportsStream: false,
            supportsAdvancedStream: false,
        };

        for (const fs of this.mounts.values()) {
            const fsCaps = fs.getCapabilities?.();
            if (fsCaps) {
                caps.supportsRealPath ||= fsCaps.supportsRealPath;
                caps.supportsBinary ||= fsCaps.supportsBinary;
                caps.supportsWatch ||= fsCaps.supportsWatch;
                caps.supportsStream ||= fsCaps.supportsStream;
                caps.supportsAdvancedStream ||= fsCaps.supportsAdvancedStream;
            }
        }

        return caps;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 工厂函数
// ═══════════════════════════════════════════════════════════════════════

/** 挂载配置 */
export interface MountConfig {
    /** 协议名，null 或空字符串表示默认 FS */
    protocol: string | null;
    /** VFS 实例 */
    fs: IVFS;
}

/** 内存 FS 快捷配置 */
export interface MemoryFSConfig {
    /** 协议名，默认 'memory' */
    protocol?: string;
    /** 初始化模式 */
    initMode?: 'default' | 'empty' | ((fs: InMemoryVFS) => void);
}

/** 本地磁盘 FS 快捷配置 */
export interface LocalFSConfig {
    /** 协议名，null 表示作为默认 FS */
    protocol?: string | null;
    /** 基础路径（沙箱根目录） */
    basePath?: string;
}

/** createVFS 选项 */
export interface CreateVFSOptions {
    /** 自定义挂载列表 */
    mounts?: MountConfig[];
    /** 快捷：挂载内存 FS */
    memory?: boolean | MemoryFSConfig;
    /** 快捷：挂载本地磁盘 FS */
    local?: boolean | LocalFSConfig;
}

/**
 * 创建 VFS 管理器
 *
 * @example
 * // 最简配置
 * const vfs = createVFS({ memory: true });
 *
 * @example
 * // 完整配置
 * const vfs = createVFS({
 *     memory: { protocol: 'mem', initMode: 'default' },
 *     local: { protocol: null, basePath: '/data' },  // 作为默认 FS
 *     mounts: [
 *         { protocol: 'custom', fs: new MyCustomVFS() }
 *     ]
 * });
 */
export function createVFS(options: CreateVFSOptions = {}): VFSManager {
    const manager = new VFSManager();
    const { mounts = [], memory, local } = options;

    // 1. 处理内存 FS（任何环境可用）
    if (memory) {
        const config: MemoryFSConfig = memory === true ? {} : memory;
        const protocol = config.protocol ?? 'memory';
        const initMode = config.initMode ?? 'default';

        manager.mount(protocol, new InMemoryVFS(initMode));
    }

    // 2. 处理本地磁盘 FS（仅桌面端可用）
    if (local) {
        const config: LocalFSConfig = local === true ? {} : local;
        const protocol = config.protocol ?? null;
        const basePath = config.basePath ?? '';

        const localFS = new LocalDiskVFS(basePath);

        if (localFS.isAvailable()) {
            manager.mount(protocol, localFS);
        } else {
            console.warn('[VFS] LocalDiskVFS not available in current environment');
        }
    }

    // 3. 处理自定义挂载（可覆盖前面的配置）
    for (const { protocol, fs } of mounts) {
        if (fs.isAvailable?.() === false) {
            const name = protocol ?? 'default';
            console.warn(`[VFS] Skipping unavailable adapter: ${name}`);
            continue;
        }
        manager.mount(protocol, fs);
    }

    return manager;
}

// ═══════════════════════════════════════════════════════════════════════
// 全局单例
// ═══════════════════════════════════════════════════════════════════════

// let globalVFS: VFSManager | null = null;

// /** 获取全局 VFS 实例（惰性初始化） */
// export function getGlobalVFS(): VFSManager {
//     if (!globalVFS) {
//         globalVFS = createVFS({ memory: true });
//     }
//     return globalVFS;
// }

// /** 设置全局 VFS 实例 */
// export function setGlobalVFS(vfs: VFSManager): void {
//     globalVFS = vfs;
// }

// /** 便捷导出：全局 VFS 代理 */
// export const vfs: VFSManager = new Proxy({} as VFSManager, {
//     get(_, prop: string | symbol) {
//         return Reflect.get(getGlobalVFS(), prop);
//     },
// });
