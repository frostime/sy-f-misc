# Proposal: Migrate Chat to Tree-Based Data Model

**Change ID**: `migrate-chat-tree-model`  
**Status**: Draft  
**Author**: User + Copilot  
**Created**: 2025-12-27  
**Priority**: High  
**Type**: Architecture Refactor

## Problem Statement

### Current Situation

The GPT chat system currently uses a **linear array-based data model** (`messages: IChatSessionMsgItem[]`) to manage conversations. This design has several limitations:

1. **No conversation branching support**: Users cannot explore alternative conversation paths (e.g., asking different follow-up questions)
2. **Version management is ad-hoc**: Regenerating responses (`rerun`) creates versions that aren't well-integrated into the data model
3. **Coupling between storage and presentation**: The UI directly consumes the storage array, making it hard to introduce new interaction patterns
4. **Difficult to implement advanced features**: Features like conversation threading, parallel explorations, or multi-model comparisons are architecturally constrained

### User Pain Points

- **Limited conversation flexibility**: Cannot branch conversations to explore different discussion paths
- **Poor version management**: When regenerating responses with different models (GPT/Claude/Gemini), versions are stored in a flat structure that doesn't reflect the tree nature of conversations
- **Confusing data access patterns**: Code directly manipulates array indices, making the codebase fragile and hard to maintain

## Proposed Solution

### Vision

Migrate from a **linear array** to a **tree-based data model** where:

1. **Tree as foundation**: Conversations are trees of nodes (`IChatSessionMsgItemV2`)
2. **WorldLine as UI projection**: Users see a linear "worldLine" (path from root to active leaf)
3. **Clean separation**: Internal tree structure vs external UI-facing list API
4. **Version and branch clarity**: Versions (same question, different models) vs branches (different questions, different paths)

### Philosophical Principles

As articulated by the user:

> - **Tree model is the foundation** - The underlying truth of conversation structure
> - **Messages represent UI perception** - A linear thread/worldLine the user experiences
> - **Thread is root-to-leaf path** - The currently active conversation path through the tree
> - **Internal flexibility, external simplicity** - ChatSession can expose tree APIs for complex operations, but UI components only see message lists
> - **Encapsulated migration** - Changes should be concentrated in `ChatSession` and `msg-item.ts`, minimizing ripple effects

### Key Changes

#### Data Model (V1 → V2)

**V1 Structure** (`types.ts`):
```typescript
interface IChatSessionMsgItem {
    id: string;
    type: 'message' | 'seperator';  // typo!
    message: IMessageLoose;
    author?: string;
    timestamp?: number;
    // ... flat structure
    versions?: Record<string, { content: string; ... }>;
}

interface IChatSessionHistory {
    id: string;
    title: string;
    items: IChatSessionMsgItem[];  // Linear array
    // ...
}
```

**V2 Structure** (`types-v2.ts`):
```typescript
interface IMessagePayload {
    id: string;
    message: IMessageLoose;
    author?: string;
    timestamp?: number;
    // ... version-specific data
}

interface IChatSessionMsgItemV2 {
    id: ItemID;
    type: 'message' | 'separator';  // Fixed typo
    
    // Version management
    currentVersionId: string;
    versions: Record<string, IMessagePayload>;
    
    // Tree structure
    parent: ItemID | null;
    children: ItemID[];
    
    // ... node metadata
}

interface IChatSessionHistoryV2 {
    schema: 2;
    id: string;
    title: string;
    
    // Tree storage
    nodes: Record<ItemID, IChatSessionMsgItemV2>;
    rootId: ItemID | null;
    worldLine: ItemID[];  // Active path [root, ..., leaf]
    bookmarks?: ItemID[];  // Leaf nodes for quick navigation
}
```

#### Architecture Layers

```
┌─────────────────────────────────────┐
│   UI Components (Chat Interface)   │  ← Only sees messages()
├─────────────────────────────────────┤
│      ChatSession Hook API          │  ← Exposes both tree & list ops
├─────────────────────────────────────┤
│   TreeModel (Core State)            │  ← Foundation: nodes + worldLine
│   - nodes: Record<ID, Node>         │
│   - worldLine: ID[]                 │
│   - messages: createMemo()          │  ← Derived linear view
└─────────────────────────────────────┘
```

## Impact Analysis

### What Changes

1. **Core data structures**: `IChatSessionMsgItem` → `IChatSessionMsgItemV2`
2. **Storage format**: Linear `items[]` → Tree `nodes{} + worldLine[]`
3. **Session management**: New TreeModel hook as foundation
4. **Message operations**: Refactored to work with tree structure
5. **Persistence layer**: Read-time migration, backward compatibility

### What Stays the Same

1. **UI components**: Continue consuming linear `messages()` array
2. **External APIs**: Conversation export, tool calling interface
3. **User experience**: UI behavior remains unchanged (internally enhanced)

### Backward Compatibility

