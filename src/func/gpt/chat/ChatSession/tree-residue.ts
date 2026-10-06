import { getRootedTreeNodes } from './subtree-selection';

export type TreeResidueIssueKind =
    | 'missing-parent' | 'missing-child' | 'duplicate-child'
    | 'child-parent-mismatch' | 'unlisted-parent-claim' | 'other-root'
    | 'children-cycle' | 'dangling-bookmark' | 'dangling-world-line';

export interface ITreeResidueNode {
    /** Stored map key, used for links and cleanup even if the record's own id differs. */
    id: string;
    role: IChatSessionMsgItemV2['role'];
    type: IChatSessionMsgItemV2['type'];
    parent: string | null;
    children: string[];
    currentVersionId: string;
    versionCount: number;
    /** Finite payload timestamps across every version; omitted when unavailable. */
    firstTimestamp?: number;
    lastTimestamp?: number;
    author?: string;
    /** Current version's text only, capped at 200 characters; never includes reasoning. */
    preview: string;
    bytes: number;
    visible: boolean;
}

export interface ITreeResidueEdge {
    /** Child claims point owner → child; parent claims point claimant → parent. */
    from: string;
    to: string;
    kind: 'child' | 'parent';
}

export interface ITreeResidueIssue {
    id: string;
    kind: TreeResidueIssueKind;
    nodeId: string;
    relatedNodeIds: string[];
    message: string;
}

export interface ITreeResidueGroup {
    id: string;
    nodeIds: string[];
    bytes: number;
    firstTimestamp?: number;
    lastTimestamp?: number;
    issueIds: string[];
    blockedReasons: string[];
}

export interface ITreeResidueReport {
    totalNodes: number;
    visibleNodes: number;
    residualNodes: number;
    /** Sum of UTF-8 JSON sizes of node records, not the entire history file. */
    totalBytes: number;
    visibleBytes: number;
    residualBytes: number;
    nodes: Record<string, ITreeResidueNode>;
    edges: ITreeResidueEdge[];
    issues: ITreeResidueIssue[];
    groups: ITreeResidueGroup[];
    cleanupBlockedReason?: string;
}

