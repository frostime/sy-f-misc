---
change: "sync-plugin-runtime-config"
created: 2026-07-24T00:54:25
---

# Design: sync-plugin-runtime-config

## Design Invariants

| Invariant | Required consequence |
|---|---|
| Existing storage behavior is the compatibility baseline | New lifecycle reuses extracted import/export operations; it does not invent parallel serializers or schemas. |
| Settings persistence and feature lifecycle are distinct | Reading/applying settings never registers or tears down feature resources. |
| One owner per decision | `SettingsPersistence` owns scheduling/reconciliation; storage owners map payloads; feature modules own startup/teardown effects. |
| `onDataChanged()` has no changed-file argument | Known settings files are checked explicitly; no path-routing assumption is introduced. |
| Local edits must survive unrelated sync | Disk/applied/current snapshots are compared before calling existing import operations. |
| Synchronization is optional | Startup and local save behavior do not depend on an `onDataChanged()` callback ever occurring. |
| Existing callers may use complete loaders | GPT/Toggl complete `load()` and `save()` exports remain behaviorally compatible wrappers. |

## Ownership

| Owner | Owns | Does not own |
|---|---|---|
| `FMiscPlugin` | Adapting SiYuan `onload` / `onDataChanged` / `onunload` to settings and feature lifecycles | File-specific settings rules |
| `SettingsPersistence` | Initial settings import order, central legacy/module persistence, sync queue, snapshots, dirty decisions, apply ordering, failure isolation | GPT/Toggl payload schemas; feature commands/events/Dock/network/script effects |
| `declareDedicatedSettingsStorage` owner | Mapping one dedicated settings file to/from runtime settings | Deciding when sync runs; feature lifecycle |
| `declareModuleConfig` owner | Mapping its section of `custom-module.config.json` to/from runtime settings | Shared-file I/O and cross-module ordering |
| `IFuncModule.load/unload` owner | Feature startup/teardown and module-specific effects | Sync conflict policy |
| SiYuan | File synchronization, merge selection, plugin-code reload routing | fmisc runtime reconciliation |

## Structure

```text
src/settings/
  index.ts
    - collect module declarations
    - assemble settings UI
    - forward local setting changes

  persistence.ts
    SettingsPersistence
      - import all settings during plugin startup
      - retain existing legacy/module save behavior
      - schedule reconciliation after storage sync
      - read each known settings file once per run
      - own disk/applied snapshots
      - detect local dirty state
      - call existing settings import operations in order
      - defer Enable transitions until all settings are current
      - isolate errors and redact payloads
```

No generic `src/libs/synced-config.ts` is created. The snapshot algorithm is private to the only subsystem that uses it.

## Public Contracts

### Dedicated Settings File

A dedicated settings file is a module-owned settings file outside the shared `custom-module.config.json`, currently `gpt.config.json` or `toggl.json`.

```ts
type MaybePromise<T> = T | Promise<T>;
type SettingsRecord = Record<string, unknown>;

interface IDedicatedSettingsStorage {
    fileName: string;

    /** Returns the same serializable runtime settings used by the existing save path. */
    getRuntimeSettingsSnapshot: () => SettingsRecord;

    /** Updates settings variables only; feature startup/teardown effects are excluded. */
    applyStoredSettingsToRuntime: (
        stored: SettingsRecord | undefined,
        plugin: FMiscPlugin,
    ) => MaybePromise<void>;
}

interface IFuncModule {
    name: string;
    enabled: boolean;
    load: (plugin: FMiscPlugin) => MaybePromise<void>;
    unload: (plugin?: FMiscPlugin) => MaybePromise<void>;

    declareDedicatedSettingsStorage?: IDedicatedSettingsStorage;

    declareModuleConfig?: {
        // Existing fields remain unchanged.
        load?: (itemValues?: Record<string, any>) => MaybePromise<void>;
        dump?: () => Record<string, any>;
    };
}
```

The two declaration styles are intentionally asymmetric:

| Declaration | Storage | Existing/new |
|---|---|---|
| `declareModuleConfig` | One module-key section in shared `custom-module.config.json` | Existing, unchanged |
| `declareDedicatedSettingsStorage` | One complete module-owned file | Additive; only GPT/Toggl initially |

### Settings Persistence Lifecycle

```ts
interface SettingsPersistenceOptions {
    plugin: FMiscPlugin;
    enabledSettingItems: ISettingItem[];
    miscSettingItems: ISettingItem[];
    modules: IFuncModule[];
}

class SettingsPersistence {
    static initialize(options: SettingsPersistenceOptions): Promise<SettingsPersistence>;

    updateLegacySetting(group: string, key: string, value: unknown): void;
    scheduleReconcileAfterStorageSync(): void;
    dispose(): void;
}
```

