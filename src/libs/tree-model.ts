/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-16
 * @FilePath     : /src/libs/tree-model.ts
 * @Description  : 通用树结构处理库 v2 - 增强版（添加简化工具）
 */

// ================================================================
// 核心类型和类
// ================================================================

/**
 * 树节点数据源接口 - 用于构建树
 * 
 * @template T - 节点数据类型
 */
export interface ITreeDataSource<T = any> {
    getData(): T | Promise<T>;
    getChildren(): ITreeDataSource<T>[] | Promise<ITreeDataSource<T>[]>;
}

/**
 * 树节点 - 构建后的节点，支持查询和导航
 */
export class TreeNode<T = any> {
    public readonly data: T;
    public readonly children: TreeNode<T>[];
    public readonly parent: TreeNode<T> | null;
    public readonly depth: number;
    public readonly index: number;
    public readonly childrenCount: number;
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

    isRoot(): boolean {
        return this.parent === null;
    }

    isLeaf(): boolean {
        return this.children.length === 0;
    }

    getRoot(): TreeNode<T> {
        let current: TreeNode<T> = this;
        while (current.parent) {
            current = current.parent;
        }
        return current;
    }

    getPath(): TreeNode<T>[] {
        const path: TreeNode<T>[] = [];
        let current: TreeNode<T> | null = this;
        while (current) {
            path.unshift(current);
            current = current.parent;
        }
        return path;
    }

    getSiblings(includeSelf: boolean = false): TreeNode<T>[] {
        if (!this.parent) {
            return includeSelf ? [this] : [];
        }
        const siblings = this.parent.children;
        return includeSelf ? siblings : siblings.filter(node => node !== this);
    }

    getNextSibling(): TreeNode<T> | null {
        if (!this.parent) return null;
        const siblings = this.parent.children;
        return siblings[this.index + 1] || null;
    }

    getPreviousSibling(): TreeNode<T> | null {
        if (!this.parent) return null;
        const siblings = this.parent.children;
        return siblings[this.index - 1] || null;
    }

    traverse(visitor: (node: TreeNode<T>) => void | boolean): void {
        const continueTraversal = visitor(this);
        if (continueTraversal === false) return;
        for (const child of this.children) {
            child.traverse(visitor);
        }
    }

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

    findAll(predicate: (node: TreeNode<T>) => boolean): TreeNode<T>[] {
        const results: TreeNode<T>[] = [];
        this.traverse(node => {
            if (predicate(node)) {
                results.push(node);
            }
        });
        return results;
    }

    /**
     * 自定义 JSON 序列化 - 排除 parent 属性避免循环引用
     */
    toJSON(): any {
        return {
            data: this.data,
            children: this.children.map(child => child.toJSON()),
            depth: this.depth,
            index: this.index,
            childrenCount: this.childrenCount,
            metadata: this.metadata
        };
    }
}

/**
 * 树容器 - 提供树级别的操作
 */
export class Tree<T = any> {
    public readonly roots: TreeNode<T>[];

    constructor(roots: TreeNode<T>[]) {
        this.roots = roots;
    }

    traverse(visitor: (node: TreeNode<T>) => void | boolean): void {
        for (const root of this.roots) {
            root.traverse(visitor);
        }
    }

    find(predicate: (node: TreeNode<T>) => boolean): TreeNode<T> | null {
        for (const root of this.roots) {
            const found = root.find(predicate);
            if (found) return found;
        }
        return null;
    }

    findAll(predicate: (node: TreeNode<T>) => boolean): TreeNode<T>[] {
        const results: TreeNode<T>[] = [];
        for (const root of this.roots) {
            results.push(...root.findAll(predicate));
        }
        return results;
    }

    findByPath(path: Array<T | ((data: T) => boolean)>): TreeNode<T> | null {
        if (path.length === 0) return null;

        const rootMatcher = path[0];
        const root = this.roots.find(node =>
            typeof rootMatcher === 'function'
                ? (rootMatcher as (data: T) => boolean)(node.data)
                : node.data === rootMatcher
        );

        if (!root) return null;
        if (path.length === 1) return root;

        let current = root;
        for (let i = 1; i < path.length; i++) {
            const matcher = path[i];
            const child = current.children.find(node =>
                typeof matcher === 'function'
                    ? (matcher as (data: T) => boolean)(node.data)
                    : node.data === matcher
            );

            if (!child) return null;
            current = child;
        }

        return current;
    }

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

