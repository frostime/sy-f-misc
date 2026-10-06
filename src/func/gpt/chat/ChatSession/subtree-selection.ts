/**
 * 节点选择的统一安全语义：复用（复制/剪切）与删除共用同一份纯函数规划。
 *
 * 两种选择形态：
 * - `ISubtreeSelection`（旧）：rootId + 可选 leafIds，按原始 parent 引用选取 root→leaf 路径并集；
 *   leafIds 为空表示整棵子树。
 * - `{ nodeIds }`（新）：任意节点 ID 集合（点击切换产生）。选择投影到“显示子图”
 *   （现有 children 列表构成的边）上解释：只要投影是单根无环树即可复制/剪切；
 *   根节点沿 children 可达的记录才属于当前树；图外残留不构成树内依赖。
 *   不隐式修复/重连/清理源数据。
 */

type TreeNodes = Record<string, { parent: string | null; children: string[] }>;

/** The same rooted children graph is used by drawing, selection and operations.
 * Unreachable stored records are not branches. This is a read-only view: their
 * records remain in the source for recovery, and missing child links are not repaired.
 * An omitted root supports legacy callers that already supply a scoped node map. */
export const getRootedTreeNodes = <T extends TreeNodes>(nodes: T, rootId?: string | null): T => {
    if (rootId === undefined) return nodes;
    const visible: TreeNodes = {};
    const pending = rootId ? [rootId] : [];
    while (pending.length > 0) {
        const id = pending.pop()!;
        if (!nodes[id] || Object.prototype.hasOwnProperty.call(visible, id)) continue;
        visible[id] = nodes[id];
        pending.push(...nodes[id].children);
    }
    return visible as T;
};

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

/** Serializable finding about the links around the selection; UI derives labels and highlighting. */
export interface INodeSelectionIssue {
    kind: string;
    /** Primary anchor, normally a selected node; may be an invisible raw record. */
    nodeId: string;
    relatedNodeIds: string[];
    /** Human-readable Chinese description; raw IDs are never embedded. */
    message: string;
}

/**
 * Authoritative safety plan for an arbitrary node-ID selection, computed against the original tree.
 * - `nodeIds`          deduped selection in canonical parent-before-child order, independent of click order;
 * - `rootIds`          selected nodes without a selected parent in the projected child graph;
 * - `retainedIds`      selected nodes kept for unselected/missing child-graph dependents,
 *                      ambiguous visible links, or root kept to preserve stored residue;
 * - `removableIds`     selected nodes safe to delete — the destructive subset;
 * - `connectionIds`    explicit minimal CHILD-GRAPH connecting closure for bulk commands,
 *                      never auto-added; empty when no unambiguous connection exists;
 * - `canExtract`       the projected selection is exactly one connected single-root subtree;
 * - `issues`           diagnostics for UI highlighting; empty for healthy data.
 */
export interface INodeSelectionPlan {
    nodeIds: string[];
    rootIds: string[];
    removableIds: string[];
    retainedIds: string[];
    connectionIds: string[];
    canExtract: boolean;
    issues: INodeSelectionIssue[];
}

const EMPTY_PLAN = (): INodeSelectionPlan => ({
    nodeIds: [],
    rootIds: [],
    removableIds: [],
    retainedIds: [],
    connectionIds: [],
    canExtract: false,
    issues: [],
});

/** Critical selection geometry (missing ids, cycles, multiple selected parents).
 *  Carries the issues so the UI can highlight and let the user adjust the selection. */
export class NodeSelectionError extends Error {
    constructor(message: string, readonly issues: INodeSelectionIssue[]) {
        super(message);
        this.name = 'NodeSelectionError';
    }
}

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
// 选择投影：以现有 children 边构成的显示子图解释任意选择
// ============================================================================

/** Projected selection: canonical order + reconstructed parent links (child edges only). */
export interface ISelectionProjection {
    order: string[];
    /** Projected parent inside the selection, null for projected roots. */
    parentOf: Map<string, string | null>;
}

/** Locally built inverse children index for one plan/projection run: record id -> every
 *  record listing it in its children list (deduplicated per owner). `duplicated` records
 *  owners whose children list repeats an entry — an uncertain reference worth a diagnostic.
 *  Purely local: nothing is cached across calls and the source is never written. */
