---
name: gpt-chat-history-persistence
description: "Conceptual model for GPT chat history storage: temporary cache, SiYuan-synced replica, durable JSON files, JSON snapshot index, exports, and the behavioral boundaries that keep single-chat changes from rewriting unrelated history."
updated: 2026-06-17
scope:
  - /src/func/gpt/persistence/**
  - /src/func/gpt/index.ts
  - /src/func/gpt/chat/**
---

# GPT Chat History Persistence

## Overview

GPT chat history has two user-visible goals that pull in different directions:

1. Preserve temporary conversations across normal plugin reloads, SiYuan restarts, and device sync.
2. Avoid making one ordinary conversation update look like a large batch update to SiYuan sync.

The persistence design separates **working history**, **sync/restore cache**, and **intentional long-term persistence**. Do not collapse these layers unless the replacement preserves both goals.

Read this document before changing code that touches GPT chat history storage: `gpt-chat-*` localStorage keys, `gpt-cache/` files, `gpt-cache-pending-v1`, `restoreCache()`, `updateCacheFile()`, `saveToLocalStorage()`, `removeFromLocalStorage()`, JSON history files, SiYuan document export, or asset export.

## User-facing behavior boundary

The cache exists to make temporary chat history survive normal reload/restart and participate in SiYuan sync. It must not behave like an eager full-history exporter.

| User action / lifecycle | Required behavior |
|---|---|
| Continue or edit one temporary conversation | Persist that conversation; do not rewrite unrelated temporary conversation cache files |
| Delete one temporary conversation | Remove the local working copy and prevent stale cache files from restoring it later |
| Open/reload the plugin | Restore missing temporary conversations from cache without overwriting already-local working copies |
| Close/unload the plugin | Finish interrupted writes/deletes and clean safe orphans; do not rewrite every kept cache file |
| User explicitly saves/exports a conversation | Use the durable persistence path selected by the user; do not infer that every temporary cache update is a permanent save |

Temporary cache correctness is “eventual replica correctness”, not “every file proves the newest state at every moment”. The newest temporary content lives in localStorage while the app is operating.

## Storage layers and why they exist

| Layer | Example location | Meaning | Why it exists |
|---|---|---|---|
| Working temporary history | `localStorage[gpt-chat-{id}]` | Current local source of truth for temporary chat sessions | Fast UI access and a single authority for current temporary state |
| Split sync/restore cache | `data/storage/petal/{plugin}/gpt-cache/{id}.json` | Per-session replica used by SiYuan sync and restore | Lets SiYuan sync one changed conversation file instead of one large aggregate cache |
| Pending cache operation log | `localStorage[gpt-cache-pending-v1]` | Minimal redo log for cache writes/deletes that may have been interrupted | Survives reload/close without needing a full cache index or bulk rewrite |
| Durable JSON history file | `chat-history/{id}.json` managed by [`json-files.ts`](/src/func/gpt/persistence/json-files.ts) | Full persisted conversation record | Stores user-saved history outside the temporary cache lifecycle |
| JSON history snapshot | `chat-history-snapshot.json` managed by [`json-files.ts`](/src/func/gpt/persistence/json-files.ts) | Derived list/index for persisted histories: title, tags, preview, message count, timestamps | Lets history lists load metadata without reading every full JSON conversation |
| SiYuan document / asset export | [`sy-doc.ts`](/src/func/gpt/persistence/sy-doc.ts) | User-requested export into documents or assets | Produces durable content in user-facing SiYuan locations |

The split cache is a replica, not the working database. The pending log is a redo log, not a manifest. The JSON snapshot is an index for durable JSON histories, not a replacement for full JSON files. Permanent persistence is a user action, not a side effect of every temporary cache write.

## Why the design is intentionally layered

A simpler design fails one of the behavior boundaries:

| Simpler design | Failure mode |
|---|---|
| One aggregate cache file for all temporary sessions | One chat update changes the whole large file; SiYuan sync treats it as a large changed object |
| Pure in-memory dirty table | Reload/close loses the dirty table before interrupted file operations can be retried |
| Full manifest/index file that records every cache file state | Adds another frequently-changing shared file and risks becoming a second source of truth |
| Unload full rewrite of recent cache files | Preserves correctness but makes one changed chat cause many cache file updates |
| Direct Node fs writes for cache files | Bypasses SiYuan file API state; use Node fs only for read optimization where already isolated |

The current compromise is:

```text
localStorage[gpt-chat-{id}]      = source of truth for temporary working history
gpt-cache/{id}.json              = eventually-consistent per-session replica
gpt-cache-pending-v1             = minimal redo log for interrupted replica side effects
explicit save/export paths        = durable user-requested persistence
```

This is the smallest known design that keeps single-chat updates local while still surviving common reload/close interruptions.

## Core principles

### 1. Keep one source of truth for temporary working history

Treat `localStorage[gpt-chat-{id}]` as authoritative for temporary sessions. Cache files fill missing localStorage entries during restore; they do not overwrite an existing working copy.

### 2. Keep sync granularity per conversation

A normal change to conversation `A` may write `gpt-cache/A.json`. It must not rewrite `gpt-cache/B.json`, `gpt-cache/C.json`, or a shared aggregate file only because unload/cleanup ran.

### 3. Record uncertainty, not a second database

`gpt-cache-pending-v1` records operations whose side effects may not have reached `gpt-cache/`. It should answer “what might need retry?”, not “which cache files are definitely current?”. A false pending entry at worst repeats one file operation; a false “already synced” claim can lose or resurrect data.

### 4. Make delete safer than restore

A deleted temporary session must not come back just because a stale cache file survived. Pending deletes suppress restore for that id until the cache delete is confirmed or otherwise made idempotent.

### 5. Prefer preserving data over cleanup

When directory reads, file writes/deletes, migration, or localStorage parsing are uncertain, disable cache eviction. Extra stale files are preferable to deleting valid history that the code failed to see.

### 6. Separate temporary cache from durable persistence

Temporary cache supports continuity and sync. Durable persistence is handled by explicit save/export flows through [`index.ts`](/src/func/gpt/persistence/index.ts), [`json-files.ts`](/src/func/gpt/persistence/json-files.ts), and [`sy-doc.ts`](/src/func/gpt/persistence/sy-doc.ts). Do not make every temporary cache update imply permanent export, and do not make permanent export semantics depend on temporary cache freshness.

### 7. Treat JSON snapshot as a durable-history index

The JSON persistence layer has two parts: full conversation files and a snapshot file. Full JSON files are the durable records; the snapshot stores derived metadata for listing and editing persisted histories without loading every full conversation. Snapshot rebuild reads full JSON files and regenerates metadata. Snapshot updates should stay synchronized with full JSON metadata updates, but snapshot contents should not redefine the canonical conversation body.

## Lifecycle model

```text
save temporary chat
  → update localStorage source of truth
  → write one per-session cache replica
  → keep retry marker until the write is confirmed

delete temporary chat
  → remove localStorage source of truth
  → delete one per-session cache replica
  → keep retry marker so stale cache cannot restore the chat

restore on load
  → import missing localStorage entries from cache
  → skip pending-deleted ids
  → keep localStorage entries that already exist

flush on unload
  → finish queued and pending per-id operations
  → backfill missing kept cache files
  → delete safe orphans
  → avoid full rewrite of unchanged kept files

explicit persist/export
  → write durable JSON / SiYuan document / asset according to user action
  → update JSON snapshot when the durable JSON history changes
  → independent from temporary cache flush correctness
```

## Durable JSON history and snapshot

[`json-files.ts`](/src/func/gpt/persistence/json-files.ts) is the durable JSON persistence layer. It supports history management flows that need a persistent record beyond the temporary cache.

Conceptual split:

```text
chat-history/{id}.json
  = full persisted conversation body
  = loaded when opening/exporting/editing a specific persisted history

chat-history-snapshot.json
  = derived metadata list for persisted histories
  = used by history lists and tag/title management to avoid loading every full history
```

The snapshot is allowed to duplicate metadata because it serves a different access pattern than full JSON files. Keep these boundaries:

- Saving a full JSON history should update the snapshot metadata for that history.
- Removing a full JSON history should remove its snapshot entry.
- Editing title/tags of a persisted history should update both the full JSON metadata and the snapshot entry.
- Rebuilding the snapshot should derive from full JSON files; avoid treating snapshot-only data as the canonical conversation body.
- Snapshot failure or rebuild uncertainty should not be used as a reason to delete full JSON history files.

This snapshot mechanism is unrelated to the temporary cache redo log. The snapshot indexes durable histories; the redo log retries interrupted temporary-cache side effects.

## Legacy aggregate cache

Older versions used a single `gpt-chat-cache.json` aggregate file for temporary sessions. That format is only a migration source. The current model keeps it read-only and migrates into per-session cache files when needed. Do not reintroduce a single hot aggregate file for normal temporary cache updates.

## Implementation anchors

- [`local-storage.ts`](/src/func/gpt/persistence/local-storage.ts): temporary working history, split cache replica, pending redo log, restore/update lifecycle, legacy aggregate migration.
- [`storage-read.ts`](/src/func/gpt/persistence/storage-read.ts): read abstraction for GPT persistence files; desktop may use Node fs for reads, while writes/deletes stay on SiYuan file API paths.
- [`index.ts`](/src/func/gpt/persistence/index.ts): explicit persistence entry point for user-triggered save/export.
- [`json-files.ts`](/src/func/gpt/persistence/json-files.ts): durable JSON history files plus `chat-history-snapshot.json` metadata index.
- [`sy-doc.ts`](/src/func/gpt/persistence/sy-doc.ts): export to SiYuan documents/assets.
- [`src/func/gpt/index.ts`](/src/func/gpt/index.ts): module load/unload calls for restore and flush.

## Modification checklist

Before changing this area, answer these questions in the design or review notes:

1. Which layer is being changed: temporary working history, sync/restore replica, pending redo log, durable JSON full history, JSON snapshot index, or SiYuan export?
2. Can one conversation update still avoid rewriting unrelated cache files?
3. What happens if SiYuan closes after the source-of-truth mutation but before the cache file operation finishes?
4. What prevents a failed delete from resurrecting a session during restore?
5. If an API call returns failure without throwing, does the code keep enough retry state?
6. If a read/list/parse step fails, does the code preserve data rather than evicting blindly?
7. If the change touches durable JSON history, does it keep full JSON files and the snapshot index synchronized without making the snapshot the canonical conversation body?
8. Does the change require updating this spec-doc and the top-of-file `@SpecDoc` references?
