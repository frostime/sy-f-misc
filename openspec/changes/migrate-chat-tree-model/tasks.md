# Implementation Tasks

**Change ID**: `migrate-chat-tree-model`  
**Last Updated**: 2025-12-27

## Task Organization

Tasks are organized by implementation phase. Each task should:
- Be completable in < 2 hours
- Have clear verification criteria
- Produce user-visible progress when possible
- Be marked `[x]` only when fully complete and tested

**Legend**:
- ✅ `[x]` - Complete
- 🚧 `[ ]` - In progress
- ⏸️ `[-]` - Blocked/Paused
- 🔄 `[~]` - Needs rework

---

## Phase 1: Foundation & Migration Infrastructure

### 1.1 Type System ✅

- [x] Define `IChatSessionMsgItemV2` in `types-v2.ts`
- [x] Define `IMessagePayload` structure
- [x] Define `IChatSessionHistoryV2` with tree fields
- [x] Add schema version field (`schema: 2`)
- [x] Document V1 vs V2 differences in comments

**Verification**: TypeScript compilation passes, types properly exported

### 1.2 Migration Logic ✅

- [x] Implement `detectHistorySchema()` in `msg_migration.ts`
- [x] Implement `migrateHistoryV1ToV2()` conversion
  - [x] Convert `items[]` to `nodes{}`
  - [x] Generate `worldLine` from linear order
  - [x] Set up parent-child relationships
  - [x] Fix `seperator` → `separator` typo
  - [x] Migrate `versions` structure
- [x] Add `needsMigration()` helper
- [x] Add edge case handling (empty sessions, malformed data)

**Verification**: Unit tests pass for various V1 inputs, output matches V2 schema

### 1.3 Persistence Layer ✅

- [x] Update `json-files.ts`:
  - [x] `getFromJson()` detects schema and migrates
  - [x] `saveToJson()` accepts V2 format
  - [x] Add backward compatibility note
- [x] Update `local-storage.ts`:
  - [x] `listFromLocalStorage()` migrates V1 entries
  - [x] Cache format updated to V2
- [x] Ensure read-time migration (no auto-write-back)

**Verification**: Load old V1 sessions, verify V2 structure in memory, confirm no disk writes

---

## Phase 2: Core TreeModel Implementation 🔄

### 2.1 Refactor useTreeModel 🔄

**Current Issue**: Existing implementation needs alignment with design philosophy

- [~] Redesign `use-tree-model.ts` structure:
  - [ ] Use `useStoreRef<Record<ID, Node>>` for nodes
  - [ ] Use `useStoreRef<ID[]>` for worldLine
  - [ ] Use `useSignalRef<ID | null>` for rootId
  - [ ] Implement `messages = createMemo()` as **derived state**
  - [ ] Remove any adapter-like patterns
  
- [ ] Implement core read operations:
  - [ ] `nodes()` - Direct store accessor
  - [ ] `worldLine()` - Direct store accessor
  - [ ] `rootId()` - Direct signal accessor
  - [ ] `messages()` - **Memo** deriving from worldLine
  - [ ] `getNodeById(id)`
  - [ ] `getNodeAt(index)` - via worldLine[index]
  - [ ] `count()` - worldLine length
  - [ ] `hasMessages()` - worldLine not empty

- [ ] Implement tree mutations:
  - [ ] `appendNode(node)` - Add to end of worldLine
  - [ ] `insertAfter(afterId, node)` - Insert in tree
  - [ ] `updateNode(id, updates)` - Partial update
  - [ ] `updatePayload(id, payload)` - Update current version
  - [ ] `deleteNode(id)` - Remove from tree
  - [ ] `clear()` - Reset to empty

- [ ] Implement tree operations:
  - [ ] `createBranch(fromId, newNode)` - Fork conversation
  - [ ] `switchWorldLine(leafId)` - Change active thread
  - [ ] `addVersion(nodeId, payload)` - Add model variant
  - [ ] `switchVersion(nodeId, versionId)` - Change active version

- [ ] Implement serialization:
  - [ ] `toHistory()` - Export to `IChatSessionHistoryV2`
  - [ ] `fromHistory(history)` - Load from history
  - [ ] Validate tree invariants on load

- [ ] Add validation helpers:
  - [ ] `validateTreeInvariants()` - Check consistency
  - [ ] Throw errors on invalid operations

**Verification**: 
- All operations testable independently
- `messages()` is a memo, not a value
- Tree invariants maintained after each mutation

### 2.2 Remove Adapter Layer ❌

**Current Issue**: `tree-model-adapter.ts` wrong abstraction

