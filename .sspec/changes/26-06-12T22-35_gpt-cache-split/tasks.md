---
change: "gpt-cache-split"
updated: "2026-06-12"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Core rewrite ✅
- [x] Rewrite `src/func/gpt/persistence/local-storage.ts` — implement per-session file I/O per design.md (helpers, `saveToLocalStorage`, `listFromLocalStorage`, `removeFromLocalStorage`, `updateCacheFile`, `restoreCache`, `migrateLegacyCacheIfNeeded`)
**Verification**: `pnpm run build` passes ✅

### Phase 2: Migration & cleanup ⏳
- [ ] Verify migration path: place a legacy `gpt-chat-cache.json` in storage → restart → confirm sessions appear in `gpt-cache/` dir and localStorage
- [ ] Verify eviction: set KEEP_N low (e.g. 3) temporarily → create >3 sessions → trigger unload → confirm only 3 files remain in `gpt-cache/`

---

## Progress

**Overall**: 50%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 0% | ⏳ |

**Recent**:
- 2026-06-12: Phase 1 complete — `local-storage.ts` rewritten, build passes
