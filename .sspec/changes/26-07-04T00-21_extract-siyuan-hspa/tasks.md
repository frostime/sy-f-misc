---
change: "extract-siyuan-hspa"
updated: "2026-07-04T00:45+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Package scaffold + junction ✅
- [x] Create `../siyuan-hspa/package.json` for `build(package): Create @frostime/siyuan-hspa package`.
- [x] Create `../siyuan-hspa/tsconfig.json` and `../siyuan-hspa/tsup.config.ts`.
- [x] Create `packages/siyuan-hspa` Windows junction pointing to `../siyuan-hspa`.
- [x] Create source directory skeleton `../siyuan-hspa/src/`, `assets/`, `docs/`, `examples/`, `skill/`.
**Verification**:
- Agent: `test -d ../siyuan-hspa && test -e packages/siyuan-hspa` succeeds.
- Agent: `node -e "const p=require('../siyuan-hspa/package.json'); if(p.name !== '@frostime/siyuan-hspa') process.exit(1)"` succeeds.

### Phase 2: Runtime + SiYuan API ✅
- [x] Create `../siyuan-hspa/src/types.ts` with public types from `design.md`.
- [x] Create `../siyuan-hspa/src/runtime.ts` implementing `feat(runtime): Implement iframe runtime and SiYuan wrappers` core iframe behavior.
- [x] Create `../siyuan-hspa/src/siyuan.ts` implementing `openIframeTab`, `openIframeDialog`, and `buildPresetSdk`.
- [x] Create `../siyuan-hspa/src/assets.ts` implementing `pluginAssetUrl` and `hspaPageUrl`.
- [x] Create `../siyuan-hspa/src/index.ts` public exports.
**Verification**:
- Agent: `cd ../siyuan-hspa && pnpm exec tsc --noEmit` succeeds.
- Agent: inspect generated declarations after build in Phase 6 include public functions from `design.md`.

### Phase 3: Assets + Vite copy helper ✅
- [x] Copy `public/styles/hspa-mini.css` to `../siyuan-hspa/assets/hspa/styles/hspa-mini.css`.
- [x] Copy `public/scripts/alpine.min.js` to `../siyuan-hspa/assets/hspa/scripts/alpine.min.js`.
- [x] Create `../siyuan-hspa/src/vite.ts` implementing `feat(assets): Package HSPA static assets and Vite copy targets`.
**Verification**:
- Agent: `test -f ../siyuan-hspa/assets/hspa/styles/hspa-mini.css && test -f ../siyuan-hspa/assets/hspa/scripts/alpine.min.js` succeeds.
- Agent: `cd ../siyuan-hspa && pnpm exec tsc --noEmit` succeeds.

### Phase 4: Docs + SKILL ✅
- [x] Create `../siyuan-hspa/README.md` covering install, API quickstart, asset copy, HTML rules, and mock example.
- [x] Create `../siyuan-hspa/docs/api.md` from public API contract.
- [x] Create `../siyuan-hspa/docs/html-authoring.md` from HTML authoring contract.
- [x] Create `../siyuan-hspa/docs/assets.md` from asset copy contract.
- [x] Create `../siyuan-hspa/skill/hspa/SKILL.md` and `../siyuan-hspa/docs/skill.md`.
- [x] Create `../siyuan-hspa/examples/vanilla-page.html` and `../siyuan-hspa/examples/alpine-page.html`.
**Verification**:
- Agent: `rg -n "pluginSdkReady|hspaStaticCopyTargets|customSdk|../hspa/styles/hspa-mini.css" ../siyuan-hspa/{README.md,docs,skill,examples}` finds relevant docs/examples.

### Phase 5: Mock plugin ✅
- [x] Create `../siyuan-hspa/examples/mock-plugin/package.json`.
- [x] Create `../siyuan-hspa/examples/mock-plugin/vite.config.ts` using `hspaStaticCopyTargets()`.
- [x] Create `../siyuan-hspa/examples/mock-plugin/plugin.json`.
- [x] Create `../siyuan-hspa/examples/mock-plugin/src/index.ts` opening a demo HSPA tab/dialog.
- [x] Create `../siyuan-hspa/examples/mock-plugin/src/pages/demo.html` exercising preset SDK, CSS, Alpine, and custom event receive path.
**Verification**:
- Agent: `cd ../siyuan-hspa/examples/mock-plugin && pnpm exec tsc --noEmit` succeeds if dependencies are installed/linked; otherwise document skipped dependency reason.
- Agent: `rg -n "hspaStaticCopyTargets|openIframeTab|pluginSdkReady|currentTime|../hspa/scripts/alpine.min.js" ../siyuan-hspa/examples/mock-plugin` finds expected integration points.
**User Check**:
1. BC-6: build/install mock plugin in SiYuan → demo page opens and shows theme/preset SDK actions.

### Phase 6: Build verification + checkpoint ✅
- [x] Run package install/build/type checks for `../siyuan-hspa`.
- [x] Verify package exports and files with `pnpm pack --dry-run` or equivalent.
- [x] Update `tasks.md` progress and `memory.md` milestone.
- [x] Create checkpoint git commit for spec + package implementation.
**Verification**:
- Agent: `cd ../siyuan-hspa && pnpm build` succeeds.
- Agent: `cd ../siyuan-hspa && pnpm pack --dry-run` includes `dist`, `assets`, `examples`, `docs`, `skill`, `README.md`.
- Agent: `git status --short --branch` shows checkpoint-ready changes.
**User Check**:
1. BC-1: package directory exists and builds.
2. BC-2: sy-f-misc internal source files remain unmigrated.
3. BC-3/BC-4: mock plugin source shows runtime + stable-core preset usage.
4. BC-5: mock/plugin docs show asset copy to `hspa/` and HTML explicit relative links.

### Feedback Tasks (→ revisions)
- (none yet)

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 4/4 | ✅ |
| Phase 2 | 5/5 | ✅ |
| Phase 3 | 3/3 | ✅ |
| Phase 4 | 7/7 | ✅ |
| Phase 5 | 5/5 | ✅ |
| Phase 6 | 4/4 | ✅ |

**Recent**:
- 2026-07-04T01:22+08:00: Phase 6 complete; package builds, mock plugin builds, pack dry-run is clean, package repo checkpoint commit `223bf65` created.
- 2026-07-04T01:12+08:00: Phase 5 complete; mock plugin created and type-checks with local source paths.
- 2026-07-04T01:07+08:00: Phase 4 complete; README, docs, SKILL, and Vanilla/Alpine examples created.
- 2026-07-04T01:03+08:00: Phases 2 and 3 complete; runtime, preset SDK, URL helpers, assets, and Vite copy helper type-check.
- 2026-07-04T00:56+08:00: Phase 1 complete; package scaffold and junction created.
- 2026-07-04T00:45+08:00: Plan created after design approval.
