---
change: "chat-tree-operations"
updated: "2026-06-07T22:08+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Data extraction core ✅
- [x] Update `src/func/gpt/chat/ChatSession/use-tree-model.ts` — add `extractSubtree` interface and implementation per **Feat B** / `design.md` §2-4.
- [x] Update `src/func/gpt/chat/ChatSession/use-chat-session.ts` — add `extractSubtreeToHistory` wrapper per **Feat C**.
**Verification**: `pnpm run type-check` passed.

### Phase 2: Chat tree SDK bridge ✅
- [x] Update `src/func/gpt/chat/ChatSession/world-tree/index.ts` — extend `showChatWorldTree` options and injected SDK with `extractSubtree({ rootId, leafIds, title })` per **Feat C**.
- [x] Update `src/func/gpt/chat/main.tsx` — pass extract callback; save current session if needed, open extracted history in current ChatSession, reset input/scroll state, close tree dialog per **Feat D**.
**Verification**: `pnpm run type-check` passed.

### Phase 3: HSPA operation UI ✅
- [x] Update `src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html` — add operation-mode state and lightweight operation registry for `extract-subtree` per **Feat A**.
- [x] Update `src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html` — add side-panel controls: enter extract mode, selected root, leaf count, included node count, confirm, reselect root, cancel.
- [x] Update `src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html` — add preview styles/classes for root, selected leaves/endpoints, included nodes/edges, excluded dimming, invalid click feedback.
**Verification**: `pnpm run type-check` passed; browser/HSPA behavior remains for Phase 4 manual verification.

### Phase 4: End-to-end verification and cleanup 🚧
- [x] Run project build/type check command available in repo, preferably `pnpm run build`.
- [ ] Manual verify full subtree extraction: choose a branched root with no leaves selected; extracted current session preserves all descendants. *(requires SiYuan UI)*
- [ ] Manual verify cropped multi-path extraction: choose root plus at least two branch endpoints; extracted current session contains only the union paths. *(requires SiYuan UI)*
- [ ] Manual verify existing tree actions: switch worldline and full-content overlay still work. *(requires SiYuan UI)*
- [x] Update this `tasks.md` progress and `.sspec/changes/26-06-07T22-07_chat-tree-operations/memory.md` milestone.
**Verification**: `pnpm run type-check` and `pnpm run build` passed; manual SiYuan checks remain pending.

---

## Progress

**Overall**: 85%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 40% | 🚧 |

**Recent**:
- 2026-06-08T11:56+08:00 Review fixes complete: worldLine endpoint validation, duplicate toast prevention, redundant preview recompute removal; `pnpm run type-check` and `pnpm run build` passed.
- 2026-06-07T22:08+08:00 Build verification complete; `pnpm run type-check` and `pnpm run build` passed. Manual SiYuan UI verification remains pending.
- 2026-06-07T22:08+08:00 Phase 3 complete; `pnpm run type-check` passed.
- 2026-06-07T22:08+08:00 Phase 2 complete; `pnpm run type-check` passed.
- 2026-06-07T22:08+08:00 Phase 1 complete; `pnpm run type-check` passed.
- 2026-06-07T22:08+08:00 Plan initialized after design approval; working branch `feat/chat-tree-operations` created.
