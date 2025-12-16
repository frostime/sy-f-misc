/**
 * 虚拟文件系统 - 类型定义
 */

/** 文件元信息 */
export interface IFileStat {
    size: number;
    isDirectory: boolean;
    isFile: boolean;
    isSymbolicLink?: boolean;
    mtime: Date;
    birthtime: Date;  // 创建时间，与 Node.js fs.Stats 保持一致
}

/** VFS 适配器能力描述 */
export interface VFSCapabilities {
    /** 是否支持获取真实路径 */
    supportsRealPath: boolean;
    /** 是否支持二进制文件 */
    supportsBinary: boolean;
    /** 是否支持文件监听 */
    supportsWatch: boolean;
    /** 是否支持流式读取 */
    supportsStream: boolean;
    /** 是否支持高级流读取（readFirstLines/readLastLines） */
    supportsAdvancedStream: boolean;
}

/** 核心文件系统接口 */
export interface IVFS {
    // 基础读写
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    appendFile(path: string, content: string): Promise<void>;

    // 元信息
    exists(path: string): Promise<boolean>;
    stat(path: string): Promise<IFileStat>;

    // 目录操作
    readdir(path: string): Promise<string[]>;
    mkdir(path: string): Promise<void>;

    // 删除
    unlink(path: string): Promise<void>;
    rmdir(path: string): Promise<void>;

    // 高级读取（支持分页）
    readLines(path: string, start: number, end: number): Promise<string>;

    // 文件操作
    copyFile(src: string, dest: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;

    // 二进制文件支持（可选）
    readFileBuffer?(path: string): Promise<Buffer>;
    writeFileBuffer?(path: string, buffer: Buffer): Promise<void>;
    readFileBytes?(path: string, start: number, length: number): Promise<Buffer>;

    // 流式读取增强（可选）
    readFirstLines?(path: string, count: number): Promise<string[]>;
    readLastLines?(path: string, count: number): Promise<string[]>;
    countLines?(path: string): Promise<number>;

    // 路径规范化（可选）
    normalizePath?(path: string): string;

    // 路径操作（必需，用于完全抽象化）
    basename(path: string, ext?: string): string;
    dirname(path: string): string;
    join(...paths: string[]): string;
    extname(path: string): string;
    resolve(...paths: string[]): string;

    // 环境检测
    isAvailable(): boolean;

    // 获取能力描述
    getCapabilities?(): VFSCapabilities;

    // 获取真实路径（可选，仅本地文件系统支持）
    toRealPath?(path: string): Promise<string | null>;

    // 将虚拟文件物化到真实文件系统（可选）
    materialize?(virtualPath: string, targetDir?: string): Promise<string>;
}

/** VFS 快照（用于持久化） */
export interface VFSSnapshot {
    files: Record<string, string>;
    timestamp: number;
}
