---
title: Handover — sy-f-misc HSPA extraction / siyuan-hspa package
created: 2026-07-04T02:01:34+08:00
---

# Current Status

Active work: extraction of the reusable HSPA idea from `sy-f-misc` into a sibling package `../siyuan-hspa`.

Status:

- `sy-f-misc` branch: `feat/extract-siyuan-hspa`
- sspec change: `.sspec/changes/26-07-04T00-21_extract-siyuan-hspa/`
- sspec status: `REVIEW`, progress `42/42`
- new package repo: `H:/SrcCode/SiYuanDevelopment/siyuan-hspa`
- latest package commit: `6fe4359 📝 docs: make hspa skill the primary guide`
- current `sy-f-misc` branch HEAD records revision 001 in sspec.
- current working trees were clean when this handover was written.

Immediate user-facing unresolved point:

- User noticed that the proposed `siyuan-hspa init/doctor` CLI was only discussed as a behavior spec and **has not been implemented**.
- If continuing, likely next work is revision 002 for the CLI.

# Task Context

Original goal: make the HSPA pattern from `sy-f-misc` reusable as an independent SiYuan-specific package for future plugin projects, without migrating or refactoring current `sy-f-misc` internal HSPA usage.

Binding constraints from user:

- Do **not** migrate `sy-f-misc/src/func/html-pages/*` or its callers.
- New package is `@frostime/siyuan-hspa`.
- Runtime dependency boundary: depend on `siyuan` as peer/dev dependency; avoid `@frostime/siyuan-plugin-kits` and `sy-f-misc` internals.
- Package is SiYuan-specific, not a generic browser iframe framework.
- No Vue asset; ship `hspa-mini.css` and Alpine only.
- No page storage helpers in preset SDK (`loadConfig`, `saveConfig`, `loadAsset`, `saveAsset`). HSPA package is for plugin UI, not standalone mini-app persistence.
- No `hspa-client.js`.
- No HTML transform/build magic.
- Documentation strategy was revised to **SKILL-first**: remove `docs/`; make `skill/hspa/SKILL.md` the primary agent-facing usage guide.
- Lute parity difference with current `sy-f-misc` HSPA was explicitly accepted by user; do not spend effort on it unless user reopens it.

# Session Trajectory

1. Clarified extraction scope: independent sibling package, no local migration.
2. Created sspec change `26-07-04T00-21_extract-siyuan-hspa` and branch `feat/extract-siyuan-hspa`.
3. Implemented `../siyuan-hspa` package with runtime, assets, examples, mock plugin, and SKILL.
4. Ran subagent reviews:
   - parity with existing fmisc HSPA mechanisms;
   - third-party developer usability;
   - later, SKILL quality review.
5. Fixed review issues:
   - mock type-check;
   - tab handle readiness and caching;
   - `createSiyuanIframePage`;
   - no-op API cleanup;
   - example CSS class corrections;
   - asset copy behavior;
   - SKILL rewrite and docs removal.
6. User asked about a proposed CLI; clarified it was not implemented.
7. User requested this handover before compaction.

# Completed Work

## In `../siyuan-hspa`

Implemented package structure:

```text
../siyuan-hspa/
├── src/
│   ├── index.ts
│   ├── runtime.ts
│   ├── siyuan.ts
│   ├── assets.ts
│   ├── vite.ts
│   └── types.ts
├── assets/hspa/
│   ├── styles/hspa-mini.css
│   └── scripts/alpine.min.js
├── examples/
│   ├── vanilla-page.html
│   ├── alpine-page.html
│   └── mock-plugin/
├── skill/hspa/SKILL.md
├── README.md
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── pnpm-workspace.yaml
```

Key public APIs:

```ts
createIframePage(container, config)              // low-level, no SiYuan preset factory
createSiyuanIframePage(plugin, container, config)
openIframeTab(plugin, options)
openIframeDialog(plugin, options)
buildPresetSdk(plugin)
pluginAssetUrl(plugin, path)
hspaPageUrl(plugin, filename)
hspaStaticCopyTargets(options?)                  // from @frostime/siyuan-hspa/vite
```

Assets:

- `assets/hspa/styles/hspa-mini.css`
- `assets/hspa/scripts/alpine.min.js`

Examples:

- `examples/vanilla-page.html`
- `examples/alpine-page.html`
- `examples/mock-plugin/`

Primary guide:

- `skill/hspa/SKILL.md`

Removed:

- `docs/` tree was deleted by revision 001.

## In `sy-f-misc`

Committed sspec records only; no `sy-f-misc` source migration.

Important local note:

- `packages/siyuan-hspa -> ../siyuan-hspa` exists as a local Windows junction but is ignored via `.gitignore` to avoid committing an embedded git repo/gitlink.

# Decisions

- `@frostime/siyuan-hspa` is a separate package/repo in `../siyuan-hspa`.
- Keep `sy-f-misc` current HSPA implementation untouched.
- `siyuan` is peer dependency and dev dependency.
- Use `tsup` build.
- Use Vite copy helper rather than auto-modifying host Vite config:

  ```ts
  hspaStaticCopyTargets()
  ```

- Default copied asset layout:

  ```text
  dist/hspa/styles/hspa-mini.css
  dist/hspa/scripts/alpine.min.js
  ```

- HTML pages copied to `dist/pages/` should use:

  ```html
  ../hspa/styles/hspa-mini.css
  ../hspa/scripts/alpine.min.js
  ```

