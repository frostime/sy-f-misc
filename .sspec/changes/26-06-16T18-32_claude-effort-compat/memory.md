# Memory: claude-effort-compat

**Updated**: 2026-06-16T18:53+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/SiYuanDevelopment/sy-f-misc`
- Branch: `fix/reasoning-effort`
- HEAD: `701dfcec681c9cd26a7ef438c715b419d59d3253`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## fix/reasoning-effort...origin/fix/reasoning-effort
```

## State

Implementation complete and verified. Change is in REVIEW; next step is user review/acceptance.

## Key Files

- `src/func/gpt/types.ts` — global `ReasoningEffort` type; must include `max`.
- `src/func/gpt/openai/adapter.ts` — effort ordering/clamp and default thinking budgets.
- `src/func/gpt/openai/claude-complete.ts` — Claude adaptive payload builder; current bug is top-level `payload.effort`.
- `src/func/gpt/setting/ProviderSettingV2.tsx` — model compatibility UI; must expose `max`, editable `effortMap`, and help doc.
- `src/func/gpt/model/preset.ts` — conservative Claude preset and Qwen3/DeepSeek reasoning compat defaults.

## Knowledge

- [2026-06-16T18:32+08:00] [Decision] User wants `max` as a first-class global effort, not hidden behind `effortMap`, because provider compatibility UI already lets users manage supported efforts.
- [2026-06-16T18:32+08:00] [Decision] Keep `effortMap` for explicit provider-native mappings; Claude protocol must not hardcode `xhigh -> max`.
- [2026-06-16T18:32+08:00] [Decision] Claude default preset should be conservative; users manually enable `xhigh`/`max` where supported.
- [2026-06-16T18:32+08:00] [Rejected] Do not add a separate `DEFAULT_VISIBLE_EFFORTS`; user considered it unnecessary internal complexity.
- [2026-06-16T18:32+08:00] [Rejected] Do not migrate old configs based on inferred Claude intent; existing config has no reliable `userTouched` marker.
- [2026-06-16T18:32+08:00] [Gotcha] `supportedEfforts` clamp currently computes a local `effort` but returns early for non-OpenAI protocols before writing it back.

## Milestones

- [2026-06-16T18:32+08:00] Created change and drafted spec/design for Claude effort compatibility.
- [2026-06-16T18:53+08:00] Implemented effort compatibility changes and verified with `pnpm run type-check` + `pnpm run build`.