interface IChildOwnerIndex {
    owners: Map<string, string[]>;
    duplicated: Map<string, string[]>;
}

const buildChildOwnerIndex = (nodes: TreeNodes): IChildOwnerIndex => {
    const owners = new Map<string, string[]>();
    const duplicated = new Map<string, string[]>();
    for (const [ownerId, node] of Object.entries(nodes)) {
        const seen = new Set<string>();
        for (const childId of node.children) {
            if (seen.has(childId)) {
                const repeated = duplicated.get(ownerId) ?? [];
                repeated.push(childId);
                duplicated.set(ownerId, repeated);
                continue;
            }
            seen.add(childId);
            const list = owners.get(childId) ?? [];
            list.push(ownerId);
            owners.set(childId, list);
        }
    }
    return { owners, duplicated };
};

/** Unique incoming child-graph edge, or null when none/ambiguous (unavailable for traversal). */
const ownerOf = (index: IChildOwnerIndex, id: string): string | null => {
    const owners = index.owners.get(id);
    return owners && owners.length === 1 ? owners[0] : null;
};

/**
 * Project the selection onto the displayed child graph: every selected node gets at most
 * one selected parent from existing children lists. Missing selected ids, cycles, or
 * multiple selected parents are critical geometry and throw a typed error with issues.
 */
export const projectSelection = (
    nodes: TreeNodes,
    selectedIds: string[],
    actualRootId?: string | null,
    ownerIndex: IChildOwnerIndex = buildChildOwnerIndex(getRootedTreeNodes(nodes, actualRootId)),
): ISelectionProjection => {
    nodes = getRootedTreeNodes(nodes, actualRootId);
    const selected = new Set<string>();
    const missing: string[] = [];
    for (const id of selectedIds) {
        if (nodes[id]) selected.add(id);
        else missing.push(id);
    }
    if (missing.length > 0) {
        throw new NodeSelectionError('所选的消息已不存在，请重新选择', missing.map(id => ({
            kind: 'MISSING_SELECTED_NODE',
            nodeId: id,
            relatedNodeIds: [],
            message: '这条所选的消息已不存在，请重新选择',
        })));
    }

    // Selected parent per node: incoming child-graph edges filtered to selected owners.
    const selectedOwners = new Map<string, string[]>();
    for (const id of selected) {
        const owners = (ownerIndex.owners.get(id) ?? []).filter(ownerId => selected.has(ownerId));
        if (owners.length > 0) selectedOwners.set(id, owners);
    }

    const parentOf = new Map<string, string | null>();
    const critical: INodeSelectionIssue[] = [];
    for (const id of selected) {
        const owners = selectedOwners.get(id) ?? [];
        if (owners.length > 1) {
            critical.push({
                kind: 'MULTIPLE_SELECTED_PARENTS',
                nodeId: id,
                relatedNodeIds: owners,
                message: '这条所选的消息被多个所选分支同时引用，无法确定唯一父级，请调整选择',
            });
        } else {
            parentOf.set(id, owners.length === 1 ? owners[0] : null);
        }
    }
    if (critical.length > 0) throw new NodeSelectionError('所选消息的父子关系不唯一，请调整选择后重试', critical);

    // Everything must be reachable from the projected roots; leftovers mean a cycle.
    const roots = [...selected].filter(id => (parentOf.get(id) ?? null) === null);
    const visited = new Set<string>();
    const walk = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        nodes[id].children.forEach(childId => { if (selected.has(childId)) walk(childId); });
    };
    roots.forEach(walk);
    const cyclic = [...selected].filter(id => !visited.has(id));
    if (cyclic.length > 0) {
        throw new NodeSelectionError('所选消息之间存在环形引用，请调整选择后重试', cyclic.map(id => ({
            kind: 'SELECTED_CYCLE',
            nodeId: id,
            relatedNodeIds: [],
            message: '这条所选的消息处于环形引用中，无法安全操作',
        })));
    }

    return { order: canonicalChildOrder(nodes, selected, ownerIndex, actualRootId), parentOf };
};

/** Canonical child-graph traversal: source children order, skipping unavailable links.
 *  Records unreachable through children edges (e.g. ghost claims) get a stable
 *  traversal of their own components so order never depends on the click sequence. */
