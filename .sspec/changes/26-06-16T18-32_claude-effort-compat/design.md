---
change: "claude-effort-compat"
created: 2026-06-16T18:32:29
---

# Design: claude-effort-compat

## Effort model

```ts
type ReasoningEffort =
    | 'none'
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max';

const ALL_EFFORTS: ReasoningEffort[] = [
    'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'
];

const DEFAULT_THINKING_BUDGETS: Record<string, number> = {
    minimal: 1024,
    low: 2048,
    medium: 8192,
    high: 16384,
    xhigh: 32768,
    max: 65536,
};
```

Ordering is used only for nearest-level clamp. `max` sorts above `xhigh`.

## Request flow

```text
chatOption + toggles + model.compat + protocol
  → applyOptionCompat()
      1. remove toggled-off keys
      2. remove compat.unsupported keys
      3. clamp reasoning_effort by supportedEfforts
      4. write clamped value back to option.reasoning_effort
      5. if protocol=openai: apply thinkingStyle / effortMap
      6. if protocol=claude|gemini: return normalized option for protocol builder
  → buildClaudePayload() / buildGeminiPayload() / OpenAI request
```

## Claude adaptive behavior

```ts
const effort = option.reasoning_effort as ReasoningEffort | undefined;

const claudeEffort =
    compat.thinking.effortMap?.[effort]
    ?? (effort === 'minimal' ? 'low' : effort);

payload.output_config = {
    ...(payload.output_config ?? {}),
    effort: claudeEffort,
};
payload.thinking = { type: 'adaptive' };
```

Before/after:

| Case | Before | After |
|---|---|---|
| Claude adaptive `high` | `{ effort: "high", thinking: { type: "adaptive" } }` | `{ output_config: { effort: "high" }, thinking: { type: "adaptive" } }` |
| Claude adaptive `xhigh`, no map | sent `max` | sent `xhigh` |
| Claude adaptive `xhigh`, map `{ xhigh: 'max' }` | sent `max` by hardcode | sent `max` by explicit config |
| Claude adaptive with existing `output_config.format` | risk of overwrite if not careful | preserves `format`, adds/updates `effort` |
| `reasoning_effort = none` | deletes `payload.effort` | removes only `output_config.effort` if present, keeps other output_config fields |

## Provider settings UI

```text
Effort 兼容配置 [?]
  ├─ checkbox none     → no map input; disables thinking
  ├─ checkbox minimal  → text input effortMap.minimal (placeholder minimal)
  ├─ checkbox low      → text input effortMap.low
  ├─ checkbox medium   → text input effortMap.medium
  ├─ checkbox high     → text input effortMap.high
  ├─ checkbox xhigh    → text input effortMap.xhigh
  └─ checkbox max      → text input effortMap.max
```

Mode-specific input behavior:

| Protocol/mode | Right-side editor |
|---|---|
| OpenAI-compatible | string `effortMap` |
| Claude adaptive | string `effortMap` |
| Claude manual-budget | numeric `budgetMap` |
| Gemini | numeric `budgetMap` |

Help document content:

```md
# Effort 兼容配置

- 左侧勾选：该模型支持的 effort；用于聊天参数 UI 和发送前 clamp。
- 全部取消勾选：存储为空，表示不限制，所有全局 effort 都可用。
- 右侧留空：直接发送该 effort 名称。
- 右侧填写：把该 effort 映射为 API 原生值，例如 `xhigh -> max`。
- Claude adaptive：发送到 `output_config.effort`；`minimal` 默认回退为 `low`。
- Claude manual-budget / Gemini：右侧为 thinking budget；`max` 默认预算为 65536，可手动覆盖。
```

## Preset policy

| Preset | Default reasoning config |
|---|---|
| Claude fallback `^claude[-_]` | `enabled: true`, `claudeMode: 'adaptive'`, `supportedEfforts: ['none', 'low', 'medium', 'high']` |
| Qwen3 | `enabled: true`, `thinkingStyle: 'qwen'` |
| DeepSeek V4 Pro | if model pattern is added/identified: `supportedEfforts: ['none', 'high', 'max']`, `thinkingStyle: 'deepseek'` |
| Unknown/custom model | unchanged unless user edits compatibility settings |

## Compatibility and migration

```text
Existing config schema 3.2
  → no structural storage change
  → no schema bump
  → no automatic mutation of saved models
  → users configure xhigh/max/effortMap through ProviderSettingV2
```

Rationale: existing stored shapes already allow arbitrary effort map strings and supported effort arrays. Adding `max` is an accepted enum expansion, not a storage layout migration. There is no reliable `userTouched` marker for old Claude `xhigh -> max` behavior, so automatic migration would infer intent from incomplete data.

## Verification matrix

| Scenario | Expected request/behavior |
|---|---|
| Claude adaptive + `high` | request contains `output_config.effort = 'high'`; no top-level `effort` |
| Claude adaptive + `xhigh`, map empty | request contains `output_config.effort = 'xhigh'` |
| Claude adaptive + `xhigh`, map `max` | request contains `output_config.effort = 'max'` |
| Claude adaptive + existing `output_config.format` | request preserves `output_config.format` |
| Claude supportedEfforts excludes `max`, selected `max` | clamped to nearest supported value before payload build |
| Provider settings | `max` appears in compatibility editor and can be checked/mapped |
| Chat settings/menu | `max` appears when model supports it or support list is unrestricted |
