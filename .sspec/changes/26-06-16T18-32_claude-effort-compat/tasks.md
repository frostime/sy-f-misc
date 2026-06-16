---
change: "claude-effort-compat"
updated: "2026-06-16T19:00+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Effort model + protocol fixes ⏳
- [x] Add `max` to global effort type/lists and budget fallback in `src/func/gpt/types.ts` and `src/func/gpt/openai/adapter.ts` per **Type A**.
- [x] Write clamped effort back before non-OpenAI protocol return in `src/func/gpt/openai/adapter.ts` per **Fix C**.
- [x] Fix Claude adaptive payload in `src/func/gpt/openai/claude-complete.ts` per **Fix B**.
**Verification**: `rg` confirms `max` in shared effort lists; `rg "payload\.effort" src/func/gpt/openai/claude-complete.ts` has no active assignment; TypeScript build passes.

### Phase 2: UI + preset updates ⏳
- [x] Add `max` to chat reasoning option lists in `src/func/gpt/setting/ChatSetting.tsx` and `src/func/gpt/chat/main.tsx` per **Type A**.
- [x] Update provider compatibility editor in `src/func/gpt/setting/ProviderSettingV2.tsx` per **UX D**.
- [x] Update model presets in `src/func/gpt/model/preset.ts` per **Preset E**.
**Verification**: `rg` confirms UI effort arrays include `max`; provider settings can edit `effortMap` in Claude adaptive mode; TypeScript build passes.

### Phase 3: Final verification + memory ✅
- [x] Run available project verification commands and targeted searches.
- [x] Update `memory.md` with implementation milestone.
**Verification**: build/typecheck command result recorded; final `git diff` limited to planned files plus sspec task/memory updates.

### Feedback Tasks

- [x] Clarify ProviderSetting effort help doc with mode-specific send behavior.

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Feedback | 100% | ✅ |

**Recent**:
- [2026-06-16T19:00+08:00] Clarified effort help doc with protocol/mode-specific send behavior; verification passed.
- [2026-06-16T18:56+08:00] Review feedback accepted: clarify effort help doc.
- [2026-06-16T18:53+08:00] Verification passed: `pnpm run type-check` and `pnpm run build`.
- [2026-06-16T18:43+08:00] Updated Claude, DeepSeek V4 Pro, and Qwen3 presets.
- [2026-06-16T18:42+08:00] Updated provider compatibility editor for `max`, Claude adaptive maps, and help docs.
- [2026-06-16T18:39+08:00] Added `max` to chat reasoning option lists.
- [2026-06-16T18:38+08:00] Fixed Claude adaptive payload to use merged `output_config.effort`.
- [2026-06-16T18:37+08:00] Made non-OpenAI protocols receive clamped `reasoning_effort`.
- [2026-06-16T18:36+08:00] Added global `max` effort type/list and default budget.
- [2026-06-16T18:35+08:00] Plan initialized after design confirmation.
