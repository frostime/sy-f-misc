---
change: "gpt-cache-split"
updated: "2026-06-13"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Core rewrite ✅
- [x] Rewrite `src/func/gpt/persistence/local-storage.ts` — implement per-session file I/O per design.md (helpers, `saveToLocalStorage`, `listFromLocalStorage`, `removeFromLocalStorage`, `updateCacheFile`, `restoreCache`, `migrateLegacyCacheIfNeeded`)
- [x] Fallback migration: Node fs for desktop (handles large 68MB+ legacy file), SiYuan API as cross-platform fallback
- [x] Review fixes: serialize writes, guard migration, fix eviction
- [x] Local read abstraction: GPT persistence reads use desktop Node fs first, with SiYuan API fallback; writes/deletes stay on SiYuan API
- [x] Data-safety fixes after review: one-time legacy migration marker, directory read status (`ok`/`missing`/`failed`), and storage path traversal guard
**Verification**: `pnpm run build` passes ✅

### Feedback Tasks (→ [001-harden-migration-edge-cases](./revisions/001-harden-migration-edge-cases.md)) ✅
- [x] Treat mixed directory `missing`/`failed` as unsafe failure instead of safely missing
- [x] Validate cache session ids before writing/deleting `gpt-cache/{id}.json`
- [x] Add in-progress legacy migration marker so partial migration retries instead of being marked complete

### Feedback Tasks (→ [002-reduce-lifecycle-cache-io-risk](./revisions/002-reduce-lifecycle-cache-io-risk.md)) ✅
- [x] Disable startup full cache sync after restore
- [x] Disable/comment async `beforeunload` cache flush and document the suspected lifecycle bug

### Phase 2: Migration & cleanup ⏳
- [ ] Verify migration path: place a legacy `gpt-chat-cache.json` in storage → restart → confirm sessions appear in `gpt-cache/` dir and localStorage
- [ ] Verify eviction: set KEEP_N low (e.g. 3) temporarily → create >3 sessions → trigger unload → confirm only 3 files remain in `gpt-cache/`

---

## Progress

**Overall**: 75%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Feedback Tasks | 100% | ✅ |
| Phase 2 | 0% | ⏳ |

**Recent**:
- 2026-06-12: Phase 1 complete — `local-storage.ts` rewritten, build passes
- 2026-06-13: Added `storage-read.ts` for GPT persistence fs-first reads/listing; `local-storage.ts` and `json-files.ts` now use the local read abstraction
- 2026-06-13: Fixed review blockers: legacy cache no longer reimports after marker, readDir failures are no longer treated as empty cache, and Node fs read paths reject traversal
- 2026-06-13: Fixed final review edge cases: mixed missing/failed directory status is unsafe, cache ids are filename-validated, and partial legacy migration retries via `_legacy_migrating`
- 2026-06-14: Disabled startup full cache sync and async `beforeunload` flush after runtime safety concern
