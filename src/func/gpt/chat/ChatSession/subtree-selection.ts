type TreeNodes = Record<string, { parent: string | null; children: string[] }>;

export interface ISubtreeSelection {
    rootId: string;
    /** No endpoints means the complete subtree; otherwise select the union of root-to-endpoint paths. */
    leafIds?: string[];
}

/** Parent-before-child order is retained for the deletion planner. */
export const collectSelectedSubtree = (nodes: TreeNodes, selection: ISubtreeSelection): Set<string> => {
    const { rootId, leafIds = [] } = selection;
    if (!nodes[rootId]) throw new Error('所选子树的根节点已不存在，请重新选择');

    const included = new Set<string>();
    const endpoints = [...new Set(leafIds)];
    if (endpoints.length === 0) {
        const pending = [rootId];
        while (pending.length) {
            const id = pending.pop()!;
            if (included.has(id)) continue;
            if (!nodes[id]) throw new Error('子树包含不存在的节点，无法操作');
            included.add(id);
            pending.push(...[...nodes[id].children].reverse());
        }
        return included;
    }

    for (const endpoint of endpoints) {
        const path: string[] = [];
        const visited = new Set<string>();
        let id: string | null = endpoint;
        while (id && id !== rootId) {
            if (!nodes[id] || visited.has(id)) throw new Error('所选路径无效，请重新选择');
            visited.add(id);
            path.push(id);
            id = nodes[id].parent;
        }
        if (id !== rootId) throw new Error('路径终点不在所选根节点的子树内');
        included.add(rootId);
        path.reverse().forEach(pathId => included.add(pathId));
    }
    return included;
};

/**
 * Prune only exclusive branches. Shared ancestors remain at their original positions.
 * An intermediate endpoint cannot be removed without detaching its unselected descendants:
 * reject that selection rather than silently copying or compressing the remaining tree.
 */
export const planSubtreeDeletion = (nodes: TreeNodes, selection: ISubtreeSelection) => {
    const included = collectSelectedSubtree(nodes, selection);
    for (const id of included) {
        const children = nodes[id].children;
        if (children.length && !children.some(childId => included.has(childId))) {
            throw new Error('不允许删除或剪切仍有未选后代的中间终点：这会破坏对话树。请选择完整分支');
        }
    }

    const retained = new Set<string>();
    const deleted = new Set<string>();
    for (const id of [...included].reverse()) {
        if (nodes[id].children.some(childId => !included.has(childId) || retained.has(childId))) {
            retained.add(id);
        } else {
            deleted.add(id);
        }
    }
    if (deleted.size === 0) throw new Error('所选结构没有可安全删除的独占分支');
    return { included, retained, deleted };
};
