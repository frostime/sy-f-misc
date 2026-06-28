# Memory: refactor-zotero

**Updated**: 2026-06-28T19:30+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/SiYuanDevelopment/sy-f-misc`
- Branch: `refactor/zotero`
- HEAD: `ba1c0976ae81cd3f4ef37272d5569f4766252e84`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## refactor/zotero
A  .sspec/requests/26-06-28T18-08_refactor-zotero.md
A  .sspec/requests/references/2026-06-28_handover.md
```

## State
<!-- Where we are and what's next — one to three lines.
This is the resume entry point; the first section an agent reads on cold start. -->

Plan phase initialized after user confirmed continuing. `tasks.md` contains six implementation phases. Next step is implementation, starting with Phase 1 config storage safety; do not modify `src/settings/index.ts`.

## Key Files
<!-- Files critical to understanding/continuing this change.
- `path/file` — what it contains, why it matters -->

- `.sspec/changes/26-06-28T18-26_refactor-zotero/spec.md` — final behavior contract and scope after storage-risk correction
- `.sspec/changes/26-06-28T18-26_refactor-zotero/design.md` — final technical design; includes explicit `dump()` fix and migration flow
- `.sspec/tmp/subagents/settings-storage-audit-report.md` — deep audit of plugin storage topology and Zotero migration risks
- `.sspec/tmp/subagents/module-settings-patterns-survey.md` — survey of 14 `declareModuleConfig` modules; identifies explicit `dump()` as minimal safe fix
- `.sspec/requests/references/2026-06-28_handover.md` — prior Zotero Local API + bridge pre-research handover
- `src/func/zotero/config.ts` — target for config migration, explicit `dump()`, connection diagnostics
- `src/func/zotero/zoteroModal.ts` — target for transport refactor away from debug-bridge
- `src/func/zotero/index.ts` — target for migration prompt and removal of `globalThis.ZoteroSDK.executeJSCode`
- `src/external/zotero-bridge/bootstrap.js` — existing bridge prototype with `/f-zotero-ext/api/v1/status` and `/selected`
- `README.md` and `src/func/zotero/zotero-desc.md` — docs that currently mention old debug-bridge flow and must be updated

## Knowledge
<!-- MUST apply write-gate: "If this item were lost, would the next agent make a wrong decision?"
Yes → write it. No → skip.

Target reader: a cold-starting agent that can only see spec + design + tasks + this Knowledge.
Exclude: anything already covered by spec/design/tasks (no restating).
Include: rejected approaches with reasons, implicit constraints, user preferences, API/env traps, insights that shaped design choices.

Format: - [timestamp] [Type] content
Types: Decision | Constraint | Gotcha | Rejected | Insight
  Decision  = directional choice made (with rationale)
  Constraint = hard limit imposed externally or by user
  Gotcha     = trap invisible without reading code/docs
  Rejected   = approach considered and discarded (with why — prevents successor from re-trying)
  Insight    = finding that shaped understanding but is not itself a decision

Project-level discoveries → ALSO append to project.md Notes.
Obsolete items → mark [obsolete: timestamp], never silently delete. -->

- [2026-06-28T18:30+08:00] Decision User confirmed **方案 A / minimal bridge**: bridge only handles UI state/current selected items; data access should prefer official Zotero Local API. Do not move note/data fetching logic into bridge unless later explicitly redesigned.
- [2026-06-28T18:30+08:00] Decision Remove `globalThis.ZoteroSDK.executeJSCode()` directly; user said nobody uses it. Do not keep deprecated compatibility shim.
- [2026-06-28T18:30+08:00] Decision Migration prompt should appear on **first Zotero feature call**, not immediately on plugin load. Settings/help docs should still guide users to the new flow.
- [2026-06-28T18:30+08:00] Decision Old config data should be kept but marked deprecated; do not aggressively delete old `configs.json` data during migration.
- [2026-06-28T18:30+08:00] Decision Bridge extension auto-update is explicitly deferred as a future independent research topic. Record it, but do not implement update logic in this change.
- [2026-06-28T18:35+08:00] Constraint Do **not** modify `src/settings/index.ts` for this change. User rejected touching core settings engine because it would spread risk to unrelated modules.
- [2026-06-28T18:35+08:00] Rejected Moving all Zotero config, including `zoteroDir`, into `custom-module.config.json` was rejected after audit: `zoteroDir` is device-specific and must not become synced single-device data.
- [2026-06-28T18:35+08:00] Rejected Special-casing Zotero in `settings/index.ts` was rejected. Safer fix is a Zotero-local explicit `dump()` method.
- [2026-06-28T18:40+08:00] Gotcha Zotero currently has no explicit `dump()`. Because `settings/index.ts` falls back to iterating `items[].get()`, `zoteroDir` current-device value is written to `custom-module.config.json`, creating a cross-device sync hazard. The minimal safe fix is `dump: () => ({ zoteroPassword, _migrated })` excluding `zoteroDir`.
- [2026-06-28T18:40+08:00] Insight `zoteroDir.config.json` is the intended Source of Truth for Zotero data directory and is keyed by `window.siyuan.config.system.id`. It should remain independently managed via `plugin.loadData/saveData('zoteroDir.config.json')`.
- [2026-06-28T18:40+08:00] Insight `configs.json` `Misc.zoteroPassword` is zombie/legacy data: settings UI entries are commented out, but old users may still have data. Migration should read `plugin.getConfig('Misc', 'zoteroPassword')` if present.
- [2026-06-28T18:40+08:00] Gotcha `declareModuleConfig.load()` can be async but core settings loader does not await it. Since user forbids changing settings engine, avoid relying on globally fixing this. For Zotero, keep async loading behavior local and ensure runtime paths tolerate missing/late `zoteroDir` if necessary.
- [2026-06-28T18:45+08:00] Insight Module settings survey found explicit `dump()` is normal project pattern (`doc-context`, `insert-time`, `asset-file`, etc.). Zotero should follow this pattern rather than using `createSettingAdapter` for `zoteroDir`.
- [2026-06-28T18:45+08:00] Gotcha `createSettingAdapter` with `devicewise: true` stores `{deviceId: value}` inside `custom-module.config.json`, so it is not suitable if the requirement is to avoid syncing `zoteroDir` through that file.
- [2026-06-28T18:50+08:00] Decision Keep bridge endpoint prefix `/f-zotero-ext/api/v1/...`; this was previously confirmed in the handover. Do not rename to `/sy-f-misc/...`.
- [2026-06-28T18:50+08:00] Gotcha Existing bridge prototype required `manifest.json` `update_url` for compatibility in the user's environment, even though it is currently a placeholder. Do not remove it based on external generic advice.
- [2026-06-28T18:50+08:00] Insight Zotero Local API facts from skill/handover: base URL `http://127.0.0.1:23119/api/`; use `/api/users/0/...`; reads do not require API key; Local API is read-only; current selected items are not exposed by official Local API and require bridge extension.

## Milestones
<!-- MUST append one line per session. Pure facts; new entries appended at the end.
CLI treats the last valid bullet as the latest milestone.
- [ISO timestamp] one-sentence summary -->

- [2026-06-28T18:26+08:00] Created change `26-06-28T18-26_refactor-zotero` from request and entered Design phase.
- [2026-06-28T19:20+08:00] Completed design revision after storage audits: final plan uses bridge + Local API, Zotero-local explicit `dump()` fix, preserves `zoteroDir.config.json`, and avoids modifying core settings engine.
- [2026-06-28T19:30+08:00] Committed design/request artifacts, then initialized `tasks.md` with six implementation phases and validation checks.