    /**
     * 自定义 JSON 序列化 - 排除 parent 属性避免循环引用
     */
    toJSON(): any {
        return {
            roots: this.roots.map(root => root.toJSON())
        };
    }
}

// ================================================================
// 树构建器
// ================================================================

export interface TreeBuildOptions<T> {
    maxDepth?: number;
    filter?: (data: T, depth: number) => boolean;
    transformer?: (data: T, depth: number, childrenCount: number) => T;
    sorter?: (a: ITreeDataSource<T>, b: ITreeDataSource<T>) => number;
}

export class TreeBuilder {
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

    private static async buildNode<T>(
        source: ITreeDataSource<T>,
        parent: TreeNode<T> | null,
        depth: number,
        index: number,
        options: TreeBuildOptions<T>
    ): Promise<TreeNode<T> | null> {
        if (options.maxDepth !== undefined && depth >= options.maxDepth) {
            return null;
        }

        let data: T = await source.getData();

        if (options.filter && !options.filter(data, depth)) {
            return null;
        }

        let childSources = await source.getChildren();

        if (options.sorter) {
            childSources = [...childSources].sort(options.sorter);
        }

        const childrenCount = childSources.length;

        if (options.transformer) {
            data = options.transformer(data, depth, childrenCount);
        }

        const node = new TreeNode<T>({
            data,
            parent,
            depth,
            index,
            childrenCount
        });

        if (depth + 1 < (options.maxDepth ?? Infinity)) {
            const children: TreeNode<T>[] = [];
            for (let i = 0; i < childSources.length; i++) {
                const child = await this.buildNode(childSources[i], node, depth + 1, i, options);
                if (child) {
                    children.push(child);
                }
            }
            // @ts-ignore
            node.children = children;
        }

        return node;
    }
}

// ================================================================
// 树格式化器
// ================================================================

export interface TreeFormatOptions<T> {
    showChildCount?: boolean;
    formatNode?: (node: TreeNode<T>) => string;
    formatChildCount?: (shown: number, total: number) => string;
}

export class TreeFormatter {
    private static defaultFormatNode<T>(node: TreeNode<T>): string {
        return String(node.data);
    }

    private static defaultFormatChildCount(shown: number, total: number): string {
        if (shown < total) {
            return ` (子元素: ${shown}/${total} 已显示)`;
        } else if (total > 0 && shown === 0) {
            return ` (子元素: ${total} 未展开)`;
        }
        return '';
    }

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

            let prefix = '';
            for (let i = 0; i < depth; i++) {
                prefix += isLast[i] ? '    ' : '│   ';
            }
            prefix += isLastNode ? '└── ' : '├── ';

            let nodeLine = prefix + options.formatNode(node);

            if (options.showChildCount) {
                const childCountText = options.formatChildCount(
                    node.children.length,
                    node.childrenCount
                );
                nodeLine += childCountText;
            }

