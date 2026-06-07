---
change: "chat-tree-operations"
updated: "2026-06-07T22:08+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Data extraction core ⏳
- [ ] Update `src/func/gpt/chat/ChatSession/use-tree-model.ts` — add `extractSubtree` interface and implementation per **Feat B** / `design.md` §2-4.
- [ ] Update `src/func/gpt/chat/ChatSession/use-chat-session.ts` — add `extractSubtreeToHistory` wrapper per **Feat C**.
**Verification**: TypeScript compile reaches at least these files without type errors; manual inspection confirms copied nodes have regenerated IDs, valid `parent/children`, valid `rootId`, valid `worldLine`.

### Phase 2: Chat tree SDK bridge ⏳
- [ ] Update `src/func/gpt/chat/ChatSession/world-tree/index.ts` — extend `showChatWorldTree` options and injected SDK with `extractSubtree({ rootId, leafIds, title })` per **Feat C**.
- [ ] Update `src/func/gpt/chat/main.tsx` — pass extract callback; save current session if needed, open extracted history in current ChatSession, reset input/scroll state, close tree dialog per **Feat D**.
**Verification**: Existing `getTreeData`, `getFullContent`, and `switchWorldLine` still work; SDK calls `pluginSdk.extractSubtree(...)` from iframe successfully reach ChatSession code.

### Phase 3: HSPA operation UI ⏳
- [ ] Update `src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html` — add operation-mode state and lightweight operation registry for `extract-subtree` per **Feat A**.
- [ ] Update `src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html` — add side-panel controls: enter extract mode, selected root, leaf count, included node count, confirm, reselect root, cancel.
- [ ] Update `src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html` — add preview styles/classes for root, selected leaves/endpoints, included nodes/edges, excluded dimming, invalid click feedback.
**Verification**: In inspect mode, clicking nodes still selects/details; in extract mode, descendant endpoints toggle leaves, non-descendants are rejected, no leaves means full subtree.

### Phase 4: End-to-end verification and cleanup ⏳
- [ ] Run project build/type check command available in repo, preferably `pnpm run build`.
- [ ] Manual verify full subtree extraction: choose a branched root with no leaves selected; extracted current session preserves all descendants.
- [ ] Manual verify cropped multi-path extraction: choose root plus at least two branch endpoints; extracted current session contains only the union paths.
- [ ] Manual verify existing tree actions: switch worldline and full-content overlay still work.
- [ ] Update this `tasks.md` progress and `.sspec/changes/26-06-07T22-07_chat-tree-operations/memory.md` milestone.
**Verification**: Build passes or known non-change-related failures are recorded; manual checks produce expected subtree structures.

---

## Progress

**Overall**: 0%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 0% | ⏳ |
| Phase 2 | 0% | ⏳ |
| Phase 3 | 0% | ⏳ |
| Phase 4 | 0% | ⏳ |

**Recent**:
- 2026-06-07T22:08+08:00 Plan initialized after design approval; working branch `feat/chat-tree-operations` created.
