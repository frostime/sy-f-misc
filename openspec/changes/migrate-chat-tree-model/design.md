# Design Document: Tree-Based Chat Model

**Change ID**: `migrate-chat-tree-model`  
**Last Updated**: 2025-12-27

## Architecture Overview

### Core Philosophy

The design follows a **layered architecture** where complexity is hidden behind clean abstractions:

```
┌──────────────────────────────────────────────────┐
│         UI Layer (Chat Components)               │
│  - Only aware of messages: Accessor<Message[]>   │
│  - Consumes linear, reactive message stream      │
└──────────────────────────────────────────────────┘
                      ↓ messages()
┌──────────────────────────────────────────────────┐
│       ChatSession Hook (Public API)              │
│  - Exposes both list and tree operations         │
│  - messages() / getNode() / branch() etc.        │
│  - Maintains backward compatibility              │
└──────────────────────────────────────────────────┘
                      ↓ delegates to
┌──────────────────────────────────────────────────┐
│          TreeModel (State Foundation)            │
│  - nodes: Store<Record<ID, Node>>                │
│  - worldLine: Store<ID[]>                        │
│  - rootId: Signal<ID | null>                     │
│  - messages: createMemo(() => worldLine nodes)   │
└──────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Tree is Truth**: `nodes` + `worldLine` are source of truth
2. **Messages are Projection**: Derived via `createMemo` from worldLine
3. **Encapsulation**: Tree operations isolated in `useTreeModel`
4. **Immutability**: All mutations return new nodes, use SolidJS batch()
5. **Type Safety**: V2 types throughout, V1 only in migration layer

## Data Model Deep Dive

### Node Structure (IChatSessionMsgItemV2)

```typescript
interface IChatSessionMsgItemV2 {
    // Identity
    id: ItemID;                    // Unique, immutable
    type: 'message' | 'separator';
    
    // Tree relationships
    parent: ItemID | null;         // null for root
    children: ItemID[];            // Order matters!
    
    // Version management
    currentVersionId: string;      // Active version
    versions: Record<string, IMessagePayload>;
    
    // Content (version-independent)
    context?: IProvidedContext[];
    multiModalAttachments?: TMessageContentPart[];
    
    // Metadata
    hidden?: boolean;   // Skip in context building
    pinned?: boolean;   // Force include in context
    loading?: boolean;  // Streaming in progress (transient)
    
    // Stats (runtime, optional persist)
    attachedItems?: number;
    attachedChars?: number;
}
```

**Design Rationale**:
- **Flat ID references** (not nested objects) → O(1) lookup, easy serialization
- **Versions separate from tree structure** → Rerun doesn't create branches
- **Metadata at node level** → Applies regardless of active version

### Version vs Branch

Critical distinction in the model:

| Aspect | Version | Branch |
|--------|---------|--------|
| **Trigger** | Rerun same input with different model | User chooses different follow-up |
| **Structure** | Siblings in `versions{}` | New child node in tree |
| **Visibility** | Switch via UI dropdown | Navigate via worldLine |
| **Use Case** | Compare GPT vs Claude | Explore alternative conversations |

**Example**:
```
Root
  └─ User: "Explain quantum computing"
       ├─ [Version GPT]: "Quantum computing uses..."
       ├─ [Version Claude]: "In simple terms..."      ← Versions (same node)
       └─ [Version Gemini]: "Let me break it down..."
       
       Children:                                       ← Branches (different nodes)
       ├─ User: "Tell me more about qubits" 
       └─ User: "How does it compare to classical?"