- `customSdk` is flat-merged into `window.pluginSdk`; downstream code must call `pluginSdk.foo()`, not `pluginSdk.customSdk.foo()`.
- `createIframePage` is low-level; use `createSiyuanIframePage` / `openIframeTab` / `openIframeDialog` for SiYuan preset SDK.
- SKILL is now the main documentation artifact for agents; README is only orientation.
- CLI `siyuan-hspa init/doctor` is only a proposed behavior spec so far. It is not implemented.

# Evidence and Validation

Verified commands that passed after latest package revision:

```bash
cd ../siyuan-hspa
python /c/Users/EEG/.pi/agent/skills/@harness/skill-creator/scripts/quick_validate.py ../siyuan-hspa/skill/hspa
pnpm run type-check
pnpm build
pnpm pack --dry-run
cd examples/mock-plugin
pnpm exec tsc --noEmit --pretty false
pnpm build
```

`pnpm pack --dry-run` after revision 001 included:

```text
dist
assets
examples
skill
README.md
package.json
```

and no `docs/` directory.

Subagent review findings already addressed:

- mock plugin type-check failure from invalid `ignoreDeprecations`;
- direct `createIframePage` preset SDK ambiguity;
- early `dispatchEvent` no-op risk;
- existing tab handle returning dead placeholder;
- no-op `requestReturnRaw` option;
- example class `muted` / `btn primary` / `row` mismatches with `hspa-mini.css`;
- docs-vs-SKILL duplication;
- SKILL Vite snippet missing page HTML copy;
- `customCss` not explained;
- `onLoadEvents` listener timing.

Known accepted non-fix:

- `pluginSdk.lute` is less configured than fmisc kits `getLute()`; user said not to handle Lute.

# Risks and Pitfalls

- Do not run root package build and mock plugin build in parallel. Root `tsup` cleans `../siyuan-hspa/dist`; mock plugin resolves workspace package through `dist`, so parallel builds can fail with package entry resolution errors. Run root build first, then mock build.
- Do not commit `packages/siyuan-hspa` as a gitlink/submodule accidentally. It is a local junction and should stay ignored.
- Do not reintroduce `docs/` unless user changes the SKILL-first decision.
- Do not add CLI implementation without updating sspec via revision 002; CLI was not part of implemented package yet.
- If changing hspa-mini class examples, verify actual classes in `../siyuan-hspa/assets/hspa/styles/hspa-mini.css`.
- If copying mock plugin outside the repo, replace `workspace:*` dependency with the published package version range.

# Next Actions

Likely next step if user continues the CLI idea:

1. Create sspec revision 002 for CLI `init/doctor`.
2. Scope CLI around current SKILL-first decision:
   - `init` installs/copies `.agents/skills/siyuan-hspa/SKILL.md` and optionally example HTML.
   - `init` should not generate `docs/`.
   - `doctor` checks Vite copy, HTML authoring rules, SKILL presence, and common mistakes.
   - CLI must not auto-modify `vite.config.ts`, `package.json`, plugin entry code, or global agent directories unless user explicitly expands scope.
3. Implement likely files:
   - `../siyuan-hspa/src/cli.ts`
   - `../siyuan-hspa/package.json` (`bin`, `exports`, `files` if needed)
   - `../siyuan-hspa/tsup.config.ts` entry `cli`
   - update `skill/hspa/SKILL.md` with CLI use once implemented
4. Validate:
   - package type-check/build/pack dry-run;
   - CLI `--help`, `init --dry-run`, `doctor` on mock or temp project;
   - mock plugin type-check/build.
5. Commit package repo and sy-f-misc sspec records.

If user does not want CLI now:

1. Ask whether the current change can be marked DONE.
2. If yes, update sspec status `REVIEW → DONE`, update memory, commit.

# Relevant Files and References

In `sy-f-misc`:

- `.sspec/changes/26-07-04T00-21_extract-siyuan-hspa/spec.md` — original behavior contracts and scope.
- `.sspec/changes/26-07-04T00-21_extract-siyuan-hspa/design.md` — original design; note revision 001 supersedes docs layout.
- `.sspec/changes/26-07-04T00-21_extract-siyuan-hspa/tasks.md` — completed tasks and feedback tasks.
- `.sspec/changes/26-07-04T00-21_extract-siyuan-hspa/memory.md` — compact state and decisions.
- `.sspec/changes/26-07-04T00-21_extract-siyuan-hspa/revisions/001-skill-first-agent-docs.md` — SKILL-first revision.
- `src/func/html-pages/core.ts` — proven fmisc HSPA reference implementation; use only for comparison, not migration.
- `.agents/skills/hspa/SKILL.md` — original sy-f-misc local HSPA skill used as inspiration.

In `../siyuan-hspa`:

- `skill/hspa/SKILL.md` — primary guide for agents.
- `src/runtime.ts` — iframe creation, SDK injection, CSS injection, events.
- `src/siyuan.ts` — SiYuan wrappers, preset SDK, tab/dialog handling.
- `src/vite.ts` — `hspaStaticCopyTargets()`.
- `assets/hspa/styles/hspa-mini.css` — actual CSS class source of truth.
- `examples/mock-plugin/` — runnable consumer example.
- `package.json` — exports/files/peer deps.

# Task Ledger

| Task | Status | Current relevance | Next action |
|---|---|---|---|
| Extract HSPA package | completed | package exists and builds | review/accept or continue CLI follow-up |
| Subagent parity/usability review | completed | findings addressed except Lute by user choice | no action |
| SKILL-first revision | completed | docs removed, SKILL primary | no action unless user requests edits |
| CLI `init/doctor` | paused/proposed | behavior spec discussed, not implemented | create revision 002 if user confirms |