Lifecycle states:

```text
UNINITIALIZED
  -> SettingsPersistence.initialize()
       import all settings
       establish snapshots
  -> READY
       updateLegacySetting(...)
       scheduleReconcileAfterStorageSync()
  -> dispose()
  -> DISPOSED
       queued/pending reconciliation cannot apply state
```

`FMiscPlugin.onDataChanged()` remains synchronous and only calls `scheduleReconcileAfterStorageSync()`.

## Compatibility Decomposition

### General Rule

```text
old complete load
  = read stored settings
  + apply stored settings to runtime
  + run startup effects

new startup for an enabled module
  = SettingsPersistence.initialize()
      [read + apply]
  + module.load()
      [run startup effects]
```

For enabled modules with no concurrent sync, both paths must produce the same final runtime settings, feature resources, and startup effects.

### Legacy Configuration

Keep `FMiscPlugin.loadConfigs()` and `saveConfigs()` available. Extract a repeatable legacy apply operation without changing the stored payload:

```ts
FMiscPlugin.applyConfigs(stored: Record<string, unknown> | undefined): void;
FMiscPlugin.loadConfigs(): Promise<Record<string, unknown> | undefined>;
FMiscPlugin.saveConfigs(): Promise<void>;
```

```text
loadConfigs()
  -> loadData("configs.json")
  -> applyConfigs(stored)
  -> return stored for initial disk snapshot
```

Existing callers that ignore the new return value remain compatible.

### Shared Module Configuration

The block currently inside `initSetting()` moves into `SettingsPersistence` without changing its file or declarations:

```text
startup
  -> load custom-module.config.json
  -> for each declared module config: load(stored[moduleKey])
  -> snapshot stored section + dump()
  -> preserve existing wrapped set() + debounced whole-file save
```

For synchronized changes, `load()` is reused only for a clean changed section. Loaders must be repeatable settings imports. Zotero is adapted because its current memoized initialization prevents repeatable shared-setting apply.

### GPT

```ts
// New internal operations used by both lifecycle paths.
export function applyStoredSettingsToRuntime(
    stored: Record<string, unknown> | undefined,
    plugin?: Plugin,
): Promise<void>;

export function loadStartupExtensions(): Promise<void>;

// Existing complete compatibility wrapper remains.
export async function load(plugin?: Plugin): Promise<void> {
    const stored = await plugin.loadData("gpt.config.json");
    await applyStoredSettingsToRuntime(stored, plugin);
    await loadStartupExtensions();
}

// Existing save() and storage schema remain unchanged.
```

`declareDedicatedSettingsStorage` references `getRuntimeSettingsSnapshot = asStorage` and `applyStoredSettingsToRuntime`. The normal fmisc startup no longer calls the complete wrapper twice: settings initialize through the declaration, then GPT module load invokes only `loadStartupExtensions()` and its existing feature-resource setup.

Migration behavior remains inside the apply operation. If migration writes normalized storage, a later reconciliation recognizes that disk state already represents current runtime settings and refreshes snapshots without reapplying feature effects.

### Toggl

```ts
export function applyStoredSettingsToRuntime(
    stored: Record<string, unknown> | undefined,
): void;

export function loadAccountMetadata(): Promise<boolean>;

// Existing complete compatibility wrapper remains.
export async function load(plugin: Plugin): Promise<boolean> {
    const stored = await plugin.loadData("toggl.json");
    applyStoredSettingsToRuntime(stored);
    return loadAccountMetadata();
}

// Existing save() and storage format remain unchanged.
```

The normal module startup uses already-loaded settings and invokes `loadAccountMetadata()` before existing feature setup. Synchronization invokes only the declaration's apply operation.

### Zotero

```text
repeatable shared settings apply
  -> update zoteroPassword + migrationPromptPending

one-time device initialization
  -> load zoteroDir.config.json
  -> populate device-id path map

ensureZoteroConfigLoaded()
  -> preserve existing awaitable compatibility behavior
```

`declareModuleConfig.load()` performs the repeatable shared apply and ensures device initialization without suppressing later shared updates.

## Startup and Teardown