- [ ] Analyze current usage of `createTreeModelAdapter`
- [ ] Identify code depending on adapter API
- [ ] Refactor call sites to use TreeModel directly
- [ ] **Delete** `tree-model-adapter.ts`
- [ ] **Delete** `createStoreRefAdapter()` compatibility shim

**Verification**: File removed, no compilation errors, tests pass

### 2.3 Update ChatSession Integration 🔄

**Current Issue**: Partial integration, uses adapter pattern

- [~] Refactor `use-chat-session.ts`:
  - [x] Import `useTreeModel`
  - [ ] Remove `createTreeModelAdapter` usage
  - [ ] Remove `createStoreRefAdapter` usage
  - [ ] Expose `messages = treeModel.messages` (memo, not array)
  - [ ] Update `sessionHistory()` to use `treeModel.toHistory()`
  - [ ] Update `applyHistory()` to use `treeModel.fromHistory()`
  - [ ] Update `newSession()` to call `treeModel.clear()`

- [ ] Bridge to `useGptCommunication`:
  - [ ] Pass correct types to communication hook
  - [ ] Ensure communication can append to worldLine
  - [ ] Handle streaming updates (loading flag)

- [ ] Update hooks object:
  - [x] `updateMessage` - use `treeModel.updatePayload()`
  - [x] `deleteMessages` - use `treeModel.deleteNode()`
  - [x] `updateMessageMetadata` - use `treeModel.updateNode()`
  - [ ] `createMessageBranch` - use `treeModel.createBranch()`
  - [ ] `switchVersion` - use `treeModel.switchVersion()`

- [ ] Deprecate V1 code:
  - [x] Wrap old `useMessageManagement` in `if(false)` block
  - [x] Add `@deprecated` comments
  - [ ] Document migration path

**Verification**: 
- Session loads V2 histories
- Message operations work
- No direct array mutations
- Type errors resolved

---

## Phase 3: Message Item Accessor Migration 🚧

### 3.1 Update msg-item.ts 🚧

**Goal**: Migrate accessors from V1 to V2 structure

- [ ] Update `getPayload()`:
  - [ ] Uncomment V2 implementation
  - [ ] Remove V1 implementation
  - [ ] Test all call sites

- [ ] Update `getMeta()`:
  - [ ] Verify V1/V2 compatibility (same access pattern)

- [ ] Update `getMessageProp()`:
  - [ ] Uncomment V2 implementation (versions path)
  - [ ] Remove V1 implementation

- [ ] Update `setPayload()`:
  - [ ] Implement V2 immutable update pattern
  - [ ] Test reactivity

- [ ] Update `setMessageProp()`:
  - [ ] Implement V2 nested update
  - [ ] Test reactivity

- [ ] Update version helpers:
  - [ ] `stageMsgItemVersion()` - refactor for V2
  - [ ] `switchMsgItemVersion()` - use `currentVersionId`

- [ ] Add new V2-specific helpers:
  - [ ] `getActiveVersion(item)` - shorthand for current payload
  - [ ] `getAllVersions(item)` - return all payloads
  - [ ] `hasMultipleVersions(item)` - check version count

**Verification**: 
- All tests pass with V2 implementations
- No direct `.message` or `.author` access in codebase
- Type system enforces accessor usage

### 3.2 Type System Cleanup 🚧

- [ ] Update global type declarations:
  - [ ] Export `IChatSessionMsgItemV2` alongside V1
  - [ ] Mark `IChatSessionMsgItem` as `@deprecated`
  - [ ] Update function signatures to accept both types where needed

- [ ] Fix type compatibility issues:
  - [x] `separator` vs `seperator` (fix in types-v2.ts)
  - [x] `versions` structure (IMessagePayload vs old format)
  - [ ] DeleteHistory `originalItem` type (support V2)

- [ ] Add type guards:
  - [ ] `isV2Node(item)` - runtime check
  - [ ] `isV1Node(item)` - runtime check

**Verification**: No TypeScript errors, deprecation warnings visible

---

## Phase 4: Testing & Validation ⏸️

### 4.1 Unit Tests ⏸️

- [ ] TreeModel tests:
  - [ ] CRUD operations
  - [ ] Tree invariants
  - [ ] WorldLine operations
  - [ ] Branch/merge logic
  - [ ] Serialization round-trip

- [ ] Migration tests:
  - [ ] V1 → V2 conversion accuracy
  - [ ] Edge cases (empty, single node, complex tree)
  - [ ] Schema detection
  - [ ] Backward compatibility

- [ ] msg-item.ts tests:
  - [ ] All accessors work with V2
  - [ ] Immutability preserved
  - [ ] Type safety enforced

**Verification**: > 80% code coverage, all tests green

### 4.2 Integration Tests ⏸️

