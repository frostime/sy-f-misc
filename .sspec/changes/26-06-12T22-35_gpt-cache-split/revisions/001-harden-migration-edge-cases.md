---
revision: 1
date: 2026-06-13T22:46:15
trigger: "review-feedback"
---

<!-- MUST set trigger to one of: review-feedback | discovery | scope-expansion | correction
This file records scope/design changes after Plan begins (spec/design locked).
Do NOT use revisions during Design phase — edit spec.md/design.md directly.
File naming: revisions/NNN-description.md (incrementing number). -->

# Harden migration edge cases

## Reason

Code review found three data-safety edge cases in the split cache implementation:

1. `missing` from one directory-read backend plus `failed` from another could be collapsed to `missing`.
2. Session ids were interpolated into cache file paths without filename-safety validation.
3. A partial first legacy migration could leave some split files without `_legacy_migrated`; next startup could treat “some split files exist” as complete migration and skip remaining legacy sessions.

## Changes

### Spec Impact

The migration/restore safety contract is tightened:

- A directory read is considered safely missing only when no attempted backend reports failure.
- Cache file writes/deletes only use path-safe session ids.
- Legacy migration records an in-progress marker before writing split files; an in-progress migration is retried instead of being marked complete just because some split files exist.

### Design Impact

Add marker `gpt-cache/_legacy_migrating`:

- Written before legacy sessions are split into `gpt-cache/{id}.json`.
- If migration partially fails, the marker remains and disables orphan eviction for the session.
- On next startup, presence of `_legacy_migrating` means retry legacy migration even if some split cache files already exist.
- Existing split files without `_legacy_migrating` and without `_legacy_migrated` are still treated as pre-existing split cache state and get `_legacy_migrated` to avoid resurrecting deleted sessions.

### Task Impact

Add feedback tasks to harden directory status handling, cache id path safety, and partial migration retry semantics.
