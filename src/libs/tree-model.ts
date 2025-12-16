/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-16
 * @FilePath     : /src/libs/tree-model.ts
 */

// ================================================================
// Data Strcture
// ================================================================

/**
 * 树节点数据源接口 - 用于构建树
 * 
 * "数据层"的抽象
 * 
 * @template T - 节点数据类型
 */
export interface ITreeDataSource<T = any> {
    /**
     * 获取节点数据（支持同步/异步）
     */
    getData(): T | Promise<T>;

    /**
     * 获取子节点（支持同步/异步）
     */
    getChildren(): ITreeDataSource<T>[] | Promise<ITreeDataSource<T>[]>;
}

/**
 * 树节点 - 构建后的节点，支持查询和导航
 * 
 * "结构层"的抽象，关心"节点在树中的位置"
 * 
 * @template T - 节点数据类型
 */
export class TreeNode<T = any> {
    /** 节点数据 */
    public readonly data: T;

    /** 子节点列表 */
    public readonly children: TreeNode<T>[];

    /** 父节点（根节点为 null） */
    public readonly parent: TreeNode<T> | null;

    /** 节点深度（根节点为 0） */
    public readonly depth: number;

    /** 节点在父节点中的索引 */
    public readonly index: number;

    /** 原始子节点数量（可能大于 children.length） */
    public readonly childrenCount: number;

    /** 自定义元数据 */
    public metadata: Record<string, any>;

    constructor(options: {
        data: T;
        children?: TreeNode<T>[];
        parent?: TreeNode<T> | null;
        depth?: number;
        index?: number;
        childrenCount?: number;
        metadata?: Record<string, any>;
    }) {
        this.data = options.data;
        this.children = options.children || [];
        this.parent = options.parent || null;
        this.depth = options.depth || 0;
        this.index = options.index || 0;
        this.childrenCount = options.childrenCount ?? this.children.length;
        this.metadata = options.metadata || {};
    }

    /**
     * 判断是否为根节点
     */
    isRoot(): boolean {
        return this.parent === null;
    }

    /**
     * 判断是否为叶子节点
     */
    isLeaf(): boolean {
        return this.children.length === 0;
    }

    /**
     * 获取根节点
     */
    getRoot(): TreeNode<T> {
        let current: TreeNode<T> = this;
        while (current.parent) {
            current = current.parent;
        }
        return current;
    }

    /**
     * 获取从根到当前节点的路径
     * 
     * @returns 路径上的所有节点（包含根和当前节点）
     */
    getPath(): TreeNode<T>[] {
        const path: TreeNode<T>[] = [];
        let current: TreeNode<T> | null = this;

        while (current) {
            path.unshift(current);
            current = current.parent;
        }

        return path;
    }

    /**
     * 获取兄弟节点
     * 
     * @param includeSelf - 是否包含自己，默认 false
     * @returns 兄弟节点列表
     */
    getSiblings(includeSelf: boolean = false): TreeNode<T>[] {
        if (!this.parent) {
            return includeSelf ? [this] : [];
        }

        const siblings = this.parent.children;
        return includeSelf ? siblings : siblings.filter(node => node !== this);
    }

    /**
     * 获取下一个兄弟节点
     */
    getNextSibling(): TreeNode<T> | null {
        if (!this.parent) return null;
        const siblings = this.parent.children;
        return siblings[this.index + 1] || null;
    }

    /**
     * 获取上一个兄弟节点
     */
    getPreviousSibling(): TreeNode<T> | null {
        if (!this.parent) return null;
        const siblings = this.parent.children;
        return siblings[this.index - 1] || null;
    }

    /**
     * 深度优先遍历当前节点及其子树
     * 
     * @param visitor - 访问器函数，返回 false 可提前终止
     */
    traverse(visitor: (node: TreeNode<T>) => void | boolean): void {
        const continueTraversal = visitor(this);
        if (continueTraversal === false) return;

        for (const child of this.children) {
            child.traverse(visitor);
        }
    }

    /**
     * 查找第一个满足条件的节点
     * 
     * @param predicate - 判断函数
     * @returns 找到的节点，未找到返回 null
     */
    find(predicate: (node: TreeNode<T>) => boolean): TreeNode<T> | null {
        if (predicate(this)) {
            return this;
        }

        for (const child of this.children) {
            const found = child.find(predicate);
            if (found) return found;
        }

        return null;
    }