const canonicalChildOrder = (
    nodes: TreeNodes,
    ids: Set<string>,
    ownerIndex: IChildOwnerIndex,
    startId?: string | null,
): string[] => {
    const ordered: string[] = [];
    const visited = new Set<string>();
    const walk = (id: string) => {
        if (visited.has(id) || !nodes[id]) return;
        visited.add(id);
        if (ids.has(id)) ordered.push(id);
        nodes[id].children.forEach(walk);
    };
    if (startId && nodes[startId]) walk(startId);
    const remaining = [...ids].filter(id => !visited.has(id)).sort();
    const inRemaining = new Set(remaining);
    for (const id of remaining) {
        const ownedByRemaining = (ownerIndex.owners.get(id) ?? []).some(ownerId => inRemaining.has(ownerId));
        if (ownedByRemaining) continue; // reached from its component root below
        walk(id);
    }
    // Components closed into a cycle still get deterministic output.
    remaining.filter(id => !visited.has(id)).forEach(id => ordered.push(id));
    return ordered;
};

/**
 * Protection follows the displayed children graph, not inverse raw-parent claims.
 * A selected node stays when a child is unselected/missing/kept or its visible
 * incoming links are ambiguous. Unreachable history residue must not retain a branch.
 */
const computeProtection = (
    nodes: TreeNodes,
    selected: Set<string>,
    issues: INodeSelectionIssue[],
    ownerIndex: IChildOwnerIndex,
) => {
    const evaluateInconsistency = (id: string): boolean => {
        const duplicated = ownerIndex.duplicated.get(id) ?? [];
        if (duplicated.length > 0) {
            issues.push({
                kind: 'DUPLICATE_CHILD_EDGES',
                nodeId: id,
                relatedNodeIds: duplicated,
                message: '这条所选的消息的子列表重复列出了同一条消息，引用无法确认，已保守保留',
            });
            return true;
        }
        const owners = ownerIndex.owners.get(id) ?? [];
        if (owners.length > 1) {
            issues.push({
                kind: 'AMBIGUOUS_OWNERS',
                nodeId: id,
                relatedNodeIds: owners,
                message: '这条所选的消息同时出现在多个分支的子列表中，关系无法确认，已保守保留',
            });
            return true;
        }
        if (owners.length === 1 && owners[0] !== nodes[id].parent) {
            issues.push({
                kind: 'FOREIGN_OWNER',
                nodeId: id,
                relatedNodeIds: [owners[0], nodes[id].parent ?? ''].filter(Boolean),
                message: '这条所选的消息声称的父级与它实际所在的分支不一致，已保守保留',
            });
            return true;
        }
        return false;
    };

    const kept = new Map<string, boolean>();
    const visiting = new Set<string>();
    const visit = (id: string): boolean => {
        const known = kept.get(id);
        if (known !== undefined) return known;
        if (visiting.has(id)) {
            issues.push({
                kind: 'DEPENDENCY_CYCLE',
                nodeId: id,
                relatedNodeIds: [],
                message: '这些消息之间的依赖声明存在环，已保守保留相关消息',
            });
            return true;
        }
        visiting.add(id);
        let dirty = evaluateInconsistency(id);
        for (const dependentId of nodes[id].children) {
            if (!nodes[dependentId]) {
                issues.push({
                    kind: 'MISSING_DEPENDENT',
                    nodeId: id,
                    relatedNodeIds: [dependentId],
                    message: '这条所选的消息的子列表包含不存在的记录，为避免破坏数据已保守保留它',
                });
                dirty = true;
            } else if (!selected.has(dependentId)) {
                dirty = true;
            } else if (visit(dependentId)) {
                dirty = true;
            }
        }
        visiting.delete(id);
        kept.set(id, dirty);
        return dirty;
    };
    for (const id of selected) visit(id);
    return kept;
};

/** Diagnostic-only findings about a selected node's own raw parent claim. */
const collectParentLinkIssues = (nodes: TreeNodes, order: string[], issues: INodeSelectionIssue[]) => {
    for (const id of order) {
        const parentId = nodes[id].parent;
        if (!parentId) continue;
        if (!nodes[parentId] || !nodes[parentId].children.includes(id)) {
            issues.push({
                kind: 'UNRESOLVED_PARENT_LINK',
                nodeId: id,
                relatedNodeIds: [parentId],
                message: '这条所选的消息声称的父级并未在对方的子列表中包含它，该引用无法确认',
            });
        }
    }
};

