---
change: "chat-tree-operations"
created: 2026-06-07T22:07:49
---

# Design: chat-tree-operations

## 1. Runtime Structure

```text
ChatSession main.tsx
  └─ showChatWorldTree({
       treeModel,
       onExtractSubtree(args): void
     })
       └─ openIframeDialog(chat-world-tree.html)
            └─ pluginSdk
                 ├─ getTreeData(): TreeData
                 ├─ getFullContent(nodeId): string
                 ├─ switchWorldLine(leafId): void
                 └─ extractSubtree(args): Promise<void>

extractSubtree(args)
  → session.extractSubtreeToHistory(args)
  → save current session if updated
  → session.newSession()
  → session.applyHistory(extractedHistory)
  → close dialog
```

## 2. Interface Contracts

### 2.1 Tree model API

```ts
type ItemID = string;

interface IExtractSubtreeArgs {
  rootId: ItemID;
  /** Empty/undefined => copy full subtree under rootId. */
  leafIds?: ItemID[];
  /** Default true. */
  regenerateIds?: boolean;
}

interface IExtractSubtreeResult {
  nodes: Record<ItemID, IChatSessionMsgItemV2>;
  rootId: ItemID;
  worldLine: ItemID[];
  idMap: Record<ItemID, ItemID>; // oldId -> newId
}

interface ITreeModel {
  extractSubtree: (args: IExtractSubtreeArgs) => IExtractSubtreeResult;
}
```

Failure behavior:

| Case | Behavior |
|---|---|
| `rootId` missing | Throw/return error for caller toast. |
| `leafIds` contains missing node | Error. |
| `leafIds` contains node outside root subtree | Error. |
| `leafIds` contains non-leaf descendant | Treat as path endpoint; include `root → endpoint`; UI SHOULD encourage leaves but algorithm can support endpoints. |
| extracted set empty | Error. |

### 2.2 Session API

```ts
interface IExtractSubtreeToHistoryArgs {
  rootId: ItemID;
  leafIds?: ItemID[];
  title?: string;
}

interface UseSessionReturn {
  extractSubtreeToHistory: (args: IExtractSubtreeToHistoryArgs) => IChatSessionHistoryV2;
}
```

History metadata:

| Field | Value |
|---|---|
| `id` | New `window.Lute.NewNodeID()` |
| `title` | Provided title or `${currentTitle} - 提取的子树` |
| `timestamp` / `updated` | Current time; `updated = timestamp + 1` or same existing convention |
| `sysPrompt` | Current session system prompt |
| `customOptions` | Current model custom options |
| `tags` | Current session tags copied |
| `nodes/rootId/worldLine` | From treeModel extraction result |
| `bookmarks` | Only bookmarks whose old IDs are included, remapped to new IDs |

### 2.3 HSPA SDK

```ts
interface ChatTreeSdk {
  getTreeData(): Promise<TreeData>;
  getFullContent(nodeId: string): Promise<string>;
  switchWorldLine(leafId: string): void;
  extractSubtree(args: { rootId: string; leafIds?: string[]; title?: string }): Promise<void>;
}
```

`customSdk` remains flat-merged into `window.pluginSdk`.

## 3. Extract Subtree Semantics

### 3.1 Full subtree

```text
Input: root=B, leafIds=[]

A
└─ B
   ├─ C
   │  └─ D
   └─ E
      └─ F

Output:
B'
├─ C'
│  └─ D'
└─ E'
   └─ F'
```

### 3.2 Cropped subtree by multiple leaves/paths

```text
Input: root=B, leafIds=[D, F]

A
└─ B
   ├─ C
   │  └─ D
   ├─ E
   │  └─ F
   └─ G
      └─ H

Included old IDs = union(paths(B→D), paths(B→F)) = {B,C,D,E,F}

Output:
B'
├─ C'
│  └─ D'
└─ E'
   └─ F'
```

