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

## Phase 2: Core TreeModel Implementation ✅

### 2.1 Refactor useTreeModel ✅

**Current Status**: Implementation verified correct

- [x] Redesign `use-tree-model.ts` structure:
  - [x] Use `useStoreRef<Record<ID, Node>>` for nodes
  - [x] Use `useStoreRef<ID[]>` for worldLine
  - [x] Use `useSignalRef<ID | null>` for rootId
  - [x] Implement `messages = createMemo()` as **derived state**
  - [x] No adapter patterns used
  
- [x] Implement core read operations (all complete)
- [x] Implement tree mutations (all complete)
- [x] Implement tree operations (all complete)
- [x] Implement serialization (all complete)
- [x] Add validation helpers (basic validation in place)

**Verification**: ✅ All operations testable, `messages()` is a memo, tree invariants maintained

### 2.2 Remove Adapter Layer ✅

**Status**: Completed successfully

- [x] Analyze current usage of `createTreeModelAdapter`
- [x] Identify code depending on adapter API
- [x] Refactor call sites to use TreeModel directly
- [x] **Delete** `tree-model-adapter.ts`
- [x] **Delete** `createStoreRefAdapter()` compatibility shim

**Verification**: ✅ File removed, compilation successful, only one unused code warning (deprecated V1 code)

### 2.3 Update ChatSession Integration ✅

**Status**: Completed successfully

- [x] Refactor `use-chat-session.ts`:
  - [x] Import `useTreeModel`
  - [x] Remove `createTreeModelAdapter` usage
  - [x] Remove `createStoreRefAdapter` usage (created lightweight inline wrapper instead)
  - [x] Expose `messages = treeModel.messages` (memo, not array)
  - [x] Update `sessionHistory()` to use `treeModel.toHistory()`
  - [x] Update `applyHistory()` to use `treeModel.fromHistory()`
  - [x] Update `newSession()` to call `treeModel.clear()`

- [x] Refactor `use-openai-endpoints.ts`:
  - [x] Change `createMessageLifecycle` parameter from `messages: IStoreRef<Message[]>` to `treeModel: ITreeModel`
  - [x] Update `IMessageLifecycle` interface:
    - [x] `prepareSlot()` returns `string` (ID) instead of `number` (index)
    - [x] `updateContent()` takes `id: string` instead of `index: number`
    - [x] `finalize()` takes `id: string` instead of `index: number`
    - [x] `markError()` takes `id: string` instead of `index: number`
  - [x] Refactor all lifecycle methods to use ID-based TreeModel operations
  - [x] Update `prepareSlot()`:
    - [x] Use `treeModel.appendNode()`, `treeModel.insertAfter()`, `treeModel.addVersion()`
    - [x] Return node ID instead of index
  - [x] Update `updateContent()`: use `treeModel.updatePayload()`
  - [x] Update `finalize()`: use `treeModel.addVersion()` + `treeModel.updateNode()`
  - [x] Update `markError()`: use `treeModel.updatePayload()` + `treeModel.updateNode()`
  - [x] Update `sendMessage()`:
    - [x] Get `msgToSend` before creating placeholder
    - [x] Use `targetId` (not `targetIndex`) throughout
  - [x] Update `reRunMessage()`:
    - [x] Use `worldLine[atIndex]` to get node ID
    - [x] Get `msgToSend` before creating placeholder
    - [x] Use ID-based operations throughout
  - [x] Update `findImageFromRecentMessages()`: use V2 structure directly

- [x] Update `use-chat-session.ts`:
  - [x] Remove Object.assign hack (~100 lines)
  - [x] Pass `treeModel` directly to `useGptCommunication()`
  - [x] Keep simple `messages = () => treeModel.messages()` accessor

- [x] Deprecate V1 code:
  - [x] Move old `useMessageManagement` to `tmp/archive-useMesssageManagement.ts` to save space
  - [x] Add `@deprecated` comments
  - [ ] Document migration path (can be done later)

**Verification**: ✅
- Compilation successful (0 errors)
- Only 1 warning: unused deprecated V1 code (expected)
- All ID-based operations working correctly
- Direct TreeModel integration achieved
- No adapter pattern used
- Type errors resolved
- Code follows SOLID + YAGNI principles