```

### WorldLine Mechanics

**Definition**: Array of NodeIDs forming path from root to active leaf

```typescript
worldLine: ItemID[]  // e.g., [rootId, msg1, msg2, msg3]
```

**Invariants**:
1. `worldLine[0] === rootId` (unless empty session)
2. `worldLine[i+1] ∈ nodes[worldLine[i]].children`
3. `nodes[worldLine[last]].children.length === 0` (is leaf)

**Operations**:
- **Append**: `worldLine.push(newNodeId)`
- **Branch**: Create new child, switch worldLine to new path
- **Switch**: Change worldLine to different leaf (change active thread)

### Separator Nodes

Special node type for context windowing:

```typescript
{
    id: 'sep-1',
    type: 'separator',
    currentVersionId: '',  // Empty!
    versions: {},          // Empty!
    parent: 'msg-5',
    children: ['msg-6'],
}
```

**Behavior**:
- Context building stops at separator (unless node is pinned)
- Essentially "new chat" without leaving session
- Visible in UI as divider line

## Component Responsibilities

### 1. useTreeModel (Core State)

**Location**: `src/func/gpt/chat/ChatSession/use-tree-model.ts`

**Responsibilities**:
- Maintain tree state (`nodes`, `worldLine`, `rootId`)
- Provide CRUD operations on nodes
- Compute derived state (`messages`)
- Ensure tree invariants

**API Surface**:
```typescript
interface ITreeModel {
    // Read
    nodes(): Record<ItemID, IChatSessionMsgItemV2>;
    worldLine(): ItemID[];
    rootId(): ItemID | null;
    messages(): IChatSessionMsgItemV2[];  // createMemo!
    
    // Node access
    getNodeById(id: ItemID): IChatSessionMsgItemV2 | undefined;
    getNodeAt(index: number): IChatSessionMsgItemV2 | undefined;
    
    // Mutations
    appendNode(node: IChatSessionMsgItemV2): void;
    insertAfter(afterId: ItemID, node: IChatSessionMsgItemV2): void;
    updateNode(id: ItemID, updates: Partial<IChatSessionMsgItemV2>): void;
    updatePayload(id: ItemID, payload: Partial<IMessagePayload>): void;
    deleteNode(id: ItemID): void;
    
    // Tree operations
    createBranch(fromId: ItemID, newNode: IChatSessionMsgItemV2): void;
    switchWorldLine(leafId: ItemID): void;
    
    // Serialization
    toHistory(): IChatSessionHistoryV2;
    fromHistory(history: IChatSessionHistoryV2): void;
    clear(): void;
}
```

**Internal Implementation**:
```typescript
const useTreeModel = () => {
    const nodes = useStoreRef<Record<ItemID, IChatSessionMsgItemV2>>({});
    const worldLine = useStoreRef<ItemID[]>([]);
    const rootId = useSignalRef<ItemID | null>(null);
    
    // CRITICAL: Derived state, not stored!
    const messages = createMemo(() => {
        const line = worldLine.value;
        return line.map(id => nodes.value[id]).filter(Boolean);
    });
    
    // ... operations
    
    return {
        nodes: nodes.value,
        worldLine: worldLine.value,
        rootId: rootId.value,
        messages,  // <- Memo, not value!
        // ... methods
    };
};
```

### 2. ChatSession Hook (Orchestration)

**Location**: `src/func/gpt/chat/ChatSession/use-chat-session.ts`

**Responsibilities**:
- Integrate TreeModel with other session concerns (config, communication)
- Provide convenience APIs for common operations
- Bridge tree model to existing code (temporary compatibility)
- Manage session lifecycle (load, save, new)

**Design Pattern**:
```typescript
const useSession = (props) => {
    const treeModel = useTreeModel();
    const communication = useGptCommunication({ /* ... */ });
    
    // Public API: Direct tree access
    const getNode = (id: ItemID) => treeModel.getNodeById(id);
    const branch = (fromId: ItemID) => { /* ... */ };
    
    // Public API: Convenience list operations
    const messages = treeModel.messages;  // Just re-export!
    const appendMessage = (content) => {
        const node = buildNode(content);
        treeModel.appendNode(node);
    };
    
    // Compatibility layer (temporary, DEPRECATED)
    // Only if absolutely needed for gradual migration
    const messagesArray = () => treeModel.messages();
    
    return {
        // Tree-aware API
        messages,    // Accessor<Message[]>
        getNode,
        branch,
        switchThread,
        
        // Legacy compatibility
        appendMessage,
        deleteMessage,
        // ...
    };
};
```

**No Adapter Pattern**: 
- ❌ **Bad**: Create `tree-model-adapter.ts` to make tree look like array
- ✅ **Good**: Direct composition, expose what makes sense
- **Rationale**: Adapters hide the tree nature, we want to embrace it

### 3. Message Item Utilities (Data Access)

**Location**: `src/func/gpt/chat-utils/msg-item.ts`

**Current State (V1)**:
```typescript
// Hardcoded V1 access patterns
const getPayload = (item) => item.author;  // V1: top-level
const getMessage = (item) => item.message;  // V1: direct
```

**Target State (V2)**:
```typescript
// Abstracted access via versions
const getPayload = (item: IChatSessionMsgItemV2, prop: 'author') => {
    const payload = item.versions[item.currentVersionId];
    return payload?.[prop];
};