    /**
     * 查找所有满足条件的节点
     * 
     * @param predicate - 判断函数
     * @returns 找到的节点列表
     */
    findAll(predicate: (node: TreeNode<T>) => boolean): TreeNode<T>[] {
        const results: TreeNode<T>[] = [];

        this.traverse(node => {
            if (predicate(node)) {
                results.push(node);
            }
        });

        return results;
    }
}

/**
 * 树容器 - 提供树级别的操作
 * 
 * @template T - 节点数据类型
 */
export class Tree<T = any> {
    /** 根节点列表（可能有多个根） */
    public readonly roots: TreeNode<T>[];

    constructor(roots: TreeNode<T>[]) {
        this.roots = roots;
    }

    /**
     * 深度优先遍历整棵树
     */
    traverse(visitor: (node: TreeNode<T>) => void | boolean): void {
        for (const root of this.roots) {
            root.traverse(visitor);
        }
    }

    /**
     * 查找第一个满足条件的节点
     */
    find(predicate: (node: TreeNode<T>) => boolean): TreeNode<T> | null {
        for (const root of this.roots) {
            const found = root.find(predicate);
            if (found) return found;
        }
        return null;
    }

    /**
     * 查找所有满足条件的节点
     */
    findAll(predicate: (node: TreeNode<T>) => boolean): TreeNode<T>[] {
        const results: TreeNode<T>[] = [];
        for (const root of this.roots) {
            results.push(...root.findAll(predicate));
        }
        return results;
    }

    /**
     * 按路径查找节点（通过数据匹配）
     * 
     * @param path - 路径上每个节点的数据或匹配函数
     * @returns 找到的节点，未找到返回 null
     * 
     * @example
     * // 通过数据匹配
     * tree.findByPath([rootData, childData, targetData]);
     * 
     * // 通过函数匹配
     * tree.findByPath([
     *   node => node.name === 'root',
     *   node => node.name === 'child',
     *   node => node.name === 'target'
     * ]);
     */
    findByPath(path: Array<T | ((data: T) => boolean)>): TreeNode<T> | null {
        if (path.length === 0) return null;

        // 查找根节点
        const rootMatcher = path[0];
        const root = this.roots.find(node =>
            typeof rootMatcher === 'function'
                ? (rootMatcher as (data: T) => boolean)(node.data)
                : node.data === rootMatcher
        );

        if (!root) return null;
        if (path.length === 1) return root;

        // 递归查找子节点
        let current = root;
        for (let i = 1; i < path.length; i++) {
            const matcher = path[i];
            const child = current.children.find(node =>
                typeof matcher === 'function'
                    // ? matcher(node.data)
                    ? (matcher as (data: T) => boolean)(node.data)
                    : node.data === matcher
            );

            if (!child) return null;
            current = child;
        }

        return current;
    }

    /**
     * 获取树的统计信息
     */
    getStats(): {
        totalNodes: number;
        maxDepth: number;
        leafNodes: number;
    } {
        let totalNodes = 0;
        let maxDepth = 0;
        let leafNodes = 0;

        this.traverse(node => {
            totalNodes++;
            maxDepth = Math.max(maxDepth, node.depth);
            if (node.isLeaf()) {
                leafNodes++;
            }
        });

        return { totalNodes, maxDepth, leafNodes };
    }
}


// ================================================================
// Build Tree
// ================================================================

/**
 * 树构建选项
 */
export interface TreeBuildOptions<T> {
    /**
     * 最大深度
     */
    maxDepth?: number;

    /**
     * 节点过滤器
     */
    filter?: (data: T, depth: number) => boolean;

    /**
     * 数据转换器
     */
    transformer?: (data: T, depth: number, childrenCount: number) => T;

    /**
     * 子节点排序器
     */
    sorter?: (a: ITreeDataSource<T>, b: ITreeDataSource<T>) => number;
}

/**
 * 树构建器 - 将数据源转换为树结构
 */
export class TreeBuilder {
    /**
     * 从数据源构建树
     * 
     * @template T - 节点数据类型
     * @param sources - 数据源列表
     * @param options - 构建选项
     * @returns 构建好的树
     */
    static async build<T>(
        sources: ITreeDataSource<T>[],
        options: TreeBuildOptions<T> = {}
    ): Promise<Tree<T>> {
        const roots: TreeNode<T>[] = [];

        for (let i = 0; i < sources.length; i++) {
            const node = await this.buildNode(sources[i], null, 0, i, options);
            if (node) {
                roots.push(node);
            }
        }

        return new Tree(roots);
    }

