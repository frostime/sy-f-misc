# Memory: sync-plugin-runtime-config

**Updated**: 2026-07-26T02:27+08:00

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

Implementation complete on `feat/sync-plugin-runtime-config`; change status is `REVIEW` and all 19 Plan tasks are complete. Agent-side type-check, production build, diff/doc checks, LSP diagnostics, and a temporary mocked reconciliation harness passed. Two-device SiYuan user checks from `tasks.md` remain pending; do not mark the change DONE until user acceptance.

## Key Files

- `spec.md` - Confirmed problem boundary, behavior contracts, implementation labels, and estimated scope.
- `design.md` - Proposed interfaces, snapshot decisions, apply ordering, module-specific effects, and verification matrix.
- `tmp/handover_sync-plugin-restart.md` - Root-cause investigation and upstream SiYuan references.
- `src/index.ts` - `FMiscPlugin`; forwards synchronous `onDataChanged()` notifications into settings persistence without calling the restarting base implementation.
- `src/settings/index.ts` - Thin settings declaration/UI assembly layer.
- `src/settings/persistence.ts` - Settings initialization, snapshots, dirty decisions, reconciliation queue, apply ordering, and error isolation.
- `src/func/index.ts` - Awaitable aggregate module lifecycle and single-module Enable transitions.
- `src/func/gpt/model/storage.ts` - GPT settings apply and startup extensions decomposed behind complete load/save compatibility wrappers.
- `src/func/toggl/state/config.ts` - Toggl settings apply and account metadata loading decomposed behind complete load/save compatibility wrappers.

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
- [2026-07-26T02:27+08:00] [Implementation] `SettingsPersistence` now owns initialization and synchronized reconciliation for legacy, shared module, GPT, and Toggl settings; feature startup effects remain in module lifecycles.
- [2026-07-26T02:27+08:00] [Verification] `pnpm run type-check`, `pnpm run build:publish`, `git diff --check`, spec-doc checks, and LSP diagnostics for changed core files passed. `src/index.ts` retains one pre-existing unused `showMessage` import hint.
- [2026-07-26T02:27+08:00] [Verification] A temporary, untracked mock harness passed clean apply ordering, local-dirty preservation, cross-module isolation, already-current snapshots, deletion deferral, scope failure isolation, and notification coalescing.
- [2026-07-26T02:27+08:00] [Pending] Two-device SiYuan checks in `tasks.md` are user-run acceptance steps and have not been executed by the agent.

## Milestones

- [2026-07-24T00:55+08:00] Clarification completed and initial Design artifacts drafted; waiting at the required Design gate.
- [2026-07-24T01:26+08:00] Revised Design to preserve old import/export behavior inside a settings-owned persistence lifecycle; awaiting renewed Design approval.
- [2026-07-24T01:33+08:00] User paused the change before approving the revised Design gate; all current change artifacts were staged without a commit.
- [2026-07-26T01:28+08:00] User approved the Design direction; implementation Plan drafted and awaiting review before checkpoint commit.
- [2026-07-26T01:33+08:00] Plan approved; change entered DOING and checkpoint commit `1ca8c58` recorded the sspec artifacts.
- [2026-07-26T01:44+08:00] Phase 1 paused for context compaction after creating untracked `src/settings/persistence.ts`; initial type-check passed, integration tasks remained open.
- [2026-07-26T02:27+08:00] All implementation and documentation tasks completed; change entered REVIEW with user-run SiYuan acceptance checks pending.
