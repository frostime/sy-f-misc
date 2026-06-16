# Memory: gpt-cache-split

**Updated**: 2026-06-16T23:11+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/SiYuanDevelopment/sy-f-misc`
- Branch: `main`
- HEAD: `2cfacf1649639841660975c727efb808e7ab6a84`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main [ahead 1]
M  .sspec/.meta.json
A  .sspec/requests/26-06-12T21-32_gpt-chat-cache-issue.md
```

## State
<!-- Where we are and what's next — one to three lines.
This is the resume entry point; the first section an agent reads on cold start. -->

Implementation is in WIP on branch `fix/gpt-cache-pending-journal`: per-session GPT cache is implemented, restore hardening is applied, GPT persistence read paths use `storage-read.ts` (desktop Node fs first, SiYuan API fallback), and unload no longer rewrites all kept cache files. `updateCacheFile()` now drains queued writes, replays `gpt-cache-pending-v1`, writes only missing kept files, then deletes orphans. Cache writes/deletes inspect SiYuan file API response codes before clearing pending ops. GPT chat history persistence behavior boundaries are now in `.sspec/spec-docs/gpt-chat-history-persistence.md`. Next: runtime-test save/delete/reload in SiYuan desktop; verify sync only touches changed or missing `gpt-cache/{id}.json` files; do not use Node fs for writes/deletes.

## Key Files
<!-- Files critical to understanding/continuing this change.
- `path/file` — what it contains, why it matters -->

- `src/func/gpt/persistence/local-storage.ts` — split cache implementation for `gpt-cache/{session-id}.json`, restore/migration/update logic, write queue, eviction guard.
- `src/func/gpt/persistence/storage-read.ts` — GPT-persistence-only read abstraction; hides path conversion between SiYuan API path and desktop Node fs path.
- `src/func/gpt/persistence/json-files.ts` — persisted chat history JSON/snapshot logic; now uses `storage-read.ts` for reads/listing.

## Knowledge
<!-- MUST apply write-gate: "If this item were lost, would the next agent make a wrong decision?"
Yes → write it. No → skip.

Target reader: a cold-starting agent that can only see spec + design + tasks + this Knowledge.
Exclude: anything already covered by spec/design/tasks (no restating).
Include: rejected approaches with reasons, implicit constraints, user preferences, API/env traps, insights that shaped design choices.

Format: - [timestamp] [Type] content
Types: Decision | Constraint | Gotcha | Rejected | Insight
  Decision  = directional choice made (with rationale)
  Constraint = hard limit imposed externally or by user
  Gotcha     = trap invisible without reading code/docs
  Rejected   = approach considered and discarded (with why — prevents successor from re-trying)
  Insight    = finding that shaped understanding but is not itself a decision

Project-level discoveries → ALSO append to project.md Notes.
Obsolete items → mark [obsolete: timestamp], never silently delete. -->