- [ ] Session lifecycle:
  - [ ] New session → V2 structure
  - [ ] Load V1 → Migrates → Works
  - [ ] Save V2 → Loads correctly
  
- [ ] Message operations:
  - [ ] Send message → Appends to worldLine
  - [ ] Rerun → Creates version
  - [ ] Branch → Creates new path
  - [ ] Delete → Maintains tree consistency

- [ ] Context building:
  - [ ] Separator respected
  - [ ] Pinned nodes included
  - [ ] Sliding window works

**Verification**: End-to-end scenarios pass, no regressions

### 4.3 Performance Tests ⏸️

- [ ] Benchmark large sessions (1000+ messages):
  - [ ] Load time
  - [ ] Render time
  - [ ] Message append latency
  - [ ] Branch switch latency

- [ ] Memory usage:
  - [ ] Compare V1 vs V2 overhead
  - [ ] Check for memory leaks
  - [ ] Verify memo efficiency

**Verification**: < 10% performance regression vs V1

---

## Phase 5: UI & Feature Completion ⏸️

### 5.1 Branch Management UI ⏸️

- [ ] Design branch creation UX:
  - [ ] Button to fork conversation
  - [ ] Branch naming/labeling
  - [ ] Visual indicator of branches

- [ ] Implement branch switching:
  - [ ] Dropdown or sidebar with threads
  - [ ] Bookmark management
  - [ ] Visual tree/thread navigation

**Verification**: Users can create and navigate branches

### 5.2 Version Management UI ⏸️

- [ ] Multi-model version display:
  - [ ] Dropdown to switch versions
  - [ ] Side-by-side comparison view
  - [ ] Model indicators (GPT/Claude/Gemini)

- [ ] Version creation:
  - [ ] "Rerun with different model" button
  - [ ] Model selection UI

**Verification**: Users can generate and compare versions

### 5.3 WorldLine Visualization ⏸️

- [ ] Thread/path indicator:
  - [ ] Breadcrumb of current worldLine
  - [ ] Jump to any point in thread
  - [ ] Visual tree diagram (optional)

**Verification**: Users understand current position in tree

---

## Phase 6: Cleanup & Documentation ⏸️

### 6.1 Code Cleanup ⏸️

- [ ] Remove all V1 code:
  - [ ] Delete commented V1 implementations
  - [ ] Remove `if(false)` blocks
  - [ ] Remove deprecated functions

- [ ] Final refactoring:
  - [ ] Simplify complex functions
  - [ ] Add missing comments
  - [ ] Ensure consistent naming

**Verification**: Codebase clean, no dead code

### 6.2 Documentation ⏸️

- [ ] API documentation:
  - [ ] Document all TreeModel methods
  - [ ] Document ChatSession hooks
  - [ ] Add usage examples

- [ ] Migration guide:
  - [ ] How to use new features
  - [ ] Breaking changes (if any)
  - [ ] Rollback procedure

- [ ] Architecture docs:
  - [ ] Update design diagrams
  - [ ] Explain tree model philosophy
  - [ ] Performance characteristics

**Verification**: New developers can understand and use system

### 6.3 Final Validation ⏸️

- [ ] Full test suite passes
- [ ] No TypeScript errors or warnings
- [ ] No console errors in runtime
- [ ] Performance benchmarks acceptable
- [ ] User acceptance testing

**Verification**: Ready for production

---

## Dependencies & Blockers

### Dependencies
- Phase 2 depends on Phase 1 (types and migration must exist)
- Phase 3 depends on Phase 2 (TreeModel must be stable)
- Phase 4 depends on Phase 3 (can't test without implementation)
- Phase 5 depends on Phase 4 (features need stable foundation)
- Phase 6 depends on all phases (final cleanup)

### Current Blockers
- ⏸️ Phase 2.1: Waiting for design approval and user feedback
- ⏸️ All subsequent phases: Blocked by Phase 2 completion

### Parallelizable Work
- Phase 4.1 unit tests can be written alongside Phase 2-3 implementation
- Documentation (Phase 6.2) can start anytime

---

## Progress Tracking

**Overall Progress**: ~25% (Foundation complete, core implementation in progress)

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ Complete |
| Phase 2 | 30% | 🔄 Needs rework |
| Phase 3 | 10% | 🚧 In progress |
| Phase 4 | 0% | ⏸️ Pending |
| Phase 5 | 0% | ⏸️ Pending |
| Phase 6 | 0% | ⏸️ Pending |

**Next Immediate Tasks**:
1. Get user approval on design.md
2. Refactor useTreeModel per design principles
3. Remove adapter layer
4. Update ChatSession integration

**Estimated Completion**: TBD after Phase 2 redesign