const getMessage = (item: IChatSessionMsgItemV2) => {
    const payload = item.versions[item.currentVersionId];
    return payload?.message;
};
```

**Migration Strategy**:
1. Add V2 implementations alongside V1 (commented)
2. Gradually uncomment V2, remove V1
3. Type system ensures all call sites updated

## Critical Technical Decisions

### Decision 1: Memo vs Adapter for `messages`

**Options**:
1. ❌ **Adapter**: Wrap tree in object that implements `IStoreRef<Message[]>`
2. ✅ **Memo**: `createMemo(() => worldLine.map(id => nodes[id]))`

**Choice**: Memo

**Rationale**:
- **Simplicity**: Memo is idiomatic SolidJS reactive pattern
- **Transparency**: Clearly derived state, no hidden complexity
- **Performance**: SolidJS optimizes memos, only recomputes when worldLine changes
- **Philosophy**: "Tree is foundation, messages is projection"

### Decision 2: worldLine Storage

**Options**:
1. Compute on-demand from `rootId` + active leaf
2. ✅ **Store explicitly** as `worldLine: Store<ItemID[]>`

**Choice**: Explicit storage

**Rationale**:
- **Performance**: O(1) access vs O(depth) traversal
- **Simplicity**: No tree traversal logic needed in hot paths
- **Invariant**: Easier to maintain/validate
- **Persistence**: Direct serialization to `IChatSessionHistoryV2.worldLine`

### Decision 3: Node Updates (Mutable vs Immutable)

**Options**:
1. Direct mutation: `nodes.value[id].author = 'GPT'`
2. ✅ **Immutable updates**: `nodes.update(id, prev => ({ ...prev, author: 'GPT' }))`

**Choice**: Immutable with SolidJS Store updates

**Rationale**:
- **Reactivity**: SolidJS tracks granular changes in Store
- **Predictability**: Clear mutation points, easier debugging
- **Undo/Redo**: Possible future feature needs immutability

**Pattern**:
```typescript
const updateNode = (id: ItemID, updates: Partial<Node>) => {
    batch(() => {
        nodes.update(value => ({
            ...value,
            [id]: { ...value[id], ...updates }
        }));
    });
};
```

### Decision 4: Version Management

**Storage**:
```typescript
versions: Record<VersionID, IMessagePayload>
currentVersionId: string
```

**Alternative Considered**: Array with index
```typescript
versions: IMessagePayload[]
currentVersion: number  // index
```

**Choice**: Record with ID

**Rationale**:
- **Stability**: IDs don't change when adding/removing versions
- **Explicit**: Clear which version is active
- **Extensibility**: Can add metadata per version (creation time, model, etc.)

## Migration Architecture

### Read-Time Migration Flow

```
JSON/LocalStorage
       ↓
  Load History
       ↓
┌──────────────────┐
│ detectSchema()   │ → 1 or 2?
└──────────────────┘
       ↓
   Schema 1 (V1)
       ↓
┌────────────────────┐
│ migrateV1ToV2()    │
│ - items[] → nodes{}│
│ - Build worldLine  │
│ - Fix separator    │
└────────────────────┘
       ↓
   Schema 2 (V2)
       ↓
┌────────────────────┐
│ TreeModel.fromHistory()
└────────────────────┘
```

**No Write-Back**: 
- Migrated data kept in memory only
- Saved to disk only when user explicitly modifies session
- **Rationale**: Avoid unintended data loss, reversibility

### Type Migration in msg-item.ts

**Strategy**: Commented Dual Implementation

```typescript
/**
 * Get payload property
 * V1: item[prop]
 * V2: item.versions[item.currentVersionId][prop]
 */