            lines.push(nodeLine);

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

// ================================================================
// 简化工具函数
// ================================================================

/**
 * 创建树数据源（工厂函数）- 统一处理单/多数据源
 * 
 * 避免每次都要创建 class，直接返回满足接口的对象
 * 自动判断输入是单个数据还是数组，返回相应类型
 * 
 * @template T - 节点数据类型
 * @template S - 源数据类型
 * 
 * @example
 * // 单个数据源
 * const source = createTreeSource({
 *   data: rootElement,
 *   getChildren: (el) => Array.from(el.children)
 * });
 * 
 * @example
 * // 多个数据源
 * const sources = createTreeSource({
 *   data: fileList,
 *   getChildren: (file) => file.children || []
 * });
 * 
 * @example
 * // 带数据转换
 * const source = createTreeSource({
 *   data: domElement,
 *   extract: (el) => ({ tagName: el.tagName, id: el.id }),
 *   getChildren: (el) => Array.from(el.children)
 * });
 */
export function createTreeSource<T, S = T>(options: {
    root: S;
    getChildren: (item: S) => S[] | Promise<S[]>;
    extract?: (item: S) => T | Promise<T>;
}): ITreeDataSource<T>;

export function createTreeSource<T, S = T>(options: {
    root: S[];
    getChildren: (item: S) => S[] | Promise<S[]>;
    extract?: (item: S) => T | Promise<T>;
}): ITreeDataSource<T>[];

export function createTreeSource<T, S = T>(options: {
    root: S | S[];
    getChildren: (item: S) => S[] | Promise<S[]>;
    extract?: (item: S) => T | Promise<T>;
}): ITreeDataSource<T> | ITreeDataSource<T>[] {
    const { root: data, getChildren, extract } = options;
    const extractFn = extract || ((item: S) => item as unknown as T);

    const createSingle = (item: S): ITreeDataSource<T> => ({
        getData: () => extractFn(item),
        getChildren: async () => {
            const children = await getChildren(item);
            return children.map(child => createSingle(child));
        }
    });

    if (Array.isArray(data)) {
        return data.map(item => createSingle(item));
    } else {
        return createSingle(data);
    }
}

/**
 * 格式化树为字符串
 * 
 * @template T - 节点数据类型
 * 
 * @example
 * // 基本用法
 * const output = formatTree({ tree });
 * 
 * @example
 * // 自定义格式化
 * const output = formatTree({
 *   tree,
 *   formatter: (data) => `[${data.id}] ${data.name}`
 * });
 * 
 * @example
 * // 隐藏子元素计数
 * const output = formatTree({
 *   tree,
 *   formatter: (data) => data.name,
 *   showChildCount: false
 * });
 */
export function formatTree<T>(options: {
    tree: Tree<T>;
    formatter?: (data: T, node: TreeNode<T>) => string;
    showChildCount?: boolean;
}): string {
    const { tree, formatter, showChildCount = true } = options;

    const lines = TreeFormatter.format(tree, {
        formatNode: (node) => formatter ? formatter(node.data, node) : String(node.data),
        showChildCount
    });

    return lines.join('\n');
}

/**
 * 快速构建并格式化树 - 一步到位的便捷函数
 * 
 * 自动处理单个根节点或多个根节点的情况
 * 
 * @template T - 数据类型
 * 
 * @example
 * // 多根节点
 * const output = await quickTree({
 *   data: fileList,
 *   getChildren: (file) => file.children || [],
 *   formatter: (file) => `${file.name} (${file.size} bytes)`
 * });
 * 
 * @example
 * // 单根节点
 * const output = await quickTree({
 *   data: rootElement,
 *   getChildren: (el) => Array.from(el.children),
 *   formatter: (el) => el.tagName
 * });
 * 
 * @example
 * // 带深度限制和过滤
 * const output = await quickTree({
 *   data: rootDir,
 *   getChildren: (dir) => dir.children,
 *   formatter: (dir) => dir.name,
 *   maxDepth: 3,
 *   filter: (dir) => !dir.name.startsWith('.')
 * });
 */
export async function quickFormatTree<T>(options: {
    root: T | T[];
    getChildren: (item: T) => T[] | Promise<T[]>;
    formatter?: (data: T, node: TreeNode<T>) => string;
    maxDepth?: number;
    filter?: (data: T, depth: number) => boolean;
    transformer?: (data: T, depth: number, childrenCount: number) => T;
    sorter?: (a: ITreeDataSource<T>, b: ITreeDataSource<T>) => number;
    showChildCount?: boolean;
}): Promise<string> {
    const {
        root: data,
        getChildren,
        formatter,
        maxDepth,
        filter,
        transformer,
        sorter,
        showChildCount
    } = options;

    // 创建数据源
    const sources = createTreeSource({ root: data, getChildren });
    const sourcesArray = Array.isArray(sources) ? sources : [sources];

    // 构建树
    const tree = await TreeBuilder.build(sourcesArray, {
        maxDepth,
        filter,
        transformer,
        sorter
    });

    // 格式化输出
    return formatTree({
        tree,
        formatter,
        showChildCount
    });
}