- **Read-time migration**: Old V1 histories automatically convert to V2 on load
- **No auto-write-back**: Converted data not saved unless user explicitly modifies session
- **Version detection**: Schema version field enables graceful handling

## Implementation Strategy

### Phase 1: Foundation (✅ Partially Complete)

- [x] Define V2 types (`types-v2.ts`)
- [x] Implement migration logic (`msg_migration.ts`)
- [x] Update persistence layer (`json-files.ts`, `local-storage.ts`)
- [ ] **Refactor**: Redesign TreeModel per user feedback

### Phase 2: Core Integration (🚧 In Progress - Needs Revision)

- [ ] **Refactor**: `use-tree-model.ts` following proper encapsulation
- [ ] **Remove**: `tree-model-adapter.ts` (wrong abstraction)
- [ ] **Redesign**: `use-chat-session.ts` integration
- [ ] Update `msg-item.ts` accessor functions
- [ ] Fix type system issues (separator vs seperator, etc.)

### Phase 3: Feature Completion (⏸️ Pending)

- [ ] Implement branch creation/switching UI
- [ ] Version management UI (multi-model comparison)
- [ ] WorldLine navigation (bookmark support)
- [ ] Update serialization/deserialization
- [ ] Comprehensive testing

### Phase 4: Cleanup & Documentation (⏸️ Pending)

- [ ] Remove deprecated V1 code
- [ ] Update API documentation
- [ ] Migration guide for any external dependencies
- [ ] Performance benchmarking

## Risks & Mitigation

### Technical Risks

1. **Complexity explosion**: Tree operations more complex than array ops
   - *Mitigation*: Strong encapsulation in TreeModel, comprehensive tests
   
2. **Performance degradation**: Tree traversal vs array access
   - *Mitigation*: Memoized worldLine, O(1) node access via ID lookup
   
3. **State management bugs**: Reactive updates across tree mutations
   - *Mitigation*: Immutable operations, batch updates, extensive testing

### Process Risks

1. **Scope creep**: Temptation to add features mid-migration
   - *Mitigation*: Strict adherence to migration-only scope
   
2. **Partial completion**: Migration left in inconsistent state
   - *Mitigation*: Phase-based rollout, feature flags

## Current Status & Next Steps

### Completed Work (from recent session)

Files modified:
- ✅ `src/func/gpt/model/msg_migration.ts` - Schema detection and V1→V2 migration
- ✅ `src/func/gpt/persistence/json-files.ts` - Read-time migration support  - ✅ `src/func/gpt/persistence/local-storage.ts` - Cache migration support
- 🔄 `src/func/gpt/chat/ChatSession/use-tree-model.ts` - Basic TreeModel hook (needs refinement)
- 🔄 `src/func/gpt/chat/ChatSession/tree-model-adapter.ts` - Compatibility layer (to be removed)
- 🔄 `src/func/gpt/chat/ChatSession/use-chat-session.ts` - Partial integration (needs redesign)

### User Feedback on Current Approach

> "对于 tree model 的处理我感觉有些不舒服；虽然大致符合我的想法，但是总觉得哪里有些奇怪"

Key concerns:
1. ❌ **"Adapter" abstraction feels wrong** - Still clinging to linear array mindset
2. ✅ **Need proper encapsulation** - Tree/node should be in dedicated Hook
3. ✅ **messages should be createMemo** - Reactive derived state, not adapter
4. ❌ **Philosophical misalignment** - Tree is foundation, messages is projection

### Immediate Next Steps

1. **Review and validate** this proposal with user
2. **Refactor TreeModel design** based on feedback:
   - Pure tree operations in `useTreeModel`
   - `messages()` as derived `createMemo` from worldLine
   - Remove adapter layer concept
3. **Continue with** `msg-item.ts` migration (V1 → V2 accessor updates)
4. **Systematic testing** of each layer

## Success Criteria

- [ ] All V1 histories load correctly in V2 system
- [ ] Zero user-visible behavior changes (unless opting into new features)
- [ ] No performance regression (< 10% latency increase)
- [ ] Test coverage > 80% for tree operations
- [ ] Clean separation: tree internals vs UI-facing APIs
- [ ] All deprecation warnings documented

## Open Questions

1. **Branch UI paradigm**: How should users create/switch branches?
2. **Multi-version display**: How to show GPT/Claude/Gemini side-by-side?
3. **Bookmark management**: Auto-create on branch, or manual?
4. **Migration timing**: When to auto-upgrade V1 → V2 storage?
5. **Rollback strategy**: How to export V2 back to V1 if needed?

## References

- **V1 Types**: `src/func/gpt/types.ts`
- **V2 Types**: `src/func/gpt/types-v2.ts`
- **User Draft**: `openspec/changes/migrate-chat-tree-model/user-request.md`
- **Previous encapsulation work**:
  - Git: `bf9c409f` - Encapsulated message operations in `use-chat-session.ts`
  - Git: `7834e299` - Encapsulated item operations in `msg-item.ts`