export function getPayload(item, prop) {
    // V1 implementation (ACTIVE)
    return item[prop];

    // V2 implementation (COMMENTED, to be activated)
    // const payload = item.versions?.[item.currentVersionId];
    // return payload?.[prop];
}
```

**Activation Process**:
1. Ensure all code uses `getPayload()` not direct access
2. Run tests with V1 implementation
3. Uncomment V2, comment V1
4. Run tests with V2 implementation
5. Once stable, remove V1 entirely

**Benefits**:
- Side-by-side comparison during review
- Easy rollback if issues found
- Clear migration boundary

## Performance Considerations

### Lookup Complexity

| Operation | V1 (Array) | V2 (Tree) |
|-----------|------------|-----------|
| Get by index | O(1) | O(1) via worldLine |
| Get by ID | O(n) linear scan | O(1) hash lookup |
| Append | O(1) | O(1) |
| Insert middle | O(n) array shift | O(1) link update |
| Delete | O(n) array shift | O(1) link update + O(children) |

**Optimization**: Memoized `messages()` means UI always sees O(1) access

### Memory Overhead

**V1**:
```typescript
messages: Message[]  // N messages × sizeof(Message)
```

**V2**:
```typescript
nodes: Record<ID, Node>   // N nodes × sizeof(Node)
worldLine: ID[]           // depth × sizeof(ID)
messages: Memo            // No storage! Derived
```

**Overhead**: ~5-10% (ID storage in worldLine, negligible)

### Reactive Updates

**Problem**: Deep tree changes trigger full UI rerender?

**Solution**: SolidJS fine-grained reactivity
```typescript
// Only affected memo recomputes
const messages = createMemo(() => 
    worldLine().map(id => nodes()[id])
);

// If worldLine unchanged, messages not recomputed
// If node metadata changes but worldLine same, messages updates that node only
```

## Testing Strategy

### Unit Tests (useTreeModel)

- Node CRUD: Create, read, update, delete
- Tree invariants: Parent-child consistency, worldLine validity
- WorldLine operations: Switch, branch, append
- Edge cases: Empty tree, single node, deep branching

### Integration Tests (ChatSession)

- Session lifecycle: New → Load V1 → Migrate → Save V2
- Message operations: Send, rerun (version), branch (new path)
- Context building: Separator respect, pinned nodes
- Backward compatibility: V1 sessions load correctly

### Migration Tests

- Schema detection: V1 vs V2 identification
- Data integrity: All V1 data preserved in V2
- Idempotency: Migrate(Migrate(V1)) = Migrate(V1)
- Reversibility: Can export back to V1 (future)

## Rollout Plan

### Phase 1: Foundation (Current)
- ✅ Types defined
- ✅ Migration logic written
- 🔄 TreeModel implementation (needs refinement)
- 🔄 ChatSession integration (needs redesign)

### Phase 2: Core Completion
- Refactor TreeModel per this design
- Remove adapter layer
- Update msg-item.ts accessors
- Full test coverage

### Phase 3: Feature Enablement
- Branch UI (create, switch)
- Version UI (model comparison)
- WorldLine bookmarks
- Context visualization

### Phase 4: Stabilization
- Performance profiling
- Edge case fixes
- Documentation
- Deprecate V1 fully

## Open Design Questions

1. **Bookmark auto-creation**: When user creates branch, auto-bookmark the fork point?
2. **Pruning strategy**: If tree grows huge, auto-archive old branches?
3. **Undo/redo**: Should we maintain operation history for undo?
4. **Conflict resolution**: If migrating V1 with existing branches (via external edit), how to merge?
5. **Export format**: Should V2 export include full tree or just worldLine?

## References

- **SolidJS Reactivity**: https://www.solidjs.com/docs/latest/api#createMemo
- **User Philosophy**: `openspec/user-draft/archive/[251226]-迁移进展中.md`
- **Implementation**: `src/func/gpt/chat/ChatSession/`
