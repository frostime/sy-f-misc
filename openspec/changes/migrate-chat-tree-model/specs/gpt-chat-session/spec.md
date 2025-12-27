# Capability: GPT Chat Session Management

**Capability ID**: `gpt-chat-session`  
**Status**: Modified (V1 → V2)  
**Change**: `migrate-chat-tree-model`

## Overview

This capability defines how chat sessions manage conversation state, including message storage, context building, and session lifecycle.

---

## MODIFIED Requirements

### Requirement: Chat Session Data Model

**ID**: `gpt-chat-session-data-model`  
**Previous**: Linear array-based message storage  
**Change**: Tree-based structure with worldLine projection

#### Scenario: Store conversation as tree of nodes

**Given** a chat session with branching conversations  
**When** user sends messages and creates alternative paths  
**Then** system stores all nodes in a tree structure  
**And** maintains parent-child relationships  
**And** tracks current active path (worldLine)

**Implementation**:
- State: `nodes: Record<ItemID, IChatSessionMsgItemV2>`
- State: `worldLine: ItemID[]` (active thread)
- State: `rootId: ItemID | null`

**Validation**:
- Tree invariants maintained (no orphans, valid parent references)
- WorldLine always forms valid path from root to leaf
- All nodes accessible via ID lookup

---

### Requirement: Message List Projection

**ID**: `gpt-chat-session-messages-view`  
**Previous**: Direct array access  
**Change**: Derived reactive memo from worldLine

#### Scenario: UI consumes linear message list

**Given** a tree with multiple branches  
**When** UI requests message list  
**Then** system returns linear array of worldLine nodes  
**And** array is reactive (updates on worldLine changes)  
**And** array order matches worldLine order

**Implementation**:
- Derived state: `messages = createMemo(() => worldLine.map(id => nodes[id]))`
- **NOT** stored state
- **NOT** adapter pattern

**Validation**:
- Changes to worldLine trigger memo recomputation
- Changes to node metadata update specific message
- No unnecessary full array recreations

---

### Requirement: Conversation Branching

**ID**: `gpt-chat-session-branching`  
**Previous**: Not supported  
**Change**: Added tree-based branching

#### Scenario: Create alternative conversation path

**Given** a message at position N in worldLine  
**When** user creates branch from that message  
**Then** system creates new child node  
**And** switches worldLine to new path  
**And** preserves original path for later navigation

**Implementation**:
- Method: `treeModel.createBranch(fromId, newNode)`
- Creates new node as child of `fromId`
- Updates worldLine to include new path

**Validation**:
- Original branch still accessible
- Tree structure valid (parent-child correct)
- WorldLine updated correctly

---

### Requirement: Version Management

**ID**: `gpt-chat-session-versions`  
**Previous**: Ad-hoc `versions` field  
**Change**: Structured version storage per node

#### Scenario: Generate multiple model responses

**Given** a message node in conversation  
**When** user reruns with different model (GPT, Claude, Gemini)  
**Then** system stores response as new version  
**And** keeps all versions accessible  
**And** allows switching between versions

**Implementation**:
- Storage: `node.versions[versionId] = IMessagePayload`
- Active: `node.currentVersionId`
- Method: `treeModel.addVersion(nodeId, payload)`
- Method: `treeModel.switchVersion(nodeId, versionId)`

**Validation**:
- All versions preserved
- Current version clearly marked
- Switching doesn't create new nodes

---

### Requirement: Session Persistence

**ID**: `gpt-chat-session-persistence`  
**Previous**: `items[]` array in JSON  
**Change**: Tree structure in V2 schema

#### Scenario: Save and load session with tree structure

**Given** a chat session with tree structure  
**When** saving to disk  
**Then** system serializes to `IChatSessionHistoryV2`  
**And** includes all nodes, worldLine, metadata

**When** loading from disk  
**Then** system detects schema version  
**And** migrates V1 to V2 if needed  
**And** reconstructs tree state

**Implementation**:
- Format: `IChatSessionHistoryV2` with `schema: 2`
- Read-time migration from V1
- No auto-write-back of migrated data