```text
FMiscPlugin.onload()
  -> construct/initialize SettingsPersistence
       1. initialize defaults
       2. import configs.json
       3. import custom-module.config.json sections
       4. import GPT/Toggl dedicated settings files
       5. establish disk/applied snapshots
       6. install existing local-save callbacks
  -> register settings UI
  -> await func.load(plugin)
       enabled modules run existing feature startup effects using loaded settings

FMiscPlugin.onunload()
  -> SettingsPersistence.dispose()
       prevent queued sync work from applying
  -> await func.unload(plugin)
       preserve existing feature cleanup
```

If `onDataChanged()` arrives before initialization completes, `FMiscPlugin` records one pending notification and schedules it after `SettingsPersistence.initialize()` succeeds.

With synchronization disabled, startup follows the same path; no later sync notification occurs. Existing local setting changes continue to update runtime state and call the same debounced save functions.

## Synchronized Reconciliation

### Internal Snapshot State

```ts
interface SettingsScopeSnapshot {
    lastSeenDisk: unknown;
    lastAppliedRuntime: unknown;
}

type ReconcileDecision =
    | "unchanged"
    | "already-current"
    | "keep-local-dirty"
    | "apply-stored-settings"
    | "defer-deletion";
```

Decision order for each scope:

```text
stored scope is missing after previously existing
  -> defer-deletion
     preserve runtime; defaults apply on next normal startup

nextDisk == lastSeenDisk
  -> unchanged

nextDisk represents current runtime settings
  -> already-current
     update snapshots only
     (covers existing local save paths that do not notify SettingsPersistence)

currentRuntime != lastAppliedRuntime
  -> keep-local-dirty
     preserve local state; do not advance snapshots

otherwise
  -> apply-stored-settings
     call the existing import operation
     update snapshots only after success
```

Snapshot granularity:

| Storage | Scope |
|---|---|
| `configs.json` | Individual group/key |
| `custom-module.config.json` | Individual module key |
| `gpt.config.json` | Whole file |
| `toggl.json` | Whole file |

### Apply Order

```text
one reconciliation run
  1. read each known settings file once
  2. apply clean legacy values; collect changed Enable transitions
  3. apply clean custom module sections
  4. apply clean GPT/Toggl dedicated settings
  5. refresh setting descriptors from runtime values
  6. sequentially await collected toggleEnable() transitions
```

This order ensures a newly enabled module starts with current shared and dedicated settings.

### Queue

```text
idle + notification       -> start run
running + notification    -> retain one pending rerun
run completes             -> run once more if pending
run/scope failure         -> preserve old state; contain rejection; continue independent scopes
persistence disposed      -> no new or pending run may apply
```

Logs contain scope identifiers and errors, never settings payloads.

## Complexity Limits

Deliberately excluded:

- No generic synchronization library or reusable watcher abstraction.
- No new module-level synchronized-data lifecycle hook.
- No configuration schema/file migration.
- No interception/replacement of GPT/Toggl/local module save functions.
- No field-level merge within one settings scope.
- No cache/history live import from `onDataChanged()`.
- No live reset when a settings file/section is deleted.
- No forced rerender of already-mounted settings inputs; reopening reflects updated runtime settings.
- No startup-only GPT script scan, dock mutation, or Toggl network refresh during sync.
- No compatibility workaround for SiYuan versions that send storage changes through `reloadPlugins`.
- No change to GPT cache frequency or persistence semantics.

## Verification Matrix

| Scenario | Expected result |
|---|---|
| Sync disabled; GPT/Toggl enabled | Same stored settings, resources, startup extensions/network initialization, and local save behavior as before |
| Sync disabled; GPT/Toggl disabled | Stored settings variables initialize; no feature resources or startup-only effects run |
| Existing caller invokes GPT/Toggl complete `load()` | Existing read + apply + startup behavior remains available |
| Remote `gpt-cache/{id}.json` changes during active chat | Same plugin/chat instance; settings snapshots unchanged; no apply or feature effect |
| Remote clean GPT provider/model change | Runtime settings update; current request continues; next request uses new settings; no script scan |
| Remote clean Toggl settings change | Settings store updates; no immediate account/project/tag fetch |
| Remote clean module Enable change | Shared/dedicated settings apply first; existing `toggleEnable()` transition completes afterward |
| Local unsaved GPT settings + remote GPT settings | Runtime local settings remain; remote settings are not applied |
| Local dirty module A + remote module B section | A remains local; B applies |
| One malformed/failing settings scope | Old state remains for that scope; independent scopes still reconcile |
| Settings file/section deleted remotely | Runtime state remains until normal plugin startup |
| Plugin code synchronized/updated | SiYuan's `reloadPlugins` behavior remains unchanged |
