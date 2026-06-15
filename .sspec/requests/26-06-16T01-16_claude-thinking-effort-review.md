---
name: claude-thinking-effort-review
created: 2026-06-16T01:16:25
status: OPEN
kind: observe
attach-change: null
tldr: "Claude thinking effort 存在三个问题：1) 参数位置错误（payload.effort → output_config.effort）；2) effortMap 未被使用（硬编码 xhigh->max）；3) 非 OpenAI 协议下 supportedEfforts clamp 被忽略"
author: AGENT - Mimo-V2.5-Pro
---

# Observe: claude-thinking-effort-review

## 问题概述

AGENT 在调研网络对比代码之后，认为当前 Claude Extended Thinking 的实现存在以下问题：

1. **effort 参数位置错误**：effort 被放在 payload 顶级的 `payload.effort`，正确应为 `output_config.effort`
2. **effortMap 未被 Claude 协议使用**：系统设计了 `effortMap` 供用户自定义 effort 映射，但 Claude 协议硬编码了 `xhigh -> max` 的映射，没有使用 `effortMap`，导致与 OpenAI 协议行为不一致
3. **非 OpenAI 协议下 supportedEfforts clamp 被忽略**：`applyOptionCompat()` 对非 OpenAI 协议提前返回，clamp 结果未写回 `option.reasoning_effort`

根据 Anthropic 官方 SDK 和主流 LLM 代理框架 LiteLLM 的实现，这些问题需要修复。

**GPT 在受限上下文情况写的审核**：核心判断基本正确，但需注意：
- "effort 是 beta 功能"的说法已过时，Claude 4.6+ 的 `output_config.effort` 已是稳定 API
- 修复时应合并 `output_config`，而非覆盖
- `effortMap` 应优先生效，`minimal -> low` 作为兜底

---

## 证据 1：Anthropic 官方 SDK 的 ThinkingConfigParam 定义

**来源**: `https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/thinking_config_param.py`

```python
# File generated from our OpenAPI spec by Stainless.

from .thinking_config_enabled_param import ThinkingConfigEnabledParam
from .thinking_config_adaptive_param import ThinkingConfigAdaptiveParam
from .thinking_config_disabled_param import ThinkingConfigDisabledParam

ThinkingConfigParam: TypeAlias = Union[
    ThinkingConfigEnabledParam, ThinkingConfigDisabledParam, ThinkingConfigAdaptiveParam
]
```

**关键发现**: `ThinkingConfigParam` 只有三种类型，**没有 effort 字段**。

---

## 证据 2：ThinkingConfigAdaptiveParam 定义（无 effort 字段）

**来源**: `https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/thinking_config_adaptive_param.py`

```python
class ThinkingConfigAdaptiveParam(TypedDict, total=False):
    type: Required[Literal["adaptive"]]
    display: Optional[Literal["summarized", "omitted"]]
```

**关键发现**: adaptive 模式只有 `type` 和 `display`，**没有 effort 字段**。

---

## 证据 3：AnthropicOutputConfig 定义（effort 在此处）

**来源**: `https://raw.githubusercontent.com/BerriAI/litellm/main/litellm/types/llms/anthropic.py`

```python
class AnthropicOutputConfig(TypedDict, total=False):
    """Configuration for controlling Claude's output behavior."""
    effort: Literal["high", "medium", "low", "xhigh", "max"]
    format: AnthropicOutputSchema
```

**关键发现**: effort 属于 `AnthropicOutputConfig`，即 `output_config.effort`。

---

## 证据 4：LiteLLM 的 Claude effort 处理逻辑

**来源**: `https://raw.githubusercontent.com/BerriAI/litellm/main/litellm/llms/anthropic/chat/transformation.py`