/** Deepest node that is an ancestor of (or equal to) every given id; null when the ids
 *  live in disjoint chains. `parentRef` may be unavailable (null), truncating chains. */
const lowestCommonAncestor = (parentRef: (id: string) => string | null, ids: string[]): string | null => {
    const ancestors = new Set<string>();
    const collectAncestry = (id: string) => {
        ancestors.clear();
        const seen = new Set<string>();
        let current: string | null = id;
        while (current && !seen.has(current)) {
            ancestors.add(current);
            seen.add(current);
            current = parentRef(current);
        }
    };
    let candidate = ids[0];
    collectAncestry(candidate);
    for (const id of ids.slice(1)) {
        const seen = new Set<string>();
        let current: string | null = id;
        while (current && !seen.has(current) && !ancestors.has(current)) {
            seen.add(current);
            current = parentRef(current);
        }
        if (!current || seen.has(current)) return null;
        candidate = current;
        collectAncestry(candidate);
    }
    return candidate;
};

/** Explicit minimal connecting closure over the displayed child graph, capped at the
 *  common ancestor of the selection. Ambiguous ancestry degrades gracefully: an issue
 *  is reported and no extra connection is proposed. */
const planConnectionClosure = (
    nodes: TreeNodes,
    selected: Set<string>,
    issues: INodeSelectionIssue[],
    ownerIndex: IChildOwnerIndex,
): string[] => {
    const lca = lowestCommonAncestor(id => ownerOf(ownerIndex, id), [...selected]);
    if (!lca) {
        issues.push({
            kind: 'CONNECTION_UNAVAILABLE',
            nodeId: [...selected][0],
            relatedNodeIds: [],
            message: '所选消息之间不存在可确认的连接路径，无法生成补齐路径建议',
        });
        return [];
    }
    const closure = new Set<string>([lca]);
    for (const id of selected) {
        const seen = new Set<string>();
        let current: string | null = id;
        while (current && current !== lca && !seen.has(current)) {
            closure.add(current);
            seen.add(current);
            current = ownerOf(ownerIndex, current);
        }
    }
    return canonicalChildOrder(nodes, closure, ownerIndex, lca);
};

export const planNodeSelection = (
    nodes: TreeNodes,
    selectedIds: string[],
    actualRootId?: string | null,
): INodeSelectionPlan => {
    if (selectedIds.length === 0) return EMPTY_PLAN();

    // One inverse index per run keeps every owner lookup O(degree) instead of O(N).
    const treeNodes = getRootedTreeNodes(nodes, actualRootId);
    const ownerIndex = buildChildOwnerIndex(treeNodes);
    const projection = projectSelection(treeNodes, selectedIds, actualRootId, ownerIndex);
    const selected = new Set(projection.order);
    const issues: INodeSelectionIssue[] = [];
    collectParentLinkIssues(treeNodes, projection.order, issues);
    const kept = computeProtection(treeNodes, selected, issues, ownerIndex);

    const removableIds = projection.order.filter(id => !kept.get(id));
    const retainedIds = projection.order.filter(id => kept.get(id));

    // Deleting the actual root must never strand records that stay out of the removal
    // (orphans, other branches). Keep the root, report it, allow the safe descendants.
    if (actualRootId && removableIds.includes(actualRootId)) {
        const leftovers = Object.keys(nodes).filter(id => !removableIds.includes(id));
        if (leftovers.length > 0) {
            issues.push({
                kind: 'ROOT_RETAINED_WITH_RESIDUE',
                nodeId: actualRootId,
                relatedNodeIds: leftovers,
                message: '映射中仍有未纳入本次删除的记录，删除树根会遗留孤儿数据；已保守保留树根，仅移除其余安全后代',
            });
            removableIds.splice(removableIds.indexOf(actualRootId), 1);
            retainedIds.push(actualRootId);
        }
    }

    const projectedRoots = projection.order.filter(id => projection.parentOf.get(id) === null);
    const connectionIds = planConnectionClosure(treeNodes, selected, issues, ownerIndex);

    return {
        nodeIds: projection.order,
        rootIds: projectedRoots,
        removableIds,
        retainedIds,
        connectionIds,
        canExtract: projectedRoots.length === 1,
        issues,
    };
};

