---
change: "sync-plugin-runtime-config"
updated: "2026-07-26T01:28+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Extract Existing Settings Persistence ⏳

- [ ] Add the internal `SettingsPersistence` lifecycle shell and move the existing legacy/module initialization and debounced-save ownership into it, preserving the `refactor(settings)` and `feat(settings-persistence)` contracts. `src/settings/persistence.ts`
- [ ] Reduce `initSetting()` to declaration collection, persistence initialization, settings-dialog assembly, and local event delegation without changing setting descriptors or UI behavior. `src/settings/index.ts`
- [ ] Expand module lifecycle types to truthfully allow existing async implementations, without adding a synchronized-data hook. `src/func/types.d.ts`
- [ ] Make aggregate module startup/teardown and `toggleEnable()` await existing module transitions while preserving registration order and current enable decisions. `src/func/index.ts`
- [ ] Store and dispose the initialized persistence lifecycle around feature startup/teardown, retaining `loadConfigs()` / `saveConfigs()` as compatibility entry points. `src/index.ts`

**Verification**:
- Agent: `pnpm run type-check` exits 0 after the extraction.
- Agent: `pnpm run build:publish` exits 0 and produces the normal plugin bundle.
- Agent: review the Phase 1 diff to confirm no storage file name/schema/default/debounce interval changed.

**User Check**:
1. BC-6: With SiYuan sync disabled, open fmisc settings, change a legacy setting and a declared module setting, restart the plugin, and confirm both persist exactly as before.
2. BC-6: Toggle an existing module locally and confirm its current load/unload behavior is unchanged.

### Phase 2: Add Dedicated Settings Adapters ⏳

- [ ] Add the optional `declareDedicatedSettingsStorage` type and collect dedicated-file declarations inside `SettingsPersistence`. `src/func/types.d.ts`, `src/settings/persistence.ts`
- [ ] Split GPT settings import from startup extensions, expose the dedicated settings declaration, retain the complete storage `load()` / `save()` wrappers, and make normal module startup consume preloaded settings. `src/func/gpt/model/storage.ts`, `src/func/gpt/index.ts`
- [ ] Split Toggl settings import from account metadata/network initialization, expose the dedicated settings declaration, retain the complete config `load()` / `save()` wrappers, and make normal module startup consume preloaded settings. `src/func/toggl/state/config.ts`, `src/func/toggl/index.ts`
- [ ] Separate repeatable shared Zotero settings application from one-time device-directory initialization while preserving existing compatibility callers. `src/func/zotero/config.ts`
- [ ] Initialize dedicated settings after shared module settings and before feature modules start; establish initial runtime snapshots without running feature effects. `src/settings/persistence.ts`, `src/index.ts`

**Verification**:
- Agent: `pnpm run type-check` exits 0 with the new declarations and decomposed loaders.
- Agent: `pnpm run build:publish` exits 0.
- Agent: trace GPT/Toggl complete compatibility wrappers and confirm each still composes read → apply → prior startup/network operation, while existing save payload functions remain unchanged.

**User Check**:
1. BC-2, BC-6: With sync disabled and GPT/Toggl enabled, restart fmisc and confirm stored settings plus existing startup behavior are unchanged.
2. BC-2: Disable GPT/Toggl, restart fmisc, open their settings panels, and confirm persisted values are shown without feature resources or startup-only effects being activated.

### Phase 3: Reconcile Settings After SiYuan Sync ⏳

- [ ] Add private per-scope disk/applied snapshots and the decision paths defined in Design for unchanged, already-current, local-dirty, applicable, and deleted settings. `src/settings/persistence.ts`
- [ ] Reconcile legacy keys, shared module sections, and dedicated GPT/Toggl files in the specified order; collect and sequentially await clean Enable transitions only after all settings imports finish. `src/settings/persistence.ts`, `src/func/index.ts`
- [ ] Add the coalescing reconciliation queue, disposal guard, per-scope failure isolation, and value-redacted diagnostics. `src/settings/persistence.ts`
- [ ] Override `FMiscPlugin.onDataChanged(): void`, forward notifications without calling the base handler, and retain one notification that arrives before settings initialization completes. `src/index.ts`
- [ ] Audit all declared module-config import functions for repeatability and make only directly required compatibility adaptations; leave unrelated refactors untouched. `src/func/**`

**Verification**:
- Agent: `pnpm run type-check` exits 0.
- Agent: `pnpm run build:publish` exits 0.
- Agent: static audit confirms `onDataChanged()` has no async return/rejection, no config values are logged, and cache/history paths are never scanned by reconciliation.
- Agent: inspect decision branches against the Design verification matrix, including one dirty module section not blocking another clean section.

**User Check**:
1. BC-1, BC-3: During an active GPT conversation, sync a remote `gpt-cache/{id}.json`; confirm the chat UI and plugin instance remain alive and no fmisc unload/load occurs.
2. BC-3, BC-5: Change a GPT provider/model remotely with no local edit; confirm runtime settings update for the next request without script scanning or interruption of an in-flight request.
3. BC-4: Keep an unsaved local GPT setting while a conflicting remote GPT config arrives; confirm the local runtime value remains.
4. BC-3: Keep module A locally dirty while remotely changing module B in `custom-module.config.json`; confirm only B updates.
5. BC-3: Remotely change an Enable key; confirm shared/dedicated settings update first and the existing module transition then runs once.
6. BC-7: Introduce one malformed/failing settings scope in a test workspace; confirm its previous runtime state remains and independent scopes still reconcile.

### Phase 4: Documentation and Final Quality Gates ⏳

- [ ] Document `SettingsPersistence`, declaration types, initialization order, compatibility wrappers, synchronized reconciliation, and ownership boundaries. `.sspec/spec-docs/func-module-architecture.md`
- [ ] Document GPT's compatible complete-loader decomposition and sync-time exclusion of startup extensions. `.sspec/spec-docs/gpt-module-architecture-overview.md`
- [ ] Review the complete change for interface depth, naming, lifecycle ownership, stale comments/imports, and accidental storage behavior changes; fix only issues introduced by this change. `src/**`
- [ ] Run final static/build checks and update change memory with implementation results, verification gaps, and user-run SiYuan checks still pending. `.sspec/changes/26-07-24T00-54_sync-plugin-runtime-config/memory.md`

**Verification**:
- Agent: `pnpm run type-check` exits 0.
- Agent: `pnpm run build:publish` exits 0.
- Agent: `git diff --check` exits 0.
- Agent: `git diff --stat` and targeted review show changes remain within the approved spec/design scope.
- Agent: spec-doc references and project Spec-Docs Index remain consistent; no GPT chat-persistence contract changed.

**User Check**:
1. BC-1 through BC-7: Run the Phase 1-3 SiYuan checks on two synchronized devices and report any mismatch before Review acceptance.
2. BC-6: Confirm normal local settings import/export and module startup still behave as before when synchronization is disabled.

---

## Progress

**Overall**: 0/19 (0%)

| Phase | Progress | Status |
|---|---:|---|
| Phase 1: Extract Existing Settings Persistence | 0/5 | ⏳ |
| Phase 2: Add Dedicated Settings Adapters | 0/5 | ⏳ |
| Phase 3: Reconcile Settings After SiYuan Sync | 0/5 | ⏳ |
| Phase 4: Documentation and Final Quality Gates | 0/4 | ⏳ |

**Recent**:
- 2026-07-26: Design approved; initialized the implementation Plan for review.