```python
# LiteLLM 的处理方式
if AnthropicConfig._is_adaptive_thinking_model(model):
    # 对于 adaptive thinking 模型，使用 output_config.effort
    mapped_effort = REASONING_EFFORT_TO_OUTPUT_CONFIG_EFFORT.get(effort_value)
    optional_params["output_config"] = {"effort": mapped_effort}
else:
    # 对于其他模型，使用 thinking.budget_tokens
    thinking = {"type": "enabled", "budget_tokens": budget}
```

**Effort 映射表** (LiteLLM 定义):
```python
REASONING_EFFORT_TO_OUTPUT_CONFIG_EFFORT: Dict[str, str] = {
    "low": "low",
    "minimal": "low",
    "medium": "medium",
    "high": "high",
    "xhigh": "xhigh",
}
```

**关键发现**: LiteLLM 将 effort 放在 `output_config` 中，而非 payload 顶级。

---

## 证据 5：Claude effort 的模型支持情况

**来源**: 
- `https://raw.githubusercontent.com/BerriAI/litellm/main/litellm/types/llms/anthropic.py`
- `https://docs.anthropic.com/en/docs/about-claude/models/migrating-to-claude-4`

LiteLLM 中定义了 beta header：
```python
ANTHROPIC_EFFORT_BETA_HEADER = "effort-2025-11-24"
```

**但根据 Anthropic 迁移文档**：
- Claude 4.6+ / 4.7+ 的 `output_config.effort` 已是稳定 API
- 不再需要 beta SDK namespace 或 beta headers
- `effort-2025-11-24` 主要用于旧模型（如 Claude Opus 4.5）

**支持模型** (来自 LiteLLM 注释):
```
Effort is only supported on Opus 4.5+, 
Sonnet 4.6+, and Mythos Preview.
```

**结论**: effort 功能本身已稳定，但不同模型的支持程度不同。

---

## 证据 6：当前代码的实现（问题所在）

**文件**: `src/func/gpt/openai/claude-complete.ts:177-180`

```typescript
// 当前代码
if (claudeMode === 'manual-budget') {
    const budget = compat.thinking.budgetMap?.[effort] ?? DEFAULT_THINKING_BUDGETS[effort] ?? 8192;
    payload.thinking = { type: 'enabled', budget_tokens: budget };
} else {
    payload.effort = claudeEffort;  // ❌ 错误：effort 被放在 payload 顶级
    payload.thinking = { type: 'adaptive' };
}
```

**问题**: `payload.effort` 不是 Anthropic 官方 API 的标准字段。根据证据 3，effort 应该放在 `payload.output_config.effort`。

---

## 证据 7：effortMap 未被 Claude 协议使用

**背景**：系统设计了 `effortMap` 和 `budgetMap` 两个用户自定义映射字段，允许用户将归一化的 effort 映射到 API 原生值。

**类型定义** (`src/func/gpt/types.ts:388-392`):
```typescript
interface ILLMOptionCompat {
    thinking?: {
        /** 归一化 effort → API 原生字符串值（如 DeepSeek V4: { xhigh: 'max' }）*/
        effortMap?: Partial<Record<ReasoningEffort, string>>;
        /** 归一化 effort → token 预算（Claude/Gemini 协议用）*/
        budgetMap?: Partial<Record<ReasoningEffort, number>>;
        // ...
    };
}
```

**OpenAI 协议正确使用了 effortMap** (`src/func/gpt/openai/adapter.ts:92-106`):
```typescript
// openai（默认）: 只发 reasoning_effort
if (effort && effort !== 'none') {
    option.reasoning_effort = (effortMap?.[effort] ?? effort) as ReasoningEffort;
    //                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                      使用 effortMap 进行映射，如果没有则保持原值
} else {
    delete option.reasoning_effort;
}
```

**Claude 协议没有使用 effortMap** (`src/func/gpt/openai/claude-complete.ts:165-168`):
```typescript
// Claude adaptive effort 口径：low / medium / high / max
// 约定：xhigh -> max；minimal 无专属值时回落为 low
const claudeEffort = effort === 'xhigh'
    ? 'max'      // ❌ 硬编码映射，忽略了 effortMap
    : effort === 'minimal'
        ? 'low'
        : effort;
```

