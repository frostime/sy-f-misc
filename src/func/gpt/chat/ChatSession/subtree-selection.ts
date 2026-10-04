/**
 * 节点选择的统一安全语义：复用（复制/剪切）与删除共用同一份纯函数规划。
 *
 * 两种选择形态：
 * - `ISubtreeSelection`（旧）：rootId + 可选 leafIds，选中 root→leaf 路径并集；leafIds 为空表示整棵子树。
 * - `{ nodeIds }`（新）：任意节点 ID 集合（点击切换产生），不蕴含任何连通性；
 *   复制/剪切要求其构成单根连通子树，删除只取可安全删除的子集。
 */

type TreeNodes = Record<string, { parent: string | null; children: string[] }>;

export interface ISubtreeSelection {
    rootId: string;
    /** No endpoints means the complete subtree; otherwise select the union of root-to-endpoint paths. */
    leafIds?: string[];
}

/** Arbitrary set of node IDs (click toggles); connectivity is never implied. */
export interface INodeIdsSelection {
    nodeIds: string[];
}

export type ITreeSelection = ISubtreeSelection | INodeIdsSelection;

/**
 * Authoritative safety plan for an arbitrary node-ID selection, computed against the original tree.
 * - `nodeIds`          deduped selection in parent-before-child order, independent of click order;
 * - `rootIds`          selected nodes without a selected ancestor (multiple => not extractable);
 * - `retainedIds`      selected nodes protected by unselected descendants that still depend on them;
 * - `removableIds`     selected nodes whose every descendant is selected — the only deletable subset;
 * - `connectionIds`    full minimal connecting closure (selected nodes + their ancestors up to the
 *                      tree root) for explicit bulk commands; never auto-added to the selection;
 * - `canExtract`       the selection is exactly one connected single-root subtree.
 */
export interface INodeSelectionPlan {
    nodeIds: string[];
    rootIds: string[];
    removableIds: string[];
    retainedIds: string[];
    connectionIds: string[];
    canExtract: boolean;
}

const EMPTY_PLAN = (): INodeSelectionPlan => ({
    nodeIds: [],
    rootIds: [],
    removableIds: [],
    retainedIds: [],
    connectionIds: [],
    canExtract: false,
});

export const isNodeIdsSelection = (selection: ITreeSelection): selection is INodeIdsSelection =>
    'nodeIds' in selection;

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

// ============================================================================
// 任意节点集合的校验与规划（新 { nodeIds } 路径）
// ============================================================================

/** Every listed child must point back to its parent, and vice versa; dangling or
 *  unlisted links corrupt any removal or extraction built from these links. */
const assertConsistentChildren = (nodes: TreeNodes) => {
    for (const [id, node] of Object.entries(nodes)) {
        for (const childId of node.children) {
            const child = nodes[childId];
            if (!child || child.parent !== id) {
                throw new Error('树结构数据不一致（父子关系不匹配），已取消操作');
            }
        }
        if (node.parent) {
            const parentNode = nodes[node.parent];
            if (!parentNode || !parentNode.children.includes(id)) {
                throw new Error(`树结构数据不一致（节点 ${id} 的父记录 ${node.parent} 缺失或不包含它），已取消操作`);
            }
        }
    }
};

/** Walk each selected node's ancestry: missing links and parent-reference cycles fail here. */
const assertValidAncestry = (nodes: TreeNodes, selected: Set<string>) => {
    for (const id of selected) {
        const walked = new Set<string>();
        let current: string | null = id;
        while (current && !walked.has(current)) {
            if (!nodes[current]) throw new Error(`所选节点的祖先 ${current} 已不存在，请重新选择`);
            walked.add(current);
            current = nodes[current].parent;
        }
        if (current) throw new Error('所选节点存在环形父引用，无法安全操作');
    }
};

/** DFS from the given root; the visited set tolerates corrupt child cycles that escape validation. */
const orderUnderRoot = (nodes: TreeNodes, ids: Set<string>, rootId: string): string[] => {
    const ordered: string[] = [];
    const visited = new Set<string>();
    const walk = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        if (ids.has(id)) ordered.push(id);
        nodes[id].children.forEach(walk);
    };
    walk(rootId);
    return ordered;
};

/**
 * Bottom-up protection: a node is kept when any child is unselected or itself protected,
 * i.e. when it still has an unselected descendant that depends on it.
 */
const computeProtection = (nodes: TreeNodes, selected: Set<string>) => {
    const protectedBelow = new Map<string, boolean>();
    const visit = (id: string): boolean => {
        let dirty = false;
        for (const childId of nodes[id].children) {
            if (!selected.has(childId) || visit(childId)) dirty = true;
        }
        protectedBelow.set(id, dirty);
        return dirty;
    };
    for (const id of selected) {
        const parentId = nodes[id].parent;
        if (!parentId || !selected.has(parentId)) visit(id);
    }
    return protectedBelow;
};

/** Deepest node that is an ancestor of (or equal to) every given id; null when the ids
 *  live in disjoint parent chains, i.e. not one tree. */