    /**
     * 递归构建节点
     */
    private static async buildNode<T>(
        source: ITreeDataSource<T>,
        parent: TreeNode<T> | null,
        depth: number,
        index: number,
        options: TreeBuildOptions<T>
    ): Promise<TreeNode<T> | null> {
        // 检查深度限制
        if (options.maxDepth !== undefined && depth >= options.maxDepth) {
            return null;
        }

        // 获取节点数据
        let data: T = await source.getData();

        // 应用过滤器
        if (options.filter && !options.filter(data, depth)) {
            return null;
        }

        // 获取子节点
        let childSources = await source.getChildren();

        // 应用排序器
        if (options.sorter) {
            childSources = [...childSources].sort(options.sorter);
        }

        const childrenCount = childSources.length;

        // 应用转换器
        if (options.transformer) {
            data = options.transformer(data, depth, childrenCount);
        }

        // 创建节点（先不设置 children）
        const node = new TreeNode<T>({
            data,
            parent,
            depth,
            index,
            childrenCount
        });

        // 递归构建子节点
        if (depth + 1 < (options.maxDepth ?? Infinity)) {
            const children: TreeNode<T>[] = [];
            for (let i = 0; i < childSources.length; i++) {
                const child = await this.buildNode(childSources[i], node, depth + 1, i, options);
                if (child) {
                    children.push(child);
                }
            }
            // @ts-ignore - 通过反射设置 children（避免构造函数循环）
            node.children = children;
        }

        return node;
    }
}

// ================================================================
// Formatter
// ================================================================

/**
 * 树格式化选项
 */
export interface TreeFormatOptions<T> {
    /**
     * 是否显示子节点数量提示
     */
    showChildCount?: boolean;

    /**
     * 节点内容格式化器
     */
    formatNode?: (node: TreeNode<T>) => string;

    /**
     * 子节点数量格式化器
     */
    formatChildCount?: (shown: number, total: number) => string;
}

/**
 * 树格式化器 - 将树转换为可读文本
 */
export class TreeFormatter {
    /**
     * 默认的节点格式化器
     */
    private static defaultFormatNode<T>(node: TreeNode<T>): string {
        return String(node.data);
    }

    /**
     * 默认的子节点数量格式化器
     */
    private static defaultFormatChildCount(shown: number, total: number): string {
        if (shown < total) {
            return ` (子元素: ${shown}/${total} 已显示)`;
        } else if (total > 0 && shown === 0) {
            return ` (子元素: ${total} 未展开)`;
        }
        return '';
    }

    /**
     * 格式化树为文本行数组
     */
    static format<T>(
        tree: Tree<T>,
        options: TreeFormatOptions<T> = {}
    ): string[] {
        const {
            showChildCount = true,
            formatNode = this.defaultFormatNode,
            formatChildCount = this.defaultFormatChildCount
        } = options;

        return this.formatNodes(
            tree.roots,
            0,
            [],
            { showChildCount, formatNode, formatChildCount }
        );
    }

    /**
     * 递归格式化节点
     */
    private static formatNodes<T>(
        nodes: TreeNode<T>[],
        depth: number,
        isLast: boolean[],
        options: Required<TreeFormatOptions<T>>
    ): string[] {
        const lines: string[] = [];

        nodes.forEach((node, index) => {
            const isLastNode = index === nodes.length - 1;
            const newIsLast = [...isLast, isLastNode];

            // 构建缩进前缀
            let prefix = '';
            for (let i = 0; i < depth; i++) {
                prefix += isLast[i] ? '    ' : '│   ';
            }
            prefix += isLastNode ? '└── ' : '├── ';

            // 格式化节点内容
            let nodeLine = prefix + options.formatNode(node);

            // 添加子节点数量提示
            if (options.showChildCount) {
                const childCountText = options.formatChildCount(
                    node.children.length,
                    node.childrenCount
                );
                nodeLine += childCountText;
            }

            lines.push(nodeLine);

            // 递归处理子节点
            if (node.children.length > 0) {
                lines.push(...this.formatNodes(
                    node.children,
                    depth + 1,
                    newIsLast,
                    options
                ));
            }
        });

        return lines;
    }
}