**问题**：
1. Claude 协议硬编码了 `xhigh -> max` 的映射，没有使用 `effortMap`
2. 用户无法通过 `effortMap` 自定义 Claude 的 effort 映射
3. 这与 OpenAI 协议的行为不一致

**正确做法**：
```typescript
// 应该像 OpenAI 协议一样使用 effortMap
const claudeEffort = effort === 'minimal'
    ? 'low'
    : (compat.thinking.effortMap?.[effort] ?? effort);
```

---

## 证据 8：Qwen3 preset 缺失配置

**文件**: `src/func/gpt/model/preset.ts`

```typescript
// 当前 Qwen3 配置
{
    keywords: [/^qwen3[-_]?(235b|30b|32b|14b|8b|4b|1\.7b|0\.6b)/i, ...],
    config: {
        capabilities: { reasoning: true },
        // ❌ 缺少 options.compat.thinking 配置
    },
},
```

**对比 DeepSeek 配置**（已正确配置）:
```typescript
{
    keywords: [/^deepseek[-_]?v3[._]2/i],
    config: {
        capabilities: { reasoning: true },
        options: {
            compat: {
                thinking: { enabled: true, thinkingStyle: 'deepseek' },
            },
        },
    },
},
```

**问题**: Qwen3 缺少 `thinkingStyle: 'qwen'` 配置，导致 `applyOptionCompat` 无法正确处理 thinking 参数。

---

## 核验清单

一个 fresh agent 可以按以下步骤核验：

1. **验证 ThinkingConfigParam 定义**
   ```bash
   gh 访问（或者 curl） "https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/thinking_config_adaptive_param.py"
   ```
   预期：只有 `type` 和 `display`，无 `effort`

2. **验证 AnthropicOutputConfig 定义**
   ```bash
   curl -s "https://raw.githubusercontent.com/BerriAI/litellm/main/litellm/types/llms/anthropic.py" | grep -A5 "class AnthropicOutputConfig"
   ```
   预期：包含 `effort: Literal["high", "medium", "low", "xhigh", "max"]`

3. **验证 LiteLLM 处理逻辑**
   ```bash
   curl -s "https://raw.githubusercontent.com/BerriAI/litellm/main/litellm/llms/anthropic/chat/transformation.py" | grep -A10 "output_config.*effort"
   ```
   预期：`optional_params["output_config"] = {"effort": mapped_effort}`

4. **验证当前代码的 effort 位置问题**
   ```bash
   cat src/func/gpt/openai/claude-complete.ts | grep -A5 "payload.effort"
   ```
   预期：`payload.effort = claudeEffort`（问题所在）

5. **验证 effortMap 未被 Claude 协议使用**
   ```bash
   grep -A5 "effortMap" src/func/gpt/openai/claude-complete.ts
   ```
   预期：无输出（Claude 协议未使用 effortMap）

6. **验证 OpenAI 协议正确使用了 effortMap**
   ```bash
   grep -A5 "effortMap" src/func/gpt/openai/adapter.ts
   ```
   预期：`option.reasoning_effort = (effortMap?.[effort] ?? effort) as ReasoningEffort`

7. **验证 effortMap 类型定义**
   ```bash
   grep -B2 -A5 "effortMap" src/func/gpt/types.ts
   ```
   预期：`effortMap?: Partial<Record<ReasoningEffort, string>>`

---

## 修复建议

### 问题 1：effort 参数位置错误

**修复文件**: `src/func/gpt/openai/claude-complete.ts:177-180`

```typescript
// 修复后
if (claudeMode === 'manual-budget') {
    const budget = compat.thinking.budgetMap?.[effort] ?? DEFAULT_THINKING_BUDGETS[effort] ?? 8192;
    payload.thinking = { type: 'enabled', budget_tokens: budget };
} else {
    // 修复：使用 output_config.effort（合并而非覆盖，保留用户已有的 output_config 字段）
    payload.output_config = {
        ...(payload.output_config ?? {}),
        effort: claudeEffort,
    };
    payload.thinking = { type: 'adaptive' };
}
```

