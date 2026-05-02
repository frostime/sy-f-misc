# Project Context

<!-- This file is the stable identity layer for agents working on this project.
Read it first every session. Update Conventions + Notes via @memory. -->

**Name**: sy-f-misc
**Description**: A SiYuan Note plugin project.
**Repo**: https://github.com/frostime/sy-f-misc

A comprehensive personal toolbox plugin for SiYuan Note, providing a collection of powerful utilities and integrations.

## Tech Stack
- **Language**: TypeScript
- **Key Dependencies**:
  - SiYuan Plugin API
  - SolidJS
  - @frostime/solid-signal-ref
  - @frostime/siyuan-plugin-kits
- **Build Tool**: Vite + pnpm
- **Test Framework**: None — siyuan plugin cannot be easily tested; use `pnpm run dev` and debug/test within SiYuan app.

### Build

See `vite.config.ts`. Plugin compiled to single `index.js`, distributed to `dev/` or `dist/`.

- `src/` → Vite → `<dist>/index.js`
- CSS → `<dist>/index.css`
- `plugin.json` → copied to dist (manifest)
- Static files:
  - `/README*.md`, `preview.png`, `icon.png` → `<dist>/`
  - `src/**/*.html` → `<dist>/pages/`
  - `src/**/*.md` → `<dist>/docs/`
- `/public/` → `<dist>/`

## Key Paths
<!-- MUST keep ≤10 entries. Most important directories/files for quick navigation.
Agent uses this to orient in the codebase. -->

| Path | Purpose |
|------|---------|
| `src/func/` | Functional modules (each in own folder) |
| `src/func/types.d.ts` | Module structure definition |
| `src/libs/` | Shared utilities |
| `src/libs/components/` | Shared components |
| `vite.config.ts` | Build configuration |

## Conventions
<!-- MUST be one-liners. Coding rules that apply across ALL work in this project.
If a convention needs multi-paragraph explanation → write a spec-doc.
Examples: "snake_case for Python, camelCase for JS", "All API routes: /api/v1/*",
"Never commit .env files", "Prefer composition over inheritance" -->

### SolidJS Best Practices
- Follow SolidJS reactive patterns and component lifecycle
- Use `@frostime/solid-signal-ref` for cleaner signal management
- Proper component composition and props handling
- Avoid breaking reactivity chains

### Import Conventions
- Use path aliases: `@/` for `src/`, `@gpt/` for `src/func/gpt/`
- **Avoid `await import()`** for internal modules (single bundle compilation)
- Only use dynamic imports for external JavaScript files
- Module resolution: bundler mode

## Spec-Docs Index
<!-- Quick reference to spec-docs in `.sspec/spec-docs/`.
Spec-docs capture knowledge that code alone cannot adequately convey:
  A) In code, but scattered or hard to reconstruct (cross-module architecture, UX requirements, design norms, trade-offs)
  B) Outside code entirely (platform rules, API quirks, business constraints, deployment assumptions)
NOT a restating of code behavior — if readable from code+comments, it doesn't belong here.
MUST keep entries in sync with actual spec-doc files.
Format: `- [name](spec-docs/<file>) — one-line summary` -->

- [siyuan-content-tools](spec-docs/siyuan-content-tools.md) — Architecture of 5 content tools (getBlockInfo, getBlockContent, appendContent, createNewDoc, applyBlockDiff) with slice mechanism, container block expansion, SEARCH/REPLACE format
- [external-bundle](spec-docs/external-bundle.md) — External module independent bundling system: vite-plugin-external-modules architecture, module registration, dynamic import pattern
- [gpt-module-architecture-overview](spec-docs/gpt-module-architecture-overview.md) — Bird's-eye view of `src/func/gpt/`: initialization sequence, configuration system, provider/model lifecycle, chat session lifecycle (V2 tree model), API communication flow, and cross-cutting concerns (privacy, context providers, tools, persistence)
- [gpt-chat-module-cross-file-architecture](spec-docs/gpt-chat-module-cross-file-architecture.md) — Cross-file call chains (parameter merge, context building, model resolution, protocol dispatch), naming pitfalls, schema migration pattern, model preset matching rules, V2 tree model design rationale, and agent traps for `src/func/gpt/`

## External References

- **[SiYuan Plugin API](https://github.com/siyuan-note/petal)**: Official plugin development framework
- **[SiYuan Kernel API](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)**: Backend HTTP API documentation
- **[SiYuan Database Schema](https://raw.githubusercontent.com/siyuan-community/siyuan-developer-docs/refs/heads/main/docs/zh-Hans/reference/database/table.md)**: SQLite database structure reference
- **[SolidJS](https://www.solidjs.com/)**: Reactive UI framework (v1.9+)
- **[@frostime/solid-signal-ref](https://www.npmjs.com/package/@frostime/solid-signal-ref)**: Enhanced SolidJS signal management
- **[@frostime/siyuan-plugin-kits](https://www.npmjs.com/package/@frostime/siyuan-plugin-kits)**: SiYuan plugin utilities

## Notes
<!-- Project-level memory. Append-only log of learnings, gotchas, preferences.
Agent appends here during @memory when a discovery is project-wide (not change-specific).
Format each entry as: `- YYYY-MM-DD: <learning>`
Prune entries that become outdated or graduate to Conventions/spec-docs. -->

- 2026-02-07: Created spec-doc `siyuan-content-tools` documenting the architecture of 5 content tools. Purpose: Reduce future agent maintenance overhead when modifying content tools.
- 2026-02-22: Created spec-doc `external-bundle` and skill `external-bundle` documenting the external module independent bundling system. Covers vite-plugin-external-modules architecture, module registration, dynamic import pattern, pitfalls.
