---
name: sync-plugin-runtime-config
status: REVIEW
change-type: single
created: 2026-07-24T00:54:25
reference:
  - source: "tmp/handover_sync-plugin-restart.md"
    type: "doc"
    note: "Root-cause research for SiYuan storage-sync plugin restarts."
  - source: ".sspec/changes/26-07-24T00-54_sync-plugin-runtime-config/revisions/001-extract-runtime-lifecycle-coordinator.md"
    type: "revision"
    note: "Move lifecycle ordering into a tested coordinator after verifying SiYuan initial-load concurrency."
---

# sync-plugin-runtime-config

## Problem Statement

Each SiYuan 3.7.0 sync merge that changes any file under `data/storage/petal/f-misc/` invokes the inherited `Plugin.onDataChanged()`, causing one full fmisc uninstall/load cycle. GPT writes one synchronized `gpt-cache/{id}.json` replica for ordinary conversation updates, so multi-device use can repeatedly destroy and rebuild active chat UI.

A no-op override would stop the restart but would leave synchronized runtime settings stale indefinitely. The plugin needs a settings-persistence lifecycle that preserves the current import/export behavior, keeps active feature state for ordinary synchronized data, and reconciles the known configuration files into runtime settings without duplicating storage semantics across modules.

## Proposed Solution

### Approach

Add a deep `SettingsPersistence` module under `src/settings/`. It contains settings initialization, synchronized-change scheduling, storage snapshots, local-dirty decisions, central legacy/module persistence, apply ordering, and error isolation. `FMiscPlugin` only forwards SiYuan lifecycle events; feature modules only declare how a dedicated settings file maps to their runtime settings.

The new lifecycle decomposes existing complete loaders rather than replacing them. GPT/Toggl keep their current full `load()` and `save()` entry points as compatibility wrappers. Settings initialization and synchronized reconciliation reuse the same extracted “apply stored settings to runtime” operation; module startup continues to run the old startup/network/script effects. No configuration schema, file name, migration, or local-save trigger changes.

### Behavior Contract

**BC-1: Synchronized plugin data does not restart fmisc**

- **Surface**: SiYuan plugin lifecycle during data sync.
- **Before**: a synchronized change below `data/storage/petal/f-misc/` invokes the inherited handler and performs `onunload()` followed by `onload()`.
- **After**: `FMiscPlugin.onDataChanged()` keeps the current plugin instance and active GPT UI alive while scheduling settings reconciliation.
- **Unchanged**: plugin code changes, plugin enable/disable, marketplace updates, and other `reloadPlugins` events continue to use SiYuan's normal full reload path.

**BC-2: All runtime settings initialize before feature modules load**

- `configs.json` and `custom-module.config.json` retain their existing initial import behavior.
- GPT `gpt.config.json` and Toggl `toggl.json` initialize runtime settings whether or not the feature module is enabled.
- Enabled feature modules start only after settings initialization completes and observe the same settings and startup effects as the previous complete loader.
- Disabled GPT/Toggl modules gain initialized settings variables and accurate settings-panel values without registering feature resources or running startup/network/script effects.

**BC-3: Clean runtime settings converge to synchronized files**

- `configs.json` changes update legacy runtime values. Changed Enable keys immediately reuse `toggleEnable()` after all settings files have been applied.
- `custom-module.config.json` changes reconcile independently by module key and reuse the corresponding `declareModuleConfig.load()` import operation.
- `gpt.config.json` and `toggl.json` changes reuse their dedicated settings declarations to update runtime settings.
- A synchronized cache/history/asset change with unchanged settings files performs no settings apply or feature side effects.

**BC-4: Local unsaved settings take precedence**

- For each settings scope, runtime state that differs from the last applied state is treated as a local unsaved edit.
- A remote change for that same scope is not applied while it is locally dirty.
- `custom-module.config.json` uses module-key granularity, so one dirty module does not block remote updates to another module.
- Field-level merging within one scope and distributed conflict resolution between two editing devices remain SiYuan storage responsibilities.

**BC-5: Synchronization does not replay startup-only effects**

- GPT reconciliation updates provider, model, prompt, tool, UI, and miscellaneous settings, but does not import custom JavaScript modules, scan custom script tools, add/remove the pinned chat dock, or alter an in-flight request.
- Toggl reconciliation updates its settings store but does not refetch the user, projects, or tags; subsequent operations use the new values.
- Device-local `zoteroDir.config.json` is excluded. Shared Zotero settings in `custom-module.config.json` remain included.
- GPT cache, durable chat history, snapshots, assets, and custom module source files retain their existing load/restore/manual-reload behavior.

**BC-6: Existing import/export contracts remain compatible**