const lowestCommonAncestor = (nodes: TreeNodes, ids: string[]): string | null => {
    const ancestors = new Set<string>();
    const collectAncestry = (id: string) => {
        ancestors.clear();
        let current: string | null = id;
        while (current) {
            ancestors.add(current);
            current = nodes[current].parent;
        }
    };
    let candidate = ids[0];
    collectAncestry(candidate);
    for (const id of ids.slice(1)) {
        let current: string | null = id;
        while (current && !ancestors.has(current)) current = nodes[current].parent;
        if (!current) return null;
        candidate = current;
        collectAncestry(candidate);
    }
    return candidate;
};

export const planNodeSelection = (nodes: TreeNodes, selectedIds: string[]): INodeSelectionPlan => {
    if (selectedIds.length === 0) return EMPTY_PLAN();

    const selected = new Set<string>();
    for (const id of selectedIds) {
        if (!nodes[id]) throw new Error(`所选节点 ${id} 已不存在，请重新选择`);
        selected.add(id);
    }
    assertValidAncestry(nodes, selected);
    assertConsistentChildren(nodes);

    let treeRoot = selected.values().next().value!;
    while (nodes[treeRoot].parent) treeRoot = nodes[treeRoot].parent!;

    const nodeIds = orderUnderRoot(nodes, selected, treeRoot);
    if (nodeIds.length !== selected.size) throw new Error('所选节点不属于同一棵树，已取消操作');

    const protectedBelow = computeProtection(nodes, selected);
    const removableIds = nodeIds.filter(id => !protectedBelow.get(id));
    const retainedIds = nodeIds.filter(id => protectedBelow.get(id));
    const rootIds = nodeIds.filter(id => {
        const parentId = nodes[id].parent;
        return !parentId || !selected.has(parentId);
    });

    // 补齐所选节点间的路径：closure stops at the deepest common ancestor of the selection
    // roots, so connected or singleton selections gain nothing and unrelated upper context
    // (e.g. the global tree root) is never pulled in.
    const lca = lowestCommonAncestor(nodes, rootIds);
    if (!lca) throw new Error('所选节点不属于同一棵树，已取消操作');
    const closure = new Set<string>([lca]);
    for (const id of selected) {
        let current: string | null = id;
        while (current && current !== lca) {
            closure.add(current);
            current = nodes[current].parent;
        }
        if (current !== lca) throw new Error('所选节点不属于同一棵树，已取消操作');
    }
    const connectionIds = orderUnderRoot(nodes, closure, lca);

    return { nodeIds, rootIds, removableIds, retainedIds, connectionIds, canExtract: rootIds.length === 1 };
};

/**
 * Two plans describe the same pending operation when their executable ID sets agree,
 * regardless of the order the IDs were collected in. `connectionIds` is preview-only
 * context for explicit bulk commands and does not affect execution. Incomplete plans
 * (missing arrays) never compare equal to a complete one.
 */
export const isSameSelectionPlan = (a: INodeSelectionPlan, b: INodeSelectionPlan): boolean => {
    // Multiset comparison: duplicated IDs are meaningful, set membership alone would
    // accept ['a','a'] against ['a','b'].
    const sameIdMultiset = (x?: string[], y?: string[]) => {
        if (!x || !y || x.length !== y.length) return false;
        const sortedX = [...x].sort();
        const sortedY = [...y].sort();
        return sortedX.every((id, index) => id === sortedY[index]);
    };
    return a.canExtract === b.canExtract
        && sameIdMultiset(a.nodeIds, b.nodeIds)
        && sameIdMultiset(a.rootIds, b.rootIds)
        && sameIdMultiset(a.removableIds, b.removableIds)
        && sameIdMultiset(a.retainedIds, b.retainedIds);
};

// ============================================================================
// 删除规划
// ============================================================================

/**
 * Prune only nodes whose every descendant is selected. Shared ancestors with unselected
 * descendants remain at their original positions; a selection mixed with a protected
 * intermediate node therefore degrades to a safe partial deletion instead of failing.
 * A selection with nothing safely removable rejects.
 */
export const planSubtreeDeletion = (nodes: TreeNodes, selection: ITreeSelection) => {
    const included = isNodeIdsSelection(selection)
        ? new Set(planNodeSelection(nodes, selection.nodeIds).nodeIds)
        : collectSelectedSubtree(nodes, selection);

    const protectedBelow = computeProtection(nodes, included);
    const deleted = new Set([...included].filter(id => !protectedBelow.get(id)));
    const retained = new Set([...included].filter(id => protectedBelow.get(id)));
    if (deleted.size === 0) throw new Error('所选结构没有可安全删除的独占分支');
    return { included, retained, deleted };
};

/**
 * Deleting the actual tree root is only safe when the removal covers every record in the
 * map: anything left behind becomes unreachable orphan data. Unselected orphans are never
 * silently deleted; the whole destructive request is rejected instead.
 */
export const assertRootRemovalCoversAllRecords = (
    nodes: TreeNodes,
    deleted: Set<string>,
    actualRootId: string | null,
) => {
    if (!actualRootId || !deleted.has(actualRootId)) return;
    if (deleted.size !== Object.keys(nodes).length) {
        throw new Error('删除树根会残留无法访问的孤儿记录，已取消操作');
    }
};
