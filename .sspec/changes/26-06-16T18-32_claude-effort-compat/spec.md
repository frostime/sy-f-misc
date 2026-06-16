---
name: claude-effort-compat
status: PLANNING
change-type: single
created: 2026-06-16 18:32:29
reference:
- source: .sspec/requests/26-06-16T01-16_claude-thinking-effort-review.md
  type: request
  note: Linked from request
---

# claude-effort-compat

## Problem Statement

Claude adaptive thinking currently sends effort at the wrong request location (`payload.effort`), ignores configured `effortMap`, and bypasses `supportedEfforts` clamping for non-OpenAI protocols, causing invalid Claude payloads and surprising model-compat behavior. The UI also cannot express the now-common `max` effort as a first-class level, forcing users to encode provider-specific behavior through indirect mappings.

## Proposed Solution

### Approach

Promote `max` to the global `ReasoningEffort` set and use the same effort list across runtime, settings UI, and clamp logic. Keep `effortMap` as the explicit escape hatch for provider-specific native values, but remove Claude protocol hardcoding such as `xhigh -> max`.

Fix Claude adaptive thinking to emit `output_config.effort` while preserving any user-supplied `output_config` fields. Make `applyOptionCompat()` write the clamped effort back before protocol-specific builders run, so Claude/Gemini receive the same normalized effort decision as OpenAI-compatible paths.

Use conservative defaults and no behavior migration: Claude presets expose only the lowest common effort set by default; users opt into `xhigh`/`max` in provider model settings. Existing saved configs are not modified based on inferred intent.

### Key Change

**Type A: Global max effort**  
Add `max` to the global `ReasoningEffort` type and all shared effort lists used by adapter and UI.

**Fix B: Claude adaptive payload**  
Replace top-level `payload.effort` with merged `payload.output_config.effort`; use `compat.thinking.effortMap` before fallback; keep Claude `minimal -> low` fallback only.

**Fix C: Cross-protocol effort clamp**  
Ensure `supportedEfforts` clamping updates `option.reasoning_effort` before returning for non-OpenAI protocols.

**UX D: Provider effort configuration**  
Update `ProviderSettingV2.tsx` so provider/model compatibility settings can configure `max`, edit `effortMap` in Claude adaptive mode, and open a help document explaining supported efforts and mappings.

**Preset E: Conservative model defaults**  
Keep Claude default effort support conservative and add missing reasoning compatibility for Qwen3. Add targeted support for providers/models that are known to expose `max` only where the preset pattern is clear.

**Compat F: No behavior migration**  
Do not bump config schema and do not mutate existing configs to preserve old `xhigh -> max` behavior. Users keep control by editing model compatibility settings.

### Scope Summary

| File | Change |
|---|---|
| `src/func/gpt/types.ts` | Add `max` to `ReasoningEffort`; update comments/examples if needed |
| `src/func/gpt/openai/adapter.ts` | Add `max` to shared order/budget map; write clamped effort back for non-OpenAI protocols |
| `src/func/gpt/openai/claude-complete.ts` | Emit `output_config.effort`; merge existing `output_config`; use `effortMap`; remove `payload.effort` cleanup |
| `src/func/gpt/setting/ProviderSettingV2.tsx` | Add `max` to effort UI; make Claude adaptive map editable; add help dialog |
| `src/func/gpt/setting/ChatSetting.tsx` | Add `max` to reasoning option list |
| `src/func/gpt/chat/main.tsx` | Add `max` to chat menu reasoning option list |
| `src/func/gpt/model/preset.ts` | Conservative Claude default; Qwen3 thinkingStyle; optional targeted DeepSeek max support |

### Design Reference

→ See [design.md](./design.md)