Excluded branch `G→H` is not copied.

### 3.3 ID and link rebuilding

```ts
for oldId in includedIds:
  newId = regenerateIds ? NewNodeID() : oldId
  idMap[oldId] = newId

for oldId in includedIds:
  old = nodes[oldId]
  copied = structuredClone(old)
  copied.id = idMap[oldId]
  copied.parent = old.parent && includedIds.has(old.parent) ? idMap[old.parent] : null
  copied.children = old.children.filter(id => includedIds.has(id)).map(id => idMap[id])
  copied.loading = false
  newNodes[copied.id] = copied
```

## 4. WorldLine Selection

WorldLine MUST be valid in the copied tree and MUST start at the new root.

Priority:

| Priority | Rule |
|---|---|
| 1 | If original current worldLine contains `rootId` and reaches an included endpoint, use that suffix. |
| 2 | If `leafIds` provided, use the path to the first selected leaf/endpoint. |
| 3 | For full subtree, use the path from root to the first descendant leaf by existing child order. |
| 4 | If root has no copied children, worldLine is `[newRootId]`. |

## 5. HSPA Operation Mode UX

### 5.1 State model

```js
state = {
  mode: 'inspect', // inspect | operation
  selectedNodeId: null,
  operation: null
}

operation = {
  id: 'extract-subtree',
  rootId: '...',
  leafIds: [],
  includedNodeIds: new Set(),
  includedEdges: new Set(), // key: parentId + '→' + childId
}
```

### 5.2 State transitions

```text
inspect
  ├─ click node → selectNode(nodeId)
  └─ click "提取 Subtree" → extract-subtree(rootId=selectedNodeId)

extract-subtree
  ├─ click descendant endpoint → toggle leafIds
  ├─ click non-descendant → toast invalid
  ├─ click "重选 Root" → rootId=selectedNodeId; leafIds=[]; recompute preview
  ├─ click "确认提取" → pluginSdk.extractSubtree({ rootId, leafIds })
  └─ click "取消" → inspect
```

### 5.3 Panel layout

```text
[节点详情]
  basic fields...

[操作]
  - 切换到此分支
  - 查看完整内容
  - 提取 Subtree

[Extract Subtree]              only visible in extract-subtree mode
  Root: <id/preview>
  Leaves: N selected
  Included: M nodes
  Hint: 不选 leaf = 完整复制 root subtree
  [重选 Root] [确认提取] [取消]
```

### 5.4 Preview styling

| Visual state | Meaning |
|---|---|
| root badge/border | Operation root. |
| leaf badge/check | Selected leaf/endpoint. |
| included node/edge highlight | Will be copied. |
| excluded dimming | Not copied in cropped mode. |
| invalid click toast | Clicked outside selected root subtree. |

## 6. Operation Registry Direction

For this change, only `extract-subtree` must be implemented. The page state SHOULD be structured so future operations can be added by an operation spec object.

```js
const operations = {
  'extract-subtree': {
    label: '提取 Subtree',
    enter(rootId) {},
    onNodeClick(nodeId) {},
    recomputePreview() {},
    canConfirm() {},
    confirm() {},
    cancel() {}
  }
};
```

This is a lightweight registry, not a new framework. Avoid abstraction beyond what `extract-subtree` needs.

## 7. Verification Plan

| Check | Method |
|---|---|
| TypeScript compiles | `pnpm run build` or project build command available in repo. |
| Full subtree extraction | Manual: choose root with branches, no leaves selected, confirm; new session preserves all descendants. |
| Cropped multi-path extraction | Manual: choose root + two leaves from different branches; new session includes only union paths. |
| WorldLine validity | Inspect new session and tree; worldLine starts at new root and reaches a copied endpoint. |
| ID regeneration | Compare old/new node IDs; extracted session uses new IDs and valid parent/children links. |
| Existing tree operations | Switch worldline and full content view still work. |
