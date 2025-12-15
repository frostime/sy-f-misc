/**
 * 内存虚拟文件系统实现
 */
import type { IVFS, IFileStat, VFSSnapshot } from './types';

/** 虚拟节点 */
class VNode {
    type: 'file' | 'directory';
    content: string;
    children: Map<string, VNode>;
    created: Date;
    modified: Date;

    constructor(type: 'file' | 'directory') {
        this.type = type;
        this.content = '';
        this.children = new Map();
        this.created = new Date();
        this.modified = new Date();
    }
}


export class InMemoryVFS implements IVFS {
    private root: VNode;

    /**
     * @param initMode 初始化模式
     *   - 'default': 创建推荐的 Agent 目录结构
     *   - 'empty': 空白文件系统
     *   - Function: 自定义初始化函数
     */
    constructor(initMode?: 'default' | 'empty' | ((fs: InMemoryVFS) => void)) {
        this.root = new VNode('directory');

        if (initMode === 'default') {
            this.initDefaultStructure();
        } else if (typeof initMode === 'function') {
            initMode(this);
        }
        // 'empty' 或 undefined：不做任何操作
    }

    /** 检查适配器是否可用（内存 FS 始终可用） */
    isAvailable(): boolean {
        return true;
    }

    /** 获取能力描述 */
    getCapabilities() {
        return {
            supportsRealPath: false,
            supportsBinary: false,
            supportsWatch: false,
            supportsStream: false,
            supportsAdvancedStream: true  // 支持高级流读取
        };
    }

