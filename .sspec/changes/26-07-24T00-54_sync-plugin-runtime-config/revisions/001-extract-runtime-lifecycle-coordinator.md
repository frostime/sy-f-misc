---
revision: 1
date: 2026-07-28T15:18:00
trigger: "discovery"
---

# Extract runtime lifecycle coordinator

## Reason

Post-implementation upstream review of SiYuan v3.7.0 (`27e0051e0d067892e833df1063cb2fb469600e98`) found that initial plugin loading does not serialize storage notifications against asynchronous `onload()`:

- `app/src/plugin/loader.ts` calls `loadPluginJS()` without awaiting it during initial loading.
- `loadPluginJS()` adds the Plugin instance to `app.plugins` before awaiting `plugin.onload()`.
- `reloadPlugin()` finds instances in `app.plugins` and synchronously invokes `onDataChanged()`.
- SiYuan invokes `onunload()` synchronously and cannot await or cancel asynchronous work spawned by `onDataChanged(): void`.

The existing booleans in `FMiscPlugin` partially encode this protocol but allow pending reconciliation after settings initialization and before feature startup settles. The lifecycle rules need one explicit owner and deterministic mock coverage.

## Changes

### Spec Impact

- BC-1/BC-2/BC-7 gain an explicit lifecycle invariant: synchronized storage notifications received before feature startup settles are coalesced and reconciled once only after feature startup settles.
- A storage notification or debounced Enable side effect received after disposal must not start another settings apply or module transition. A transition already started before disposal is not cancellable, but later transitions are skipped.
- Failure of one feature module's aggregate startup/teardown is isolated and logged with the module name; it does not prevent unrelated modules from settling or prevent the runtime lifecycle from reaching its next state.
- BC-4 terminology is corrected. Runtime settings that differ from the last successfully applied storage snapshot are locally authoritative for the current plugin session, regardless of whether an unchanged existing save path has already persisted them. A same-scope remote value may therefore be deferred until runtime converges or the next normal plugin load.
- SiYuan v3.7.0's missing-file `loadData()` result (`""`) is treated as missing storage, preserving normal JSON import behavior and deletion deferral.
- Existing configuration filenames, schemas, migrations, import/apply operations, save operations, and debounce intervals remain unchanged.

### Design Impact

Add `src/runtime-lifecycle.ts` containing `FMiscRuntimeLifecycle`, a focused state machine with states:

```text
created → loading-settings → loading-features → active → disposed
```

The coordinator owns:

- settings-before-features startup ordering;
- coalescing storage notifications before `active`;
- forwarding active notifications to `SettingsPersistence`;
- disposing settings immediately during teardown and waiting for in-progress reconciliation/Enable transitions to drain;
- aborting post-await feature registration, then waiting for aggregate feature startup to settle before scheduling aggregate teardown;
- publishing a process-wide teardown barrier so a replacement plugin generation cannot initialize against module singletons owned by the previous generation;
- containing detached teardown errors because SiYuan does not await `onunload()`.

`FMiscPlugin` creates the coordinator and forwards `onload`, `onDataChanged`, and `onunload`; it no longer owns pending/ready/disposed booleans. `SettingsPersistence` retains defensive disposal checks and tracks started Enable transitions because active work may cross the teardown boundary. `src/func/index.ts` owns per-module aggregate error isolation and passes the startup `AbortSignal` to modules; GPT, Toggl, WebSocket, and HTML Pages check it before post-await resource registration.

The coordinator accepts lifecycle operations through a narrow constructor interface. This keeps the state machine independent of SiYuan UI modules and permits deterministic tests without loading the plugin runtime.

### Task Impact

Add five feedback tasks:

1. Introduce the lifecycle coordinator and lifecycle tests.
2. Replace `FMiscPlugin`'s inline state with callback forwarding.
3. Isolate aggregate module startup/teardown failures.
4. Add persistence disposal and missing-file guards; document session-local precedence.
5. Run complete verification and return the change to REVIEW.
