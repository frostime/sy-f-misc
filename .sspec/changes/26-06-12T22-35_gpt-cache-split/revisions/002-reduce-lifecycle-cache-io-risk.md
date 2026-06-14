---
revision: 2
date: 2026-06-14T02:46:25
trigger: "review-feedback"
---

<!-- MUST set trigger to one of: review-feedback | discovery | scope-expansion | correction
This file records scope/design changes after Plan begins (spec/design locked).
Do NOT use revisions during Design phase — edit spec.md/design.md directly.
File naming: revisions/NNN-description.md (incrementing number). -->

# Reduce lifecycle cache IO risk

## Reason

Runtime testing raised a severe safety concern: after split-cache changes, closing/reopening SiYuan could trigger risk-control warnings, `gpt-cache/` could be hard to delete manually, and a high-CPU process was observed. Review identified two lifecycle I/O risks:

1. Startup called `restoreCache()` and immediately called `updateCacheFile()`, causing a full split-cache rewrite after restore.
2. `beforeunload` registered async `updateCacheFile()`, but browser/Electron does not await async `beforeunload` handlers, so file API requests can be aborted mid-flight.

## Changes

### Spec Impact

Startup restore behavior remains required, but startup full sync is no longer part of the lifecycle contract. Cache persistence relies on incremental per-session writes plus awaited plugin unload full-sync.

### Design Impact

Lifecycle changes:

- Keep `await restoreCache()` on plugin load.
- Remove startup `await updateCacheFile()` to avoid immediate full rewrite of all split cache files.
- Disable/comment out `beforeunload` registration for `updateCacheFile()` and document the suspected async-handler risk in code.
- Keep plugin `unload()` `await updateCacheFile()` as the awaited full-sync/orphan-cleanup path.

### Task Impact

Add feedback task to reduce lifecycle cache I/O risk by disabling startup full sync and async `beforeunload` flush.