    /** 路径规范化：统一将反斜杠转为正斜杠，处理 . 和 .. */
    normalizePath(path: string): string {
        let result = path
            .replace(/\\/g, '/')           // 统一斜杠
            .replace(/\/+/g, '/')          // 合并连续斜杠
            .replace(/\/\.\//g, '/')       // 移除 /./
            .replace(/\/\.$/, '/');        // 移除末尾 /.

        // 处理 ..
        const parts = result.split('/').filter(Boolean);
        const stack: string[] = [];
        for (const part of parts) {
            if (part === '..') {
                stack.pop();
            } else if (part !== '.') {
                stack.push(part);
            }
        }
        return '/' + stack.join('/');
    }

    // ========== 路径操作 ==========

    basename(path: string, ext?: string): string {
        const normalized = this.normalizePath(path);
        const parts = normalized.split('/');
        let base = parts[parts.length - 1] || '';
        if (ext && base.endsWith(ext)) {
            base = base.slice(0, -ext.length);
        }
        return base;
    }

    dirname(path: string): string {
        const normalized = this.normalizePath(path);
        const parts = normalized.split('/');
        parts.pop();
        return parts.length > 0 ? parts.join('/') || '/' : '/';
    }

    join(...paths: string[]): string {
        const normalized = paths.map(p => this.normalizePath(p));
        let result = normalized.join('/');
        // 移除多余的斜杠
        result = result.replace(/\/+/g, '/');
        // 处理开头和结尾
        if (!result.startsWith('/') && normalized[0]?.startsWith('/')) {
            result = '/' + result;
        }
        return this.normalizePath(result);
    }

    extname(path: string): string {
        const normalized = this.normalizePath(path);
        const base = this.basename(normalized);
        const idx = base.lastIndexOf('.');
        return idx > 0 ? base.slice(idx) : '';
    }

    /**
     * 解析路径为绝对路径
     * 区分原始路径是否为绝对路径
     */
    resolve(...paths: string[]): string {
        let result = '/';
        for (const p of paths) {
            // 检查原始路径是否是绝对路径（以 / 或 \ 开头）
            const isAbsolute = /^[/\\]/.test(p);

            if (isAbsolute) {
                result = this.normalizePath(p);
            } else {
                // 相对路径：直接拼接后规范化
                result = this.normalizePath(result + '/' + p);
            }
        }
        return result;
    }

    /** 初始化 Agent 推荐的目录结构 */
    private initDefaultStructure() {
        const dirs = ['/context', '/knowledge', '/state', '/history'];
        dirs.forEach(d => this.mkdirSync(d));

        this.writeFileSync('/README.md', `# Memory System

当前 Agent 使用的 Memory 虚拟文件系统，用于存储运行时数据。

请使用 memory:// 作为协议前缀访问此文件系统。
例如: memory:///README.md

## 目录结构
- /context   - 当前任务上下文
- /knowledge - 长期知识存储
- /state     - 运行状态变量
- /history   - 历史决策记录
`);
    }

    // ========== 内部工具方法 ==========

    private parsePath(p: string): string[] {
        const normalized = this.normalizePath(p);
        return normalized.split('/').filter(s => s.length > 0);
    }

    private getNode(path: string): VNode | null {
        if (path === '/' || path === '') return this.root;
        const parts = this.parsePath(path);
        let node = this.root;
        for (const part of parts) {
            const child = node.children.get(part);
            if (!child) return null;
            node = child;
        }
        return node;
    }

    private getParent(path: string): { parent: VNode; name: string } | null {
        const parts = this.parsePath(path);
        if (parts.length === 0) return null;

        const name = parts.pop()!;
        let parent = this.root;
        for (const part of parts) {
            const child = parent.children.get(part);
            if (!child || child.type !== 'directory') return null;
            parent = child;
        }
        return { parent, name };
    }

    /**
     * 同步创建目录
     * 修复：禁止目录覆盖已存在的文件
     */
    private mkdirSync(path: string) {
        const parts = this.parsePath(path);
        let node = this.root;
        for (const part of parts) {
            let child = node.children.get(part);
            if (!child) {
                child = new VNode('directory');
                node.children.set(part, child);
            } else if (child.type !== 'directory') {
                // 已存在同名文件，无法创建目录
                throw new Error(`EEXIST: ${path} (file exists)`);
            }
            node = child;
        }
    }

    /**
     * 同步写入文件
     * 禁止文件覆盖已存在的目录
     */
    private writeFileSync(path: string, content: string) {
        const parts = this.parsePath(path);
        const fileName = parts.pop();
        if (!fileName) throw new Error('Invalid path');

        // 自动创建父目录
        let node = this.root;
        for (const part of parts) {
            let child = node.children.get(part);
            if (!child) {
                child = new VNode('directory');
                node.children.set(part, child);
            } else if (child.type !== 'directory') {
                // 路径中存在同名文件，无法作为目录使用
                throw new Error(`ENOTDIR: ${part} is not a directory`);
            }
            node = child;
        }

        let fileNode = node.children.get(fileName);

        // 修复：检查是否试图用文件覆盖目录
        if (fileNode && fileNode.type === 'directory') {
            throw new Error(`EISDIR: ${path}`);
        }

        if (!fileNode) {
            fileNode = new VNode('file');
            node.children.set(fileName, fileNode);
        }
        fileNode.content = content;
        fileNode.modified = new Date();
    }

    // ========== IFileSystem 接口实现 ==========

    async readFile(path: string): Promise<string> {
        const node = this.getNode(path);
        if (!node) throw new Error(`ENOENT: ${path}`);
        if (node.type !== 'file') throw new Error(`EISDIR: ${path}`);
        return node.content;
    }

    async writeFile(path: string, content: string): Promise<void> {
        this.writeFileSync(path, content);
    }

    async appendFile(path: string, content: string): Promise<void> {
        const node = this.getNode(path);
        if (node) {
            if (node.type !== 'file') throw new Error(`EISDIR: ${path}`);
            node.content += content;
            node.modified = new Date();
        } else {
            this.writeFileSync(path, content);
        }
    }

    async exists(path: string): Promise<boolean> {
        return this.getNode(path) !== null;
    }

    /**
     * 获取文件/目录信息
     * 修复：明确目录 size 为 0
     */
    async stat(path: string): Promise<IFileStat> {
        const node = this.getNode(path);
        if (!node) throw new Error(`ENOENT: ${path}`);
        return {
            size: node.type === 'file' ? node.content.length : 0,
            isDirectory: node.type === 'directory',
            isFile: node.type === 'file',
            mtime: node.modified,
            birthtime: node.created,
        };
    }

    async readdir(path: string): Promise<string[]> {
        const node = this.getNode(path);
        if (!node) throw new Error(`ENOENT: ${path}`);
        if (node.type !== 'directory') throw new Error(`ENOTDIR: ${path}`);
        return Array.from(node.children.keys());
    }

    async mkdir(path: string): Promise<void> {
        this.mkdirSync(path);
    }

    /**
     * 删除文件
     */
    async unlink(path: string): Promise<void> {
        const res = this.getParent(path);
        if (!res) throw new Error(`ENOENT: ${path}`);

        const node = res.parent.children.get(res.name);
        if (!node) throw new Error(`ENOENT: ${path}`);

        // unlink 不能删除目录
        if (node.type === 'directory') {
            throw new Error(`EISDIR: ${path} (use rmdir for directories)`);
        }

        res.parent.children.delete(res.name);
    }

    /**
     * 删除空目录
     * 修复：rmdir 只能删除空目录
     */
    async rmdir(path: string): Promise<void> {
        const res = this.getParent(path);
        if (!res) throw new Error(`ENOENT: ${path}`);

        const node = res.parent.children.get(res.name);
        if (!node) throw new Error(`ENOENT: ${path}`);

        // 修复：rmdir 只能删除目录
        if (node.type !== 'directory') {
            throw new Error(`ENOTDIR: ${path}`);
        }

        // 修复：目录必须为空
        if (node.children.size > 0) {
            throw new Error(`ENOTEMPTY: ${path}`);
        }

        res.parent.children.delete(res.name);
    }

    async readLines(path: string, start: number, end: number): Promise<string> {
        const content = await this.readFile(path);
        const lines = content.split('\n');
        return lines.slice(start, end).join('\n');
    }

    async readFirstLines(path: string, count: number): Promise<string[]> {
        const content = await this.readFile(path);
        const lines = content.split('\n');
        return lines.slice(0, count);
    }

    async readLastLines(path: string, count: number): Promise<string[]> {
        const content = await this.readFile(path);
        const lines = content.split('\n');
        return lines.slice(-count);
    }

    async countLines(path: string): Promise<number> {
        const content = await this.readFile(path);
        return content.split('\n').length;
    }

    async copyFile(src: string, dest: string): Promise<void> {
        const srcNode = this.getNode(src);
        if (!srcNode) throw new Error(`ENOENT: ${src}`);
        if (srcNode.type !== 'file') throw new Error(`EISDIR: ${src}`);

        // 复制内容到目标路径
        await this.writeFile(dest, srcNode.content);
    }

    /**
     * 移动/重命名
     * 修复：检查类型冲突
     */
    async rename(oldPath: string, newPath: string): Promise<void> {
        const node = this.getNode(oldPath);
        if (!node) throw new Error(`ENOENT: ${oldPath}`);

        // 获取源路径的父节点
        const oldParent = this.getParent(oldPath);
        if (!oldParent) throw new Error(`ENOENT: ${oldPath}`);

        // 获取目标路径的父节点
        const newParts = this.parsePath(newPath);
        const newName = newParts.pop();
        if (!newName) throw new Error('Invalid path');

        let newParentNode = this.root;
        for (const part of newParts) {
            let child = newParentNode.children.get(part);
            if (!child) {
                child = new VNode('directory');
                newParentNode.children.set(part, child);
            }
            newParentNode = child;
        }

        // 修复：检查目标是否已存在且类型冲突
        const existingNode = newParentNode.children.get(newName);
        if (existingNode) {
            if (existingNode.type === 'directory' && node.type === 'file') {
                throw new Error(`EISDIR: cannot overwrite directory with file`);
            }
            if (existingNode.type === 'file' && node.type === 'directory') {
                throw new Error(`ENOTDIR: cannot overwrite file with directory`);
            }
        }

        // 从旧父节点删除
        oldParent.parent.children.delete(oldParent.name);

        // 添加到新父节点
        newParentNode.children.set(newName, node);
    }

    // ========== 扩展功能 ==========

    /** 创建快照 */
    createSnapshot(): VFSSnapshot {
        const files: Record<string, string> = {};

        const traverse = (node: VNode, currentPath: string) => {
            if (node.type === 'file') {
                files[currentPath] = node.content;
            } else {
                for (const [name, child] of node.children) {
                    const childPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
                    traverse(child, childPath);
                }
            }
        };

        traverse(this.root, '/');
        return { files, timestamp: Date.now() };
    }

    /** 从快照恢复 */
    restoreSnapshot(snapshot: VFSSnapshot) {
        this.root = new VNode('directory');
        for (const [path, content] of Object.entries(snapshot.files)) {
            this.writeFileSync(path, content);
        }
    }

    /** 生成目录树（用于 System Prompt） */
    tree(maxDepth = 3): string {
        const lines: string[] = ['/'];

        const traverse = (node: VNode, prefix: string, depth: number) => {
            if (depth >= maxDepth || node.type !== 'directory') return;

            const entries = Array.from(node.children.entries());
            entries.forEach(([name, child], idx) => {
                const isLast = idx === entries.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                const newPrefix = prefix + (isLast ? '    ' : '│   ');

                let display = name;
                if (child.type === 'directory') {
                    display += '/';
                } else {
                    // 提取 Markdown 标题作为注释
                    const firstLine = child.content.split('\n')[0].trim();
                    if (firstLine.startsWith('#')) {
                        const title = firstLine.replace(/^#+\s*/, '').slice(0, 30);
                        display += ` (${title})`;
                    }
                }

                lines.push(prefix + connector + display);
                traverse(child, newPrefix, depth + 1);
            });
        };

        traverse(this.root, '', 0);
        return lines.join('\n');
    }

    /** 清空 */
    clear(reinit = true) {
        this.root = new VNode('directory');
        if (reinit) this.initDefaultStructure();
    }

    /** 将内存文件物化到真实文件系统 */
    async materialize(virtualPath: string, targetDir?: string): Promise<string> {
        const os = window?.require?.('os');
        const pathModule = window?.require?.('path');
        const fs = window?.require?.('fs');

        if (!os || !pathModule || !fs) {
            throw new Error('Cannot materialize: Node.js modules not available');
        }

        const tmpdir = targetDir || os.tmpdir();
        const filename = pathModule.basename(virtualPath);
        const tempPath = pathModule.join(tmpdir, `vfs_memory_${Date.now()}_${filename}`);

        // 读取内存文件内容并写入真实文件
        const content = await this.readFile(virtualPath);
        await fs.promises.writeFile(tempPath, content, 'utf-8');

        return tempPath;
    }
}
