---
change: "gpt-cache-split"
created: 2026-06-12T22:35:51
---

# Design: gpt-cache-split

## Storage Layout

```
Before:  data/storage/petal/{plugin}/gpt-chat-cache.json   (68MB monolithic)

After:   data/storage/petal/{plugin}/gpt-cache/
         ├── {session-id-1}.json   (~1-3MB each)
         ├── {session-id-2}.json
         └── ...                   (max KEEP_N = 36 files)
```

## Interface Contract

Exported API unchanged — internal implementation rewritten:

```ts
// Signatures preserved (no caller changes needed)
export const saveToLocalStorage = (history: IChatSessionHistoryV2) => void;
export const listFromLocalStorage = (): IChatSessionHistoryV2[];
export const removeFromLocalStorage = (id: string) => void;
export const updateCacheFile = async () => Promise<void>;
export const restoreCache = async () => Promise<void>;
```

Side effects change:
- `saveToLocalStorage` now also writes `gpt-cache/{id}.json` (fire-and-forget, no await needed from caller since it's already sync)
- `removeFromLocalStorage` now also deletes `gpt-cache/{id}.json`

## Behavioral Flow

### Write path (incremental)

```
saveToLocalStorage(history)
  ├─ localStorage.setItem(`gpt-chat-${id}`, JSON.stringify(history))
  └─ writeCacheFile(id, history)  // async, fire-and-forget
       └─ plugin.saveBlob(`gpt-cache/${id}.json`, history)
```

### Flush path (unload cleanup)

```
updateCacheFile()
  ├─ histories = listFromLocalStorage()
  ├─ sort by updated/timestamp desc
  ├─ keep = histories.slice(0, KEEP_N)
  ├─ for each in keep → writeCacheFile(id, history)
  ├─ existingFiles = readDir('gpt-cache/')
  ├─ orphans = existingFiles - keep.ids
  └─ for each orphan → deleteFile(orphan)
```

### Restore path (startup)

```
restoreCache()
  ├─ migrateLegacyCacheIfNeeded()   // one-time
  ├─ files = readDir('gpt-cache/')
  ├─ histories = await Promise.all(files.map(readAndParse))
  ├─ sort by updated/timestamp desc
  ├─ for each (up to KEEP_N):
  │    ├─ migrate V1→V2 if needed
  │    └─ if !localStorage.has(key) → localStorage.setItem(key, ...)
  └─ return
```

### Migration path (one-time)

```
migrateLegacyCacheIfNeeded()
  ├─ blob = plugin.loadBlob('gpt-chat-cache.json')
  ├─ if !blob → return (no legacy file)
  ├─ histories = JSON.parse(blob)
  ├─ for each history:
  │    └─ writeCacheFile(id, history)  // write to gpt-cache/{id}.json
  └─ (old file preserved — not deleted)
```

## Internal Helpers (new)

```ts
const CACHE_DIR = 'gpt-cache';

/** Write single session to cache dir */
const writeCacheFile = async (id: string, history: IChatSessionHistoryV2) => {
    const plugin = thisPlugin();
    await plugin.saveBlob(`${CACHE_DIR}/${id}.json`, history);
};

/** Delete single session cache file */
const deleteCacheFile = async (id: string) => {
    const plugin = thisPlugin();
    await plugin.removeData(`${CACHE_DIR}/${id}.json`);
};

/** List all files in cache dir */
const listCacheDir = async (): Promise<string[]> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${CACHE_DIR}/`;
    const files = await api.readDir(dir);
    if (!files) return [];
    return files.filter(f => !f.isDir && f.name.endsWith('.json')).map(f => f.name);
};
```

## Eviction Strategy

- Trigger: only during `updateCacheFile` (unload-time)
- Logic: keep files matching current localStorage sessions (up to KEEP_N); delete rest
- Between unloads: may temporarily have orphan files (session removed from localStorage but file remains) — acceptable, cleaned up next cycle
- No manifest file needed — localStorage is the source of truth for "active" sessions

## Migration Constraints

| Constraint | Handling |
|-----------|----------|
| Old file may not exist (fresh install) | Guard: `if (!blob) return` |
| Old file may be corrupt | Try-catch around parse, skip on error |
| Concurrent migration (multi-device sync) | Idempotent: overwriting existing per-session file is safe |
| Old file preservation | Never deleted automatically; user removes manually |