/**
 * Two plans describe the same pending operation when their executable ID sets agree,
 * regardless of the order the IDs were collected in. `connectionIds` and `issues` are
 * preview-only context and do not affect execution. Incomplete plans never compare equal.
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
// 旧路径提取的复制前校验（不修复，仅拒绝）
// ============================================================================

/**
 * Before a legacy root+endpoints copy, the included projection must be a single tree
 * rooted at the requested root and every included node's raw parent link must match the
 * projected parent (child edges). Malformed input rejects with typed readable issues;
 * the source is never repaired. Healthy legacy behavior is unaffected.
 */
export const assertLegacyExtractionProjection = (
    nodes: TreeNodes,
    rootId: string,
    leafIds: string[] | undefined,
) => {
    const included = collectSelectedSubtree(nodes, { rootId, leafIds });
    const issues: INodeSelectionIssue[] = [];

    const listed = new Set<string>();
    for (const parentId of included) {
        for (const childId of nodes[parentId].children) {
            if (included.has(childId)) listed.add(childId);
        }
    }

    for (const id of included) {
        const parentId = nodes[id].parent;
        if (parentId && included.has(parentId) && !nodes[parentId].children.includes(id)) {
            issues.push({
                kind: 'RAW_PARENT_UNLISTED',
                nodeId: id,
                relatedNodeIds: [parentId],
                message: '这条所选的消息声称父级为所选分支中的一条消息，但对方的子列表并未包含它，无法生成合法的新会话',
            });
        } else if (parentId && !included.has(parentId)) {
            if (id !== rootId) {
                issues.push({
                    kind: 'RAW_PARENT_OUTSIDE_SELECTION',
                    nodeId: id,
                    relatedNodeIds: [parentId],
                    message: '这条所选的消息声称的父级不在所选分支内，无法生成合法的新会话',
                });
            } else if (listed.has(id)) {
                issues.push({
                    kind: 'RAW_ROOT_AMBIGUOUS',
                    nodeId: id,
                    relatedNodeIds: [parentId],
                    message: '所选的根级消息同时被分支内的其他消息引用，父级无法确认，无法生成合法的新会话',
                });
            }
        } else if (!parentId && listed.has(id)) {
            issues.push({
                kind: 'RAW_ROOT_AMBIGUOUS',
                nodeId: id,
                relatedNodeIds: [],
                message: '这条所选的消息没有父级声明，却被分支内的其他消息引用，父级无法确认，无法生成合法的新会话',
            });
        }
    }

    const projectedRoots = [...included].filter(id => !listed.has(id));
    if (projectedRoots.length !== 1 || projectedRoots[0] !== rootId) {
        issues.push({
            kind: 'LEGACY_PROJECTION_NOT_SINGLE_ROOT',
            nodeId: rootId,
            relatedNodeIds: projectedRoots,
            message: '所选分支投影后不是一个以所选根级为唯一根的树，无法生成合法的新会话',
        });
    }

    if (issues.length > 0) {
        throw new NodeSelectionError('所选结构无法作为单根会话复制，请调整选择后重试', issues);
    }
};

// ============================================================================
// 删除规划
// ============================================================================

/**
 * Destructive planning shares the exact projection and protection logic with the preview:
 * only nodes whose every child-graph dependent is selected or removed may go.
 * A selection with nothing safely removable rejects. Graph-external records stay untouched.
 */
export const planSubtreeDeletion = (
    nodes: TreeNodes,
    selection: ITreeSelection,
    actualRootId?: string | null,
) => {
    const ids = isNodeIdsSelection(selection)
        ? selection.nodeIds
        : [...collectSelectedSubtree(nodes, selection)];
    const plan = planNodeSelection(nodes, ids, actualRootId);
    const included = new Set(plan.nodeIds);
    const deleted = new Set(plan.removableIds);
    const retained = new Set(plan.retainedIds);
    if (deleted.size === 0) throw new Error('所选结构没有可安全删除的独占分支');
    return { included, retained, deleted };
};

/**
 * Last-resort guard before mutation: deleting the actual tree root must leave no record
 * behind. Unselected orphans are never silently deleted; the request is rejected instead.
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