**Validation**:
- Round-trip preserves all data
- V1 sessions load correctly
- Migration is idempotent

---

## ADDED Requirements

### Requirement: WorldLine Navigation

**ID**: `gpt-chat-session-worldline-nav`  
**Status**: New in V2

#### Scenario: Switch between conversation threads

**Given** multiple leaf nodes in tree (different branches)  
**When** user selects different thread  
**Then** system switches worldLine to that path  
**And** messages view updates to show new thread  
**And** preserves all other branches

**Implementation**:
- Method: `treeModel.switchWorldLine(leafId)`
- Computes path from root to leaf
- Updates worldLine store

**Validation**:
- WorldLine always valid path
- UI reflects switch immediately
- All branches still accessible

---

### Requirement: Bookmark Management

**ID**: `gpt-chat-session-bookmarks`  
**Status**: New in V2

#### Scenario: Mark important conversation branches

**Given** a conversation tree with multiple threads  
**When** user bookmarks a thread  
**Then** system adds leaf ID to bookmarks list  
**And** provides quick navigation to bookmarked threads

**Implementation**:
- Storage: `history.bookmarks: ItemID[]`
- Manual or auto-created on branch

**Validation**:
- Bookmarks persist across saves
- Can navigate to bookmarked threads
- Invalid bookmarks (deleted nodes) handled gracefully

---

## REMOVED Requirements

### Requirement: Direct Array Manipulation

**ID**: `gpt-chat-session-direct-array`  
**Status**: Removed in V2  
**Reason**: Incompatible with tree model

**Previous Behavior**:
- Direct index-based access: `messages[index]`
- Array mutations: `messages.splice()`, `messages.push()`

**Migration Path**:
- Use TreeModel methods instead
- Index access via `treeModel.getNodeAt(index)`
- Mutations via `appendNode()`, `deleteNode()`, etc.

---

## Implementation Notes

### TreeModel Hook

Core primitive providing tree state:

```typescript
const useTreeModel = () => {
    const nodes = useStoreRef<Record<ItemID, Node>>({});
    const worldLine = useStoreRef<ItemID[]>([]);
    const rootId = useSignalRef<ItemID | null>(null);
    
    // Derived, not stored!
    const messages = createMemo(() => 
        worldLine.value.map(id => nodes.value[id])
    );
    
    // Methods...
    return { nodes, worldLine, rootId, messages, /* ... */ };
};
```

### ChatSession Integration

Orchestrates TreeModel with other concerns:

```typescript
const useSession = (props) => {
    const treeModel = useTreeModel();
    
    // Direct export of reactive messages
    const messages = treeModel.messages;
    
    // Convenience methods
    const appendMessage = (content) => {
        const node = buildNode(content);
        treeModel.appendNode(node);
    };
    
    return { messages, appendMessage, /* ... */ };
};
```

**No Adapter Layer**: Direct composition, no indirection

---

## Testing Requirements

### Test Coverage

- Tree operations: CRUD on nodes
- WorldLine management: Switch, branch, append
- Migration: V1 → V2 accuracy
- Persistence: Save/load round-trip
- Reactivity: Memo updates correctly

### Performance Targets

- Session load: < 100ms for 1000 messages
- Message append: < 10ms
- Branch switch: < 50ms
- Memory overhead: < 10% vs V1

---

## Related Capabilities

- `gpt-persistence` - Storage layer (see delta)
- `gpt-message-item` - Node access patterns (see delta)
- `gpt-chat-ui` - UI components (no changes, consumes `messages()`)

---

## Migration Impact

### Breaking Changes

- **Internal only**: External API (`messages()`) remains compatible
- Direct array manipulation no longer works (wasn't public API)

### Deprecations

- `IChatSessionMsgItem` type (use `IChatSessionMsgItemV2`)
- Linear array access patterns

### Timeline

- Phase 1: Foundation (complete)
- Phase 2: Core implementation (in progress, needs rework)
- Phase 3: Full migration (pending)
- Phase 4: Feature enablement (pending)
