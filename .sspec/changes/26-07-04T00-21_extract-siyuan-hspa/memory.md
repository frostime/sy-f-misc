# Memory: extract-siyuan-hspa

**Updated**: 2026-07-04T02:05+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/SiYuanDevelopment/sy-f-misc`
- Branch: `main`
- HEAD: `296e2291440daeb70aeac9e026e03b394412289e`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
```

## State
<!-- Where we are and what's next — one to three lines.
This is the resume entry point; the first section an agent reads on cold start. -->

Review phase. Implementation complete with revision 001. New package repo `../siyuan-hspa` has latest commit `6fe4359`; current sy-f-misc branch HEAD records revision 001.

## Key Files
<!-- Files critical to understanding/continuing this change.
- `path/file` — what it contains, why it matters -->

- `.sspec/changes/26-07-04T00-21_extract-siyuan-hspa/spec.md` — approved/intended behavior contracts and scope for the new package.
- `.sspec/changes/26-07-04T00-21_extract-siyuan-hspa/design.md` — target package layout, public API, runtime flow, preset SDK, asset copy contract, HTML authoring contract, mock plugin shape, and SKILL contract.
- `src/func/html-pages/core.ts` — current sy-f-misc HSPA runtime used as source inspiration only; do not migrate sy-f-misc internals in this change.
- `public/styles/hspa-mini.css` — source CSS asset to package.
- `public/scripts/alpine.min.js` — source Alpine vendor asset to package.
- `.agents/skills/hspa/SKILL.md` and `.agents/skills/hspa/references/*` — current HSPA agent guidance and references to adapt into package SKILL/docs.

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

- [2026-07-04T00:40+08:00] [Constraint] User explicitly does not want to migrate existing sy-f-misc HSPA code or internal callers; the new package is for reuse in future plugins.
- [2026-07-04T00:40+08:00] [Decision] Package name is `@frostime/siyuan-hspa`; user corrected the earlier typo-like spelling.
- [2026-07-04T00:40+08:00] [Constraint] New package should depend only on `siyuan` at runtime level; `siyuan` must be peer dependency plus dev dependency because it supplies plugin interfaces/types.
- [2026-07-04T00:40+08:00] [Decision] Use `tsup` for the library build.
- [2026-07-04T00:40+08:00] [Decision] Assets include `hspa-mini.css` and `alpine.min.js`; Vue is intentionally excluded.
- [2026-07-04T00:40+08:00] [Rejected] Do not add `hspa-client.js`; the hidden assumptions around extra script loading/order/API value are not justified for first release.
- [2026-07-04T00:40+08:00] [Rejected] Do not provide page storage helpers; package role is iframe UI, not standalone mini-app persistence.
- [2026-07-04T00:40+08:00] [Decision] Static asset use is explicit: package provides Vite copy targets, developers add them to host Vite config, HTML links `../hspa/...`.
- [2026-07-04T00:40+08:00] [Decision] Include `skill/hspa/SKILL.md` in source and npm files; docs should link to it so GitHub browsing and agent loading both work.
- [2026-07-04T01:22+08:00] [Insight] `pnpm` treats the nested mock plugin as part of the parent package unless a workspace is declared; `pnpm-workspace.yaml` is required for local mock build with `@frostime/siyuan-hspa: workspace:*`.
- [2026-07-04T01:22+08:00] [Gotcha] `vite-plugin-static-copy` with `assets/hspa/**/*` created both flattened files and nested files; `hspaStaticCopyTargets()` now returns separate `styles/*` and `scripts/*` targets to preserve only `hspa/styles` and `hspa/scripts`.
- [2026-07-04T01:45+08:00] [Decision] Lute parity difference with fmisc is intentionally left unchanged per user instruction.
- [2026-07-04T01:45+08:00] [Insight] Third-party alpha fixes added: mock type-check, ready dispatch warning, tab handle cache, `createSiyuanIframePage`, removal of unused `requestReturnRaw`, docs/example corrections.
- [2026-07-04T02:05+08:00] [Decision] Package guidance is now SKILL-first: `docs/` removed, README minimized, and `skill/hspa/SKILL.md` is the primary agent-facing usage guide.
- [2026-07-04T02:05+08:00] [Gotcha] Avoid parallel root package build and mock plugin build: root `tsup` cleans `dist`, and mock plugin resolves the workspace package through `dist`; run root build before mock build.

## Milestones
<!-- MUST append one line per session. Pure facts; new entries appended at the end.
CLI treats the last valid bullet as the latest milestone.
- [ISO timestamp] one-sentence summary -->

- [2026-07-04T00:40+08:00] Created sspec change, created branch `feat/extract-siyuan-hspa`, clarified package boundaries, and filled `spec.md`/`design.md` for user alignment.
- [2026-07-04T01:22+08:00] Implemented package, docs, assets, mock plugin, verification, package repo checkpoint commit `223bf65`, and sy-f-misc checkpoint commit at current branch HEAD.
- [2026-07-04T01:45+08:00] Applied subagent review fixes, reran verification, and committed package fix `2e7620d`.
- [2026-07-04T02:05+08:00] Applied revision 001: removed docs, rewrote/validated SKILL, fixed SKILL review warnings, reran verification, and committed package update `6fe4359`.