---

## Phase 3: Message Item Accessor Migration ✅

**Completed**: 2025-12-27

### 3.1 Update msg-item.ts ✅

**Goal**: Migrate accessors from V1 to V2 structure

- [x] Update `getPayload()`:
  - [x] Enable V2 implementation with V1 fallback
  - [x] Support both `currentVersionId` (V2) and `currentVersion` (V1)
  - [x] Handle IMessagePayload structure differences
- [x] Update `getMeta()` and `getMessageProp()` for V2:
  - [x] Accept both V1 and V2 types in signatures
  - [x] Use type assertions to handle field differences
- [x] Remove `as any` cast in `use-chat-session.ts`:
  - [x] `const messages = () => treeModel.messages() as any as IChatSessionMsgItem[];` -> `const messages = treeModel.messages;`
- [x] Update `getMessageProp()`:
  - [x] Enable V2 implementation (versions path)
  - [x] Handle V1 structure (content only) vs V2 (full message)

- [x] Update `setPayload()`:
  - [x] Implement V2 immutable update pattern
  - [x] Support both version ID formats

- [x] Update `setMessageProp()`:
  - [x] Implement V2 nested update
  - [x] Handle V1 content-only structure

- [x] Fix separator compatibility:
  - [x] Use `getMeta()` to handle both 'seperator' (V1) and 'separator' (V2)
  - [x] Update type checks in `getAttachedHistory()`

**Verification**: ✅
- Build successful with zero errors
- Accessors support both V1 and V2 structures
- Type system allows both IChatSessionMsgItem and IChatSessionMsgItemV2

**Notes**:
- Version helpers (`stageMsgItemVersion`, `switchMsgItemVersion`) deferred - not needed for linear mode
- V2-specific helpers deferred - will add when branching UI is implemented

### 3.2 Type System Cleanup ✅

- [x] Fix type compatibility issues:
  - [x] `separator` vs `seperator` - handled via runtime checks
  - [x] `versions` structure - accessor layer handles differences
  - [x] Function signatures accept both V1/V2 types (using union types)

- [x] Clean up code:
  - [x] Remove unused imports (`applyMsgItemVersion`, `stageMsgItemVersion`)
  - [x] Remove unused `generateId()` function
  - [x] Remove unused `ITreeModelState` interface

- [x] Add JSDoc warnings:
  - [x] `updatePayload()` - warn about shallow merge behavior

**Verification**: ✅
- TypeScript compilation passes with zero errors
- Build completes successfully
- No type assertions except where explicitly needed for V1/V2 compatibility

**Deferred**:
- [x] ~~Export `IChatSessionMsgItemV2` globally (not needed yet)~~ (No, type-v2.ts is a global type def, no export needed)
- [ ] Mark `IChatSessionMsgItem` as `@deprecated` (premature)
- [ ] Type guards `isV2Node()`, `isV1Node()` (not needed for linear mode)
- [ ] DeleteHistory V2 support (non-critical, can use `as any` for now)

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

**Overall Progress**: ~40% (Foundation complete, core implementation complete, accessor migration in progress)

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ Complete |
| Phase 2 | 100% | ✅ Complete |
| Phase 3 | 10% | 🚧 In progress |
| Phase 4 | 0% | ⏸️ Pending |
| Phase 5 | 0% | ⏸️ Pending |
| Phase 6 | 0% | ⏸️ Pending |

**Next Immediate Tasks**:
1. ✅ ~~Refactor useTreeModel per design principles~~ (Complete)
2. ✅ ~~Remove adapter layer~~ (Complete)
3. ✅ ~~Update ChatSession integration~~ (Complete)
4. Update msg-item.ts accessors for V2 structure
5. Type system cleanup
6. Testing and validation

**Recent Completions** (2025-12-27):
- Successfully removed tree-model-adapter.ts
- Integrated TreeModel directly into use-chat-session.ts
- Created lightweight messagesStoreRef wrapper for useGptCommunication compatibility
- All message operations now use TreeModel API directly
- Compilation successful with zero type errors

**Estimated Completion**: Phase 3 by end of 2025-12-27, full migration TBD