/** Read-only inventory: worldLine and versions never determine tree membership. */
export const inspectTreeResidue = (history: IChatSessionHistoryV2): ITreeResidueReport => {
    const stored = history.nodes;
    const ids = Object.keys(stored).sort();
    const hasNode = (id: string) => Object.prototype.hasOwnProperty.call(stored, id);
    // Explicit null prevents the helper's legacy unscoped mode for absent roots.
    const visible = new Set(Object.keys(getRootedTreeNodes(stored, history.rootId ?? null)));
    const nodes = ids.map(id => describeNode(id, stored[id], visible.has(id)));
    const edges: ITreeResidueEdge[] = [];
    const issues: ITreeResidueIssue[] = [];
    const addIssue = (kind: TreeResidueIssueKind, nodeId: string, relatedNodeIds: string[], message: string) => {
        issues.push({ id: JSON.stringify([kind, nodeId, relatedNodeIds]), kind, nodeId, relatedNodeIds, message });
    };

    for (const id of ids) {
        const node = stored[id];
        if (node.parent !== null) {
            edges.push({ from: id, to: node.parent, kind: 'parent' });
            if (!hasNode(node.parent)) {
                addIssue('missing-parent', id, [node.parent], '声明的父节点不存在');
            } else if (!stored[node.parent].children.includes(id)) {
                addIssue('unlisted-parent-claim', id, [node.parent], '声明的父节点未在子列表中列出此节点');
            }
        } else if (id !== history.rootId) {
            addIssue('other-root', id, [], '会话根节点之外还有无父级记录');
        }
        const seenChildren = new Set<string>();
        const duplicates = new Set<string>();
        for (const child of node.children) {
            if (seenChildren.has(child)) {
                duplicates.add(child);
                continue;
            }
            seenChildren.add(child);
            edges.push({ from: id, to: child, kind: 'child' });
            if (!hasNode(child)) {
                addIssue('missing-child', id, [child], '子列表引用的节点不存在');
            } else if (stored[child].parent !== id) {
                addIssue('child-parent-mismatch', id, [child, ...(stored[child].parent === null ? [] : [stored[child].parent])], '子列表与对方声明的父级不一致');
            }
        }
        for (const child of duplicates) addIssue('duplicate-child', id, [child], '子列表重复引用同一节点');
    }

    // Iterative DFS reports back-edge cycles without risking stack overflow on long histories.
    const finished = new Set<string>();
    const active = new Map<string, number>();
    const reportedCycles = new Set<string>();
    for (const start of ids) {
        if (finished.has(start)) continue;
        const stack = [{ id: start, nextChild: 0 }];
        active.set(start, 0);
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const children = stored[frame.id].children;
            if (frame.nextChild === children.length) {
                active.delete(frame.id);
                finished.add(frame.id);
                stack.pop();
                continue;
            }
            const child = children[frame.nextChild++];
            if (!hasNode(child)) continue;
            const ancestorIndex = active.get(child);
            if (ancestorIndex !== undefined) {
                const cycle = stack.slice(ancestorIndex).map(entry => entry.id).sort();
                const cycleKey = JSON.stringify(cycle);
                if (!reportedCycles.has(cycleKey)) {
                    reportedCycles.add(cycleKey);
                    addIssue('children-cycle', cycle[0], cycle.slice(1), '子节点引用构成环');
                }
            } else if (!finished.has(child)) {
                active.set(child, stack.length);
                stack.push({ id: child, nextChild: 0 });
            }
        }
    }
    for (const id of Object.keys(history.bookmarks ?? {}).sort()) {
        if (!hasNode(id)) addIssue('dangling-bookmark', id, [], '书签引用的节点不存在');
    }
    for (const id of [...new Set(history.worldLine)].sort()) {
        if (!hasNode(id)) addIssue('dangling-world-line', id, [], '当前对话路径引用的节点不存在');
    }

    const residualNodes = nodes.filter(node => !node.visible);
    const neighbors = new Map(residualNodes.map(node => [node.id, new Set<string>()]));
    const protection = new Map(residualNodes.map(node => [node.id, new Set<string>()]));
    for (const edge of edges) {
        if (neighbors.has(edge.from) && neighbors.has(edge.to)) {
            neighbors.get(edge.from)!.add(edge.to);
            neighbors.get(edge.to)!.add(edge.from);
        }
        // Parent edges are claimant → parent: a visible node referring to an
        // external parent blocks cleanup. The reverse claim (residue → visible
        // parent) is the usual ghost-node case, not a reason to retain residue.
        if (visible.has(edge.from) && protection.has(edge.to)) {
            protection.get(edge.to)!.add('可见节点仍通过原始父级或子列表引用此组');
        }
    }
    for (const id of history.worldLine) protection.get(id)?.add('当前对话路径仍引用此组');

    const byId = new Map(nodes.map(node => [node.id, node]));
    const grouped = new Set<string>();
    const groups: ITreeResidueGroup[] = [];
    for (const start of neighbors.keys()) {
        if (grouped.has(start)) continue;
        const pending = [start];
        const nodeIds: string[] = [];
        grouped.add(start);
        while (pending.length) {
            const id = pending.pop()!;
            nodeIds.push(id);
            for (const neighbor of neighbors.get(id)!) {
                if (grouped.has(neighbor)) continue;
                grouped.add(neighbor);
                pending.push(neighbor);
            }
        }
        nodeIds.sort();
        const members = new Set(nodeIds);
        const metadata = nodeIds.map(id => byId.get(id)!);
        const timestamps = metadata.flatMap(node => [node.firstTimestamp, node.lastTimestamp]).filter(isTimestamp);
        groups.push({
            id: nodeIds[0], nodeIds,
            bytes: metadata.reduce((sum, node) => sum + node.bytes, 0),
            ...timestampRange(timestamps),
            issueIds: issues.filter(issue => members.has(issue.nodeId) || issue.relatedNodeIds.some(id => members.has(id))).map(issue => issue.id),
            blockedReasons: [...new Set(nodeIds.flatMap(id => [...protection.get(id)!]))],
        });
    }
    const visibleBytes = nodes.filter(node => node.visible).reduce((sum, node) => sum + node.bytes, 0);
    const residualBytes = residualNodes.reduce((sum, node) => sum + node.bytes, 0);
    return {
        totalNodes: nodes.length, visibleNodes: visible.size, residualNodes: residualNodes.length,
        totalBytes: visibleBytes + residualBytes, visibleBytes, residualBytes,
        nodes: Object.fromEntries(nodes.map(node => [node.id, node])), edges, issues, groups,
        cleanupBlockedReason: ids.length && (!history.rootId || !hasNode(history.rootId))
            ? '会话根节点缺失，需手动恢复后才能清理' : undefined,
    };
};