- `FMiscPlugin.loadConfigs()` / `saveConfigs()`, GPT storage `load()` / `save()`, Toggl config `load()` / `save()`, and `declareModuleConfig.load()` / `dump()` remain available with their existing complete behavior and storage formats.
- Existing local settings changes keep their current runtime mutation, debounce, and save paths.
- With SiYuan synchronization disabled, settings initialize once and feature modules run normally; no reconciliation callback is required.
- The refactored startup path is behaviorally equivalent for enabled modules: settings import plus module startup produces the same final runtime settings, resources, and startup effects.

**BC-7: Failures preserve the last usable runtime state**

- Reconciliation calls are serialized/coalesced; two `onDataChanged()` callbacks do not apply settings concurrently.
- Failure to read or apply one settings scope leaves its previous runtime state intact and does not block independent scopes.
- Errors identify the settings scope without logging stored values or secrets.
- Deleted settings files/sections are not reset live; defaults take effect on the next normal plugin load.
- SiYuan versions that route synchronized petal data through `reloadPlugins` rather than `dataChangePlugins` are outside the mitigation boundary.

### Implementation Changes

**fix(plugin-lifecycle): Replace inherited data-sync restart**

Add a synchronous `onDataChanged()` override that forwards to `SettingsPersistence`, contains asynchronous failures, and never calls the base implementation. Initialize persistence before feature modules and dispose it during plugin teardown. Serves BC-1, BC-2, and BC-7.

**feat(settings-persistence): Centralize persistent-settings lifecycle**

Create `src/settings/persistence.ts` as the sole owner of settings initialization orchestration, sync scheduling, snapshot/dirty decisions, configuration apply order, central legacy/module storage, and reconciliation error isolation. Serves BC-2 through BC-7.

**refactor(settings): Keep UI assembly thin**

Move legacy/module persistence mechanics out of `initSetting()` while preserving setting descriptors, local change handlers, debounce timing, `loadConfigs()` / `saveConfigs()`, and `declareModuleConfig` behavior. Serves BC-2, BC-3, BC-4, and BC-6.

**feat(module-settings): Declare dedicated settings storage**

Add an optional `declareDedicatedSettingsStorage` contract for modules such as GPT/Toggl that use their own settings file. The declaration exposes only the current runtime-settings snapshot and the repeatable stored-settings apply operation. Serves BC-2 through BC-6.

**refactor(func-lifecycle): Make existing transitions awaitable**

Expand module lifecycle return types to `void | Promise<void>`, await startup/teardown where ordering matters, and make `toggleEnable()` await the existing module transition. Do not add a synchronized-data lifecycle hook to `IFuncModule`. Serves BC-2, BC-3, BC-6, and BC-7.

**refactor(gpt-settings): Decompose the complete loader compatibly**

Extract repeatable runtime-settings application and startup-extension loading. Keep the previous complete GPT storage `load()` as a wrapper over the same operations and keep `save()`/schema/migrations unchanged. Serves BC-2 through BC-7.

**refactor(toggl-settings): Decompose the complete loader compatibly**

Extract repeatable runtime-settings application and startup network initialization. Keep the previous complete Toggl config `load()` as a wrapper over the same operations and keep `save()`/storage format unchanged. Serves BC-2 through BC-7.

**refactor(zotero-settings): Separate repeatable shared apply from device initialization**

Make shared Zotero module settings repeatably importable while retaining one-time loading for the device-local directory map and existing compatibility entry points. Serves BC-3 through BC-7.

**docs(settings-persistence): Record lifecycle and ownership boundaries**

Update module and GPT architecture documentation with initialization order, dedicated settings declarations, compatibility wrappers, synchronization behavior, and startup-only exclusions. Serves BC-1 through BC-7.

### Scope Summary

| File | Change | Effort |
|---|---|---:|
| `src/index.ts` | Own persistence handle; forward `onDataChanged()`; order init/dispose | M |
| `src/settings/persistence.ts` | New deep module for settings persistence and synchronized reconciliation | L |
| `src/settings/index.ts` | Thin UI assembly and delegation to persistence | M |
| `src/func/types.d.ts` | Awaitable lifecycle and dedicated settings-storage declaration | S |
| `src/func/index.ts` | Awaitable startup/teardown/toggle ordering | M |
| `src/func/gpt/index.ts` | Use preloaded settings and run only feature startup effects | S |
| `src/func/gpt/model/storage.ts` | Extract reusable apply/startup operations; retain complete wrappers | M |
| `src/func/toggl/index.ts` | Use preloaded settings and run only feature startup effects | S |
| `src/func/toggl/state/config.ts` | Extract reusable apply/network operations; retain complete wrappers | M |
| `src/func/zotero/config.ts` | Make shared import repeatable; preserve device initialization | S |
| `.sspec/spec-docs/func-module-architecture.md` | Document persistence and feature lifecycle ownership | M |
| `.sspec/spec-docs/gpt-module-architecture-overview.md` | Document compatible GPT loader decomposition | S |

### Design Reference

See [design.md](./design.md).