**注意**: 如果关闭 reasoning，不要粗暴删除整个 `output_config`，只应删除 `output_config.effort`，保留其它 output 配置（如 `format`、`task_budget` 等）。

### 问题 2：effortMap 未被 Claude 协议使用

**当前问题**:
- Claude 协议硬编码了 `xhigh -> max` 的映射
- 用户无法通过 `effortMap` 自定义 Claude 的 effort 映射
- 与 OpenAI 协议的行为不一致

**修复文件**: `src/func/gpt/openai/claude-complete.ts:165-168`

```typescript
// 修复前（硬编码映射）
const claudeEffort = effort === 'xhigh'
    ? 'max'
    : effort === 'minimal'
        ? 'low'
        : effort;

// 修复后（effortMap 优先生效，minimal 作为兜底）
const claudeEffort =
    compat.thinking.effortMap?.[effort]
    ?? (effort === 'minimal' ? 'low' : effort);
```

**效果**:
- `effortMap` 优先：用户可以通过 `effortMap: { xhigh: 'max' }` 自定义映射
- `minimal -> low` 作为兜底：Claude 不支持 `minimal`，默认映射到 `low`
- 其它 effort（包括 `xhigh`）保持原值，不再硬编码映射
- 如果需要向后兼容旧行为，可以在 Claude preset 里显式配置 `effortMap: { xhigh: 'max' }`

### 问题 3：Qwen3 preset 缺失

```typescript
// preset.ts Qwen3 配置
{
    keywords: [/^qwen3[-_]?(235b|30b|32b|14b|8b|4b|1\.7b|0\.6b)/i, ...],
    config: {
        capabilities: { reasoning: true },
        options: {
            compat: {
                thinking: { enabled: true, thinkingStyle: 'qwen' },
            },
        },
    },
},
```

---

## 额外发现：非 OpenAI 协议下 `supportedEfforts` clamp 被忽略

**来源**: GPT 审核反馈

`applyOptionCompat()` 中虽然计算了 clamp 后的 `effort`，但对于非 OpenAI 协议会提前返回：

```typescript
// adapter.ts:81-83
if (protocol !== 'openai') {
    return option;  // 提前返回，clamp 结果未写回 option.reasoning_effort
}
```

这意味着 Claude/Gemini 协议不仅绕过了 `effortMap`，也可能绕过 `supportedEfforts` 的 clamp 结果。

**影响**: 如果用户设置了 `supportedEfforts: ['low', 'medium', 'high']`，但传入了 `xhigh`，对于 OpenAI 协议会被 clamp 到 `high`，但对于 Claude/Gemini 协议会保持 `xhigh`。

**建议**: 在 Claude/Gemini 的 payload builder 中也需要进行 clamp，或者在 `applyOptionCompat` 返回前将 clamp 结果写回 `option.reasoning_effort`。

---

## 需要确认的问题

1. 当前代码的 `payload.effort` 是否是为兼容某些第三方 API（如 OpenRouter）而故意添加的？
2. 是否需要添加 `supportsEffortParam` 标志到 `ILLMOptionCompat.thinking` 类型定义中？
3. 是否有模型不支持 `output_config.effort`，需要回退到 `thinking.budget_tokens`？
4. Claude 的 preset 中是否需要添加默认的 `effortMap`（例如 `{ xhigh: 'max' }`）以保持向后兼容？
5. 非 OpenAI 协议下的 `supportedEfforts` clamp 问题是否需要修复？

---

## 相关文件