/** Builds a detached snapshot; never repairs links or changes retained node/version metadata. */
export const createResidueCleanup = (history: IChatSessionHistoryV2, groupIds: string[]): {
    history: IChatSessionHistoryV2;
    nodeIds: string[];
    bytes: number;
    removedCount: number;
} => {
    const report = inspectTreeResidue(history);
    if (report.cleanupBlockedReason) throw new Error(report.cleanupBlockedReason);
    if (!groupIds.length || new Set(groupIds).size !== groupIds.length) throw new Error('请选择不重复的完整残留组');
    const groups = groupIds.map(id => {
        const group = report.groups.find(candidate => candidate.id === id);
        if (!group) throw new Error('残留组不存在，请重新检查');
        if (group.blockedReasons.length) throw new Error(group.blockedReasons.join('；'));
        return group;
    });
    const nodeIds = groups.flatMap(group => group.nodeIds).sort();
    const removed = new Set(nodeIds);
    const clean = structuredClone(history);
    for (const id of nodeIds) {
        delete clean.nodes[id];
        if (clean.bookmarks) delete clean.bookmarks[id];
    }
    clean.worldLine = clean.worldLine.filter(id => !removed.has(id));
    return { history: clean, nodeIds, bytes: groups.reduce((sum, group) => sum + group.bytes, 0), removedCount: nodeIds.length };
};

const isTimestamp = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const timestampRange = (timestamps: number[]) => {
    let firstTimestamp: number | undefined;
    let lastTimestamp: number | undefined;
    for (const timestamp of timestamps) {
        firstTimestamp = firstTimestamp === undefined ? timestamp : Math.min(firstTimestamp, timestamp);
        lastTimestamp = lastTimestamp === undefined ? timestamp : Math.max(lastTimestamp, timestamp);
    }
    return { firstTimestamp, lastTimestamp };
};

const describeNode = (id: string, node: IChatSessionMsgItemV2, visible: boolean): ITreeResidueNode => {
    const current = node.versions[node.currentVersionId];
    const content = current?.message.content;
    const text = typeof content === 'string' ? content : Array.isArray(content)
        ? content.filter(part => part.type === 'text').map(part => 'text' in part ? part.text : '').join('\n') : '';
    return {
        id, role: node.role, type: node.type, parent: node.parent, children: [...node.children],
        currentVersionId: node.currentVersionId, versionCount: Object.keys(node.versions).length,
        ...timestampRange(Object.values(node.versions).map(payload => payload.timestamp).filter(isTimestamp)),
        author: current?.author, preview: text.slice(0, 200),
        bytes: new TextEncoder().encode(JSON.stringify(node)).byteLength, visible,
    };
};
