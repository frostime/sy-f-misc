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

    /** 路径规范化：统一将反斜杠转为正斜杠 */
    normalizePath(path: string): string {
        return path.replace(/\\/g, '/');
    }

    /** 初始化 Agent 推荐的目录结构 */
    private initDefaultStructure() {
        const dirs = ['/context', '/knowledge', '/state', '/history'];
        dirs.forEach(d => this.mkdirSync(d));

        this.writeFileSync('/README.md', `# Memory System

## 目录结构
- /context   - 当前任务上下文
- /knowledge - 长期知识存储
- /state     - 运行状态变量
- /history   - 历史决策记录
`);
    }

    // ========== 内部工具方法 ==========

    private parsePath(p: string): string[] {
        // 规范化路径，支持 Windows 反斜杠
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

    private mkdirSync(path: string) {
        const parts = this.parsePath(path);
        let node = this.root;
        for (const part of parts) {
            let child = node.children.get(part);
            if (!child) {
                child = new VNode('directory');
                node.children.set(part, child);
            }
            node = child;
        }
    }

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
            }
            node = child;
        }

        let fileNode = node.children.get(fileName);
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

    async stat(path: string): Promise<IFileStat> {
        const node = this.getNode(path);
        if (!node) throw new Error(`ENOENT: ${path}`);
        return {
            size: node.content.length,
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

    async unlink(path: string): Promise<void> {
        const res = this.getParent(path);
        if (!res) throw new Error(`ENOENT: ${path}`);
        if (!res.parent.children.delete(res.name)) {
            throw new Error(`ENOENT: ${path}`);
        }
    }

    async rmdir(path: string): Promise<void> {
        await this.unlink(path);
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
