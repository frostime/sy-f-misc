---
name: extract-siyuan-hspa
status: REVIEW
change-type: single
created: 2026-07-04T00:21:02
reference: null
---

<!-- MUST follow frontmatter schema:
status: PLANNING | DOING | REVIEW | DONE | BLOCKED
change-type: single | sub
reference?: Array<{source, type: 'request'|'root-change'|'sub-change'|'prev-change'|'doc'|'revision', note?}>

Sub-change MUST link root:
reference:
  - source: ".sspec/changes/<root-change-dir>"
    type: "root-change"
    note: "Phase <n>: <phase-name>"

Single-change common reference:
reference:
  - source: ".sspec/requests/<request-file>.md"
    type: "request"
  - source: ".sspec/changes/<change-dir>"
    type: "prev-change"
    note: "Follow-up to <change-name>."
-->

# extract-siyuan-hspa

## Problem Statement

<!-- Quantify impact. Format: "[metric] causing [impact]".
Simple: single paragraph. Complex: split into "Current state" + "User need". -->

`sy-f-misc` already contains a useful HSPA iframe UI pattern, but the implementation and documentation live inside one plugin, causing reuse in other SiYuan plugins to require copying ad-hoc code, CSS, examples, and agent guidance. The user needs an independently publishable, SiYuan-specific package that extracts the reusable HSPA idea without migrating or changing `sy-f-misc` internals.

## Proposed Solution

### Approach
<!-- Core solution (1-3 paragraphs) + why this approach over alternatives -->

Create a new sibling package `../siyuan-hspa` published as `@frostime/siyuan-hspa`, with a development junction at `packages/siyuan-hspa -> ../siyuan-hspa`. The package is SiYuan-specific, depends on `siyuan` as a peer dependency, and uses `tsup` for library builds.

The package provides the reusable HSPA runtime, SiYuan tab/dialog wrappers, a stable-core preset SDK, static assets (`hspa-mini.css`, `alpine.min.js`), examples including a runnable mock plugin, and an agent-facing SKILL. Existing `sy-f-misc` HSPA code remains in place; this change does not migrate internal imports or behavior.

### Behavior Contract
<!-- MUST define externally observable behavior boundaries caused by this change.
Use BC-1 / BC-2 labels when multiple behavior contracts exist.

For behavior-changing work, specify as relevant:
- Surface: CLI / UI / API / generated file / persisted data / Agent workflow / template output
- Before: current observable behavior
- After: required observable behavior
- Unchanged / Boundary: what must not change
- Error / compatibility behavior when relevant