- `src/func/gpt/openai/claude-complete.ts` — Claude 协议实现，问题所在位置（L177-180）
- `src/func/gpt/openai/adapter.ts` — 核心 `applyOptionCompat` 函数
- `src/func/gpt/model/preset.ts` — 模型预设配置，Qwen3 缺失配置
- `src/func/gpt/types.ts` — 类型定义，`ILLMOptionCompat` 结构


# Supplementary | GPT 关于 Claude 模型 effort 参数的调研

> 问: claude 是不是自从支持 effort 参数开始，就一直同时支持 xhigh 和 max?

**不是。**从可查证资料看，Claude 并非“自从支持 effort 参数开始就同时支持 `xhigh` 和 `max`”。

更准确的时间线是：

1. **Opus 4.5 初始 effort beta：只支持 `low` / `medium` / `high`**
   LiteLLM 2025-11-25 的 Opus 4.5 支持说明写的是 `reasoning_effort` 可取 `"high"`, `"medium"`, `"low"`，且需要 `effort-2025-11-24` beta header。([LiteLLM][1]) AWS 的 Opus 4.5 发布说明也只列出 `high` / `medium` / `low`。([Amazon Web Services, Inc.][2])

2. **Claude 4.6 阶段出现 `max`，但没有 `xhigh`**
   当前 Anthropic effort 文档说 `max` 可用于 Claude Opus 4.6 和 Sonnet 4.6；同一页又说 `xhigh` 可用于 Claude Opus 4.7、4.8、Fable/Mythos 等，不包括 4.6。([Claude][3]) LiteLLM 的兼容性说明也把 Opus 4.6 标成支持 `high` / `medium` / `low` / `max`。([LiteLLM][4])

3. **Claude Opus 4.7 才引入 `xhigh`，并与 `max` 并存**
   Anthropic migration guide 明确写 `xhigh (new)`，并建议 coding/agentic 场景从 `xhigh` 开始，同时把 `max` 描述为更高成本、可能收益递减的档位。([Claude API Docs][5]) 当前 effort 文档也明确区分：`xhigh` 适合长程 coding/agentic，`max` 是 absolute maximum capability。([Claude][3])

所以对你这个代码问题的判断应当改成：

> **当前 SDK 类型层面同时允许 `low | medium | high | xhigh | max`，但具体模型并不都支持所有值；`xhigh` 是后加入的档位，不能假设早期 Claude effort 一直支持 `xhigh`。**
> 当前代码把 `xhigh -> max` 硬编码掉，会损坏 Claude 4.7+ 的语义；但如果要兼容 Claude 4.6 或更早 effort 形态，需要按模型能力做 `supportedEfforts` / `effortMap`，不能统一直传 `xhigh`。

修复策略上，默认不要全局 `xhigh -> max`。更合理是：

```ts
const claudeEffort =
    compat.thinking.effortMap?.[effort]
    ?? (effort === 'minimal' ? 'low' : effort);
```

然后在具体 Claude preset 里表达模型差异：

```ts
// Claude 4.7+
supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max']

// Claude 4.6
supportedEfforts: ['low', 'medium', 'high', 'max']

// Claude Opus 4.5 beta
supportedEfforts: ['low', 'medium', 'high']
```

这样既保留 `xhigh`/`max` 的当前语义，也能避免向旧模型发送不支持的 effort 值。

[1]: https://docs.litellm.ai/blog/anthropic_advanced_features "Day 0 Support: Claude 4.5 Opus (+Advanced Features) | liteLLM"
[2]: https://aws.amazon.com/blogs/machine-learning/claude-opus-4-5-now-in-amazon-bedrock/?utm_source=chatgpt.com "Claude Opus 4.5 now in Amazon Bedrock"
[3]: https://platform.claude.com/docs/en/build-with-claude/effort "Effort - Claude API Docs"
[4]: https://docs.litellm.ai/docs/providers/anthropic_effort "Anthropic Effort Parameter | liteLLM"
[5]: https://docs.anthropic.com/en/docs/about-claude/models/migrating-to-claude-4 "Migration guide - Claude API Docs"