- [2026-06-13T19:29+08:00] [Constraint] User explicitly prefers Node fs only for reads on SiYuan desktop; writes/deletes MUST remain through SiYuan API (`saveBlob`/`putFile`/`removeBlob`/`removeData`) because direct fs writes are discouraged by SiYuan developers and may cause index/state inconsistency.
- [2026-06-13T19:29+08:00] [Decision] Kept Node fs read optimization local to GPT persistence (`storage-read.ts`) instead of modifying global VFS or `SiYuanVFS`, to minimize blast radius.
- [2026-06-13T19:29+08:00] [Gotcha] SiYuan API paths and Node fs paths are different: API uses `data/storage/petal/{plugin}/{relative}`, while desktop fs uses `{window.siyuan.config.system.dataDir}/storage/petal/{plugin}/{relative}`. `storage-read.ts` normalizes both relative and API-style paths.
- [2026-06-13T21:47+08:00] [Decision] Legacy migration uses marker file `gpt-cache/_legacy_migrated` and never deletes `gpt-chat-cache.json`; if split cache already has any session files but no marker, the code writes the marker and skips importing missing legacy ids to avoid resurrecting deleted sessions.
- [2026-06-13T21:47+08:00] [Gotcha] `readDir` results must preserve `ok`/`missing`/`failed`; collapsing failures to empty can trigger stale legacy fallback and unsafe orphan eviction.
- [2026-06-13T22:46+08:00] [Decision] Legacy migration now writes `gpt-cache/_legacy_migrating` before splitting legacy sessions; if migration partially fails, later startup retries legacy migration instead of marking completion only because some split files exist.
- [2026-06-13T22:46+08:00] [Constraint] `gpt-cache/{id}.json` writes/deletes only accept path-safe session ids (`[A-Za-z0-9_-]+`) to keep cache I/O inside the flat cache directory.
- [2026-06-13T22:46+08:00] [Gotcha] `json-files.ts` snapshot rebuild has pre-existing lossy directory-read behavior (`readDir` failure → `[]`); marked with `// ISSUE` and intentionally left as follow-up.
- [2026-06-14T02:46+08:00] [Decision] [obsolete: 2026-06-16T23:11+08:00] Startup now only runs `restoreCache()`; full `updateCacheFile()` is reserved for incremental saves and awaited plugin unload to avoid startup rewrite storms.
- [2026-06-16T23:11+08:00] [Decision] `updateCacheFile()` no longer rewrites every kept cache file on unload. It drains the per-id write queue, replays the durable `gpt-cache-pending-v1` redo log, writes kept files only when missing from `gpt-cache/`, and then deletes orphans.
- [2026-06-16T23:11+08:00] [Decision] `gpt-cache-pending-v1` is a localStorage redo log for cache side effects, not a cache index or second source of truth. `saveToLocalStorage`/`removeFromLocalStorage` record a pending op before mutating `gpt-chat-{id}` and clear it only when the matching tokened write/delete succeeds.
- [2026-06-16T23:11+08:00] [Gotcha] `restoreCache()` must apply pending deletes before restoring from `gpt-cache/{id}.json`; otherwise a failed/interrupted delete can resurrect a session from its stale cache file.
- [2026-06-16T23:11+08:00] [Gotcha] `thisPlugin().saveBlob/removeBlob` can resolve without throwing when the underlying SiYuan file API returns nonzero; pending cache ops must be cleared only after inspecting `/api/file/putFile` or `/api/file/removeFile` response `code`.
- [2026-06-17T00:31+08:00] [Decision] Created spec-doc `.sspec/spec-docs/gpt-chat-history-persistence.md` as the durable source for GPT chat history persistence behavior boundaries; future changes touching temporary chat cache, `gpt-chat-*`, `gpt-cache/`, `gpt-cache-pending-v1`, durable JSON history, SiYuan export, or related file API writes should read/update it.
- [2026-06-14T02:46+08:00] [Rejected] `beforeunload` async `updateCacheFile()` flush is disabled/commented out because Electron/browser does not await async beforeunload handlers and can abort SiYuan file API requests mid-flight.

## Milestones
<!-- MUST append one line per session. Pure facts; new entries appended at the end.
CLI treats the last valid bullet as the latest milestone.
- [ISO timestamp] one-sentence summary -->

- [2026-06-13T19:29+08:00] Added local GPT persistence read abstraction (`storage-read.ts`), wired fs-first reads into split cache and JSON history reads, verified TypeScript/build, and prepared WIP commit.
- [2026-06-13T21:47+08:00] Fixed review blockers: one-time legacy migration marker, safe readDir status handling, and path traversal rejection for Node fs read paths.
- [2026-06-13T22:46+08:00] Fixed final review edge cases: mixed missing/failed directory status is unsafe, cache ids are filename-validated, and partial legacy migration retries via `_legacy_migrating`; diagnostics and project type-check pass.
- [2026-06-14T01:41+08:00] Fixed review follow-up #1: `_legacy_migrating` state now propagates through restore and prevents orphan eviction while migration remains incomplete.
- [2026-06-14T02:46+08:00] Disabled startup full cache sync and async `beforeunload` cache flush after runtime process/file-lock safety concern; documented lifecycle rationale in code and revision 002.
- [2026-06-16T23:11+08:00] Implemented pending-op journal for split GPT cache; unload replays pending operations and writes only missing kept files instead of rewriting all kept cache files; type-check and production build pass.
- [2026-06-16T23:11+08:00] Created `fix/gpt-cache-pending-journal` branch, committed pending-journal checkpoint (`331a42c`), then fixed review issues: checked SiYuan file API response codes, filtered pending deletes before restore slicing, and made malformed localStorage histories disable eviction instead of aborting replay.
- [2026-06-17T00:31+08:00] Added `gpt-chat-history-persistence` spec-doc, registered it in `.sspec/project.md`, and linked it from GPT persistence entry files.