For internal/refactor-only work, state that user-visible behavior is unchanged and name the external behavior scope to preserve.
Do NOT write test commands or click-by-click verification here. Those belong in tasks.md Verification / User Check.
Fence nesting: when showing content containing ```, outer fence MUST use more backticks (outer > inner). -->

**BC-1 Package creation**
- Surface: filesystem/package metadata/npm package API.
- Before: no sibling reusable HSPA package exists.
- After: `../siyuan-hspa` exists as a TypeScript package named `@frostime/siyuan-hspa`, with `tsup` build, public npm-ready metadata, `peerDependencies.siyuan`, and publish files covering runtime, assets, examples, docs, and SKILL.
- Boundary: do not publish to npm during implementation unless separately requested.

**BC-2 sy-f-misc non-migration**
- Surface: existing `sy-f-misc` plugin behavior and imports.
- Before/After: current `src/func/html-pages/*` and existing callers continue to behave unchanged.
- Boundary: this change may add `packages/siyuan-hspa` junction but must not refactor sy-f-misc feature code to consume the new package.

**BC-3 Runtime API**
- Surface: package exports.
- After: consumers can open same-origin HTML iframe pages in SiYuan tabs/dialogs, inject `window.pluginSdk`, dispatch events into the iframe, receive a lifecycle handle, and generate plugin asset/page URLs without hardcoding the plugin name.
- Error/compatibility: cross-origin pages cannot receive SDK injection; runtime should fail visibly via console warnings rather than silently pretending injection succeeded.

**BC-4 Stable-core preset SDK**
- Surface: injected `window.pluginSdk` when `presetSdk` is enabled.
- After: preset SDK provides stable SiYuan/UI/theme helpers only: `request`, `querySQL`, `getBlockByID`, `getMarkdown`, `lsNotebooks`, `openBlock`, `confirm`, `showMessage`, `showDialog`, `themeMode`, `styleVar`, `lute`.
- Boundary: no page storage helpers (`loadConfig/saveConfig/loadAsset/saveAsset`) and no current sy-f-misc business storage semantics.

**BC-5 Static asset consumption**
- Surface: host plugin build config and HTML pages.
- After: package provides `hspaStaticCopyTargets()` under `@frostime/siyuan-hspa/vite`; host plugins use it with `vite-plugin-static-copy` to copy assets into `dist/hspa/`. HTML pages load CSS/Alpine explicitly using relative paths such as `../hspa/styles/hspa-mini.css` and `../hspa/scripts/alpine.min.js`.
- Boundary: no HTML build transform, no auto-injected `hspa-client.js`, no Vue vendor asset.

**BC-6 Examples, docs, and SKILL**
- Surface: package repository/npm contents.
- After: package contains README/API docs, HTML authoring rules, Vanilla/Alpine templates, `examples/mock-plugin`, and `skill/hspa/SKILL.md` with docs linking to the SKILL.

### Implementation Changes
<!-- MUST label each independent implementation item with a unique `type(scope): title` label.
Examples: **feat(cli): Add tag filter** / **fix(parser): Handle empty frontmatter** / **refactor(service): Extract cache adapter**.
Allowed type vocabulary is project-local; common types include feat, fix, refactor, docs, test, chore, build, perf, add.
Each item states what implementation surface changes and which Behavior Contract it serves.
tasks.md references these labels — MUST NOT copy the design description.
If scope boundary is unclear, add a "What Stays Unchanged" block after Scope Summary. -->

**build(package): Create @frostime/siyuan-hspa package** — Create sibling package, package metadata, tsup build, TypeScript config, exports, publish files, and dev junction. Serves BC-1, BC-2.

**feat(runtime): Implement iframe runtime and SiYuan wrappers** — Provide iframe creation, SDK injection, style variable injection, theme mode setting, event dispatch, tab/dialog helpers, and URL helpers. Serves BC-3.

**feat(preset-sdk): Provide stable-core pluginSdk** — Implement stable SiYuan preset SDK using only `siyuan` exports, browser globals, and kernel APIs. Serves BC-4.

**feat(assets): Package HSPA static assets and Vite copy targets** — Include `hspa-mini.css`, `alpine.min.js`, and `hspaStaticCopyTargets()` targeting `hspa/`. Serves BC-5.

**docs(package): Write public usage SPEC, examples, and SKILL** — Document API, HTML authoring constraints, Vite asset copy setup, mock plugin usage, Vanilla/Alpine templates, and package SKILL. Serves BC-6.

### Scope Summary
<!-- MUST end every single/sub spec with a File | Change | Effort table.
Effort is a rough design-stage estimate, not an acceptance criterion.
Use: XS trivial/local | S localized | M multi-file or coordination needed | L cross-module, risky, or migration-heavy. -->

**What Stays Unchanged**
- Existing `sy-f-misc/src/func/html-pages/*` implementation.
- Existing `sy-f-misc` HSPA callers and import paths.
- Existing `sy-f-misc` build behavior, except the added development junction directory.

| File | Change | Effort |
|---|---|---:|
| `../siyuan-hspa/package.json` | Package metadata, exports, scripts, peer/dev dependencies, publish files | M |
| `../siyuan-hspa/src/**` | Runtime, preset SDK, SiYuan wrappers, URL helpers | L |
| `../siyuan-hspa/assets/hspa/**` | `hspa-mini.css` and Alpine vendor asset | S |
| `../siyuan-hspa/examples/mock-plugin/**` | Runnable consumer example | M |
| `../siyuan-hspa/docs/**`, `../siyuan-hspa/README.md` | API SPEC, HTML authoring rules, asset usage | M |
| `../siyuan-hspa/skill/hspa/SKILL.md` | Portable agent skill for package users | S |
| `packages/siyuan-hspa` | Junction to sibling package | XS |
| `sy-f-misc/src/**` | No migration/refactor intended | XS |

### Design Reference
<!-- MUST create design.md when the change involves new interfaces, data model changes,
or architectural logic changes. Link here: See [design.md](./design.md)
Simple changes MAY delete this section and describe the technical approach inline. -->

See [design.md](./design.md).
