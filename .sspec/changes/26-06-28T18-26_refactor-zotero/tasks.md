---
change: "refactor-zotero"
updated: "2026-06-28T19:30+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Config Storage Safety ⏳
- [ ] Update `src/func/zotero/config.ts` — add explicit `dump()` that excludes `zoteroDir` and persists only new Zotero config fields per `design.md`.
- [ ] Update `src/func/zotero/config.ts` — keep `zoteroDir.config.json` as the SOT and ensure `zoteroDir` settings UI writes only through `plugin.saveData('zoteroDir.config.json', ...)`.
- [ ] Update `src/func/zotero/config.ts` — migrate legacy `configs.json` `Misc.zoteroPassword` into new runtime config and preserve deprecated legacy data.
- [ ] Update `src/func/zotero/config.ts` — add connection diagnostic UI action for Local API and bridge status.
**Verification**:
- Agent: inspect generated `custom-module.config.json` save payload path in code; expected `zoteroDir` is absent from `dump()`.
- Agent: TypeScript check/build after all implementation phases; expected no type errors from new config fields.
**User Check**:
1. BC-2: change Zotero data directory in settings → `zoteroDir.config.json` updates and `custom-module.config.json` does not gain/update `Zotero.zoteroDir`.
2. BC-3: click Zotero connection check → message distinguishes Local API/Bridge availability.

### Phase 2: Transport Refactor ⏳
- [ ] Update `src/func/zotero/zoteroModal.ts` — remove Better BibTeX `debug-bridge` request path and token dependency.
- [ ] Update `src/func/zotero/zoteroModal.ts` — implement bridge calls to `/f-zotero-ext/api/v1/status` and `/f-zotero-ext/api/v1/selected`.
- [ ] Update `src/func/zotero/zoteroModal.ts` — implement Local API note child fetch via `/api/users/0/items/<itemKey>/children` for `/note` flow.
- [ ] Delete obsolete injected JS files under `src/func/zotero/js/*.js` after confirming no remaining references.
**Verification**:
- Agent: `rg "debug-bridge|executeZoteroJS|zoteroPassword|getPassword|src/func/zotero/js" src/func/zotero` shows no obsolete transport dependency except intentional legacy migration/config notes.
- Agent: TypeScript check/build after all implementation phases; expected no missing imports from deleted JS files.
**User Check**:
1. BC-1: select Zotero item and run `/cite` → citation output remains equivalent to old behavior.
2. BC-1: select Zotero item with notes and run `/note` → note import, references, annotations, and images remain equivalent to old behavior.

### Phase 3: Entry Migration UX ⏳
- [ ] Update `src/func/zotero/index.ts` — remove `globalThis.ZoteroSDK.executeJSCode()` export entirely.
- [ ] Update `src/func/zotero/index.ts` — show migration guide on first Zotero feature use when migrated legacy config requires user attention.
- [ ] Update `src/func/zotero/index.ts` — ensure paste optimization keeps existing behavior while using refactored transport/config helpers.
**Verification**:
- Agent: `rg "executeJSCode|ZoteroSDK" src/func/zotero src` confirms removed public JS executor and no stale callers.
- Agent: TypeScript check/build after all implementation phases; expected no global typing errors.
**User Check**:
1. BC-2: old-user config triggers migration prompt only on first Zotero action, not immediately at plugin load.
2. BC-1: paste a Zotero link into SiYuan → existing optimized handling still works.

### Phase 4: Bridge Packaging ⏳
- [ ] Verify `src/external/zotero-bridge/bootstrap.js` endpoint contract matches `design.md`; adjust only if needed for selected-item payload compatibility.
- [ ] Verify `src/external/zotero-bridge/manifest.json` keeps `/f-zotero-ext/api/v1` bridge identity and leaves auto-update as deferred.
- [ ] Update `vite.config.ts` — include packaged `f-zotero-ext.xpi` in plugin distribution if not already handled.
- [ ] Run or document `src/external/zotero-bridge/pack.sh` packaging flow.
**Verification**:
- Agent: inspect built/package output path or build script behavior; expected `.xpi` is available in distribution path.
- Agent: `rg "sy-f-misc.*api|update_url" src/external/zotero-bridge` confirms endpoint prefix remains `/f-zotero-ext/api/v1` and update handling is not implemented beyond placeholder.
**User Check**:
1. BC-4: user can locate bridge `.xpi` from documented release/plugin path and install it in Zotero v9+.

### Phase 5: Documentation ⏳
- [ ] Update `src/func/zotero/zotero-desc.md` — describe Zotero v9+ Local API + bridge setup, connection check, and common failures.
- [ ] Add `src/func/zotero/zotero-migration.md` — old debug-bridge/token migration guide and required bridge installation steps.
- [ ] Update `README.md` — remove Better BibTeX debug-bridge instructions and link to new Zotero docs/help flow.
- [ ] Ensure settings Help button opens the updated Zotero help document.
**Verification**:
- Agent: `rg "debug-bridge|Better BibTeX|CTT|Zotero 7" README.md src/func/zotero` returns only intentional historical/migration mentions.
- Agent: inspect help button source path; expected it points to existing Zotero help markdown.
**User Check**:
1. BC-4: open Zotero settings help → new installation/migration documentation is visible and actionable.

### Phase 6: Final Validation ⏳
- [ ] Run focused search checks for removed dependencies and storage boundaries.
- [ ] Run project TypeScript/build validation command available in `package.json`.
- [ ] Manually review `git diff` for unrelated changes and ensure old config cleanup was not performed.
- [ ] Update this `tasks.md` progress as phases complete.
**Verification**:
- Agent: `git diff --check` passes.
- Agent: project build/typecheck command passes or known unrelated failures are documented.
- Agent: `git status --short` shows only intended implementation/doc files changed.
**User Check**:
1. BC-1/BC-2/BC-3/BC-4: perform end-to-end Zotero smoke test with Zotero v9+ running, bridge installed, and a selected item with notes.

### Feedback Tasks

- (none yet)

---

## Progress

**Overall**: 0%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: Config Storage Safety | 0% | ⏳ |
| Phase 2: Transport Refactor | 0% | ⏳ |
| Phase 3: Entry Migration UX | 0% | ⏳ |
| Phase 4: Bridge Packaging | 0% | ⏳ |
| Phase 5: Documentation | 0% | ⏳ |
| Phase 6: Final Validation | 0% | ⏳ |

**Recent**:
- [2026-06-28T19:30+08:00] Plan initialized from confirmed design; implementation not started.
