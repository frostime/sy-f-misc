# Memory: sync-plugin-runtime-config

**Updated**: 2026-07-26T01:33+08:00

## Git Baseline (Immutable)

- Captured: before change file creation
- Repository: `H:/SrcCode/SiYuanDevelopment/sy-f-misc`
- Branch: `main`
- HEAD: `77b41ba790955261b2f9f03968adc5bfa03343f1`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
```

## State

Design and Plan approved on `feat/sync-plugin-runtime-config`; status is `DOING`. Create the requested sspec checkpoint commit, then implement Phase 1 from `tasks.md` with per-task progress updates and phase verification.

## Key Files

- `spec.md` - Confirmed problem boundary, behavior contracts, implementation labels, and estimated scope.
- `design.md` - Proposed interfaces, snapshot decisions, apply ordering, module-specific effects, and verification matrix.
- `tmp/handover_sync-plugin-restart.md` - Root-cause investigation and upstream SiYuan references.
- `src/index.ts` - `FMiscPlugin`; currently inherits the restarting `onDataChanged()` behavior.
- `src/settings/index.ts` - Current legacy/module config initialization and debounced persistence.
- `src/func/index.ts` - Current synchronous-looking module registry; async module functions are not awaited.
- `src/func/gpt/model/storage.ts` - GPT storage apply currently combines runtime signals with heavyweight startup effects.
- `src/func/toggl/state/config.ts` - Toggl config load currently combines runtime state with network refresh.

## Knowledge

- [2026-07-24T00:55+08:00] [Insight] In SiYuan 3.7.0, sync merge code in `kernel/model/repository.go` collects changed `/storage/petal/<plugin>/` paths into `dataChangePlugins`; `app/src/plugin/loader.ts` calls `item.onDataChanged()` without a path argument. Local plugin `saveData()` is not itself this frontend callback path.
- [2026-07-24T00:55+08:00] [Gotcha] SiYuan calls `onDataChanged()` without awaiting its return value, and its surrounding `try/catch` catches only synchronous throws. The override must remain `void` and contain asynchronous rejections itself.
- [2026-07-24T00:55+08:00] [Rejected] A no-op `onDataChanged()` alone prevents restart but leaves synchronized runtime settings stale for the process lifetime; it is only a safety base, not the accepted final behavior.
- [2026-07-24T00:55+08:00] [Rejected] Unconditionally calling `loadConfigs()` on every callback can overwrite a 10-second debounced local edit and changes Enable values without coordinating actual module state or setting descriptors.
- [2026-07-24T00:55+08:00] [Decision] The user selected local unsaved state over synchronized disk state on same-scope conflicts, immediate reuse of `toggleEnable()` for clean remote Enable changes, and coverage of legacy, declared module, GPT, and Toggl configuration.
- [2026-07-24T00:55+08:00] [Constraint] The reported environment is SiYuan 3.7.0. `plugin.json` still declares minimum SiYuan 3.1.20; older versions that bypass `dataChangePlugins` cannot be fixed through this callback override.
- [2026-07-24T00:55+08:00] [Gotcha] Zotero's declared module-config loader is memoized through `configLoadPromise`, so it cannot currently reapply synchronized shared values; device-local directory loading must remain separate.
- [2026-07-24T01:26+08:00] [Decision] Rejected a generic `src/libs/synced-config.ts` and distributed module sync hooks. The accepted architecture concentrates initialization/reconciliation in `src/settings/persistence.ts`; feature modules provide only dedicated-file import/export adapters.
- [2026-07-24T01:26+08:00] [Constraint] Existing legacy, module, GPT, and Toggl complete import/export entry points and file formats must remain compatible. New startup/sync paths reuse extracted apply operations; they do not replace old serializers or startup effects.
- [2026-07-24T01:26+08:00] [Decision] Persistent-settings lifecycle is separate from feature `load/unload`: settings initialize before features, sync reuses only settings apply, and module lifecycle retains startup/teardown ownership.
- [2026-07-24T01:26+08:00] [Decision] Work continues on branch `feat/sync-plugin-runtime-config` as requested by the user.
- [2026-07-26T01:28+08:00] [Decision] User approved the revised Design direction and requested a Plan review before checkpoint commit and implementation.
- [2026-07-26T01:33+08:00] [Decision] User approved the 4-phase, 19-task Plan and authorized checkpoint commit followed by implementation.

## Milestones

- [2026-07-24T00:55+08:00] Clarification completed and initial Design artifacts drafted; waiting at the required Design gate.
- [2026-07-24T01:26+08:00] Revised Design to preserve old import/export behavior inside a settings-owned persistence lifecycle; awaiting renewed Design approval.
- [2026-07-24T01:33+08:00] User paused the change before approving the revised Design gate; all current change artifacts were staged without a commit.
- [2026-07-26T01:28+08:00] User approved the Design direction; implementation Plan drafted and awaiting review before checkpoint commit.
- [2026-07-26T01:33+08:00] Plan approved; change entered DOING and is ready for the requested checkpoint commit.
