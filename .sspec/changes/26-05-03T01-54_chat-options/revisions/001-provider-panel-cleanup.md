---
change: "chat-options"
revision: 001
created: 2026-05-03
status: implemented
---

# Revision 001 — Provider panel cleanup

## Trigger

用户在实现后 UI review 中发现 Provider 模型配置面板存在概念重叠和协议不匹配展示问题。

## Problems

1. 旧字段与新字段并存，信息源重复：
   - `capabilities.reasoningEffort`
   - `options.unsupported`
   - `options.compat.*`
2. `customOverride` 排序过前，干扰主配置流。
3. Claude / Gemini 模型展示 OpenAI 兼容路径专属字段（如 `thinkingStyle`、`effortMap`），语义不自然。
4. Claude 的 thinking 目前存在两种推荐写法：
   - `thinking: { type: "enabled", budget_tokens: N }`
   - `thinking: { type: "adaptive" }` + `effort`
   这属于 Claude 协议内部模式选择，不应复用 OpenAI-compatible 的 `thinkingStyle` 概念。

## Proposed Changes

### A. 移除旧 UI 入口

- 从 ProviderSettingV2 UI 中移除 `capabilities.reasoningEffort` 复选框。
- 停止在 UI 中直接编辑旧 `options.unsupported` 入口。
- 旧字段暂不删除，但在源码类型定义与关键注释中标注 `@deprecated`。

### B. 收口到 compat 区域

- 在 compat 区域中保留并编辑：
  - `compat.thinking.enabled`
  - `compat.unsupported`
  - `compat.enabledByDefault`
- 数据层保持向后兼容：
  - 读取时可回退到旧字段
  - 新 UI 只写新字段
  - 旧字段继续保留以兼容旧配置，但应在源码中标注废弃语义

### C. 调整 UI 顺序

建议顺序：
1. reasoning / thinking 主配置
2. supportedEfforts
3. unsupported
4. enabledByDefault
5. customOverride（最后）

### D. 按 provider protocol 条件渲染

#### OpenAI 协议
显示：
- 启用 Reasoning
- Thinking 风格
- 支持的 Effort 级别
- Effort 值映射
- 不支持的参数
- 默认启用的参数
- 自定义参数覆盖

#### Claude 协议
显示：
- 启用 Reasoning
- 支持的 Effort 级别
- Claude thinking mode（建议命名：`claudeMode` 或 `thinkingMode`）
  - `adaptive`
  - `manual-budget`
- 不支持的参数
- 默认启用的参数
- 自定义参数覆盖

文案约束：
- 在 Effort 区域显式标注：`xhigh -> max`
- 不把 Claude 的模式选择叫作 `Thinking 风格`

隐藏：
- Thinking 风格（OpenAI-compatible 专属）
- Effort 值映射 textarea
- OpenAI 兼容路径专属提示

#### Gemini 协议
显示：
- 启用 Reasoning
- 支持的 Effort 级别
- 不支持的参数
- 默认启用的参数
- 自定义参数覆盖

文案约束：
- 在 Effort 区域说明：Gemini 最终走 `thinkingBudget` 数值预算，不是字符串 `max`

隐藏：
- Thinking 风格
- Effort 值映射

## Claude question: should Effort 值映射 default visible?

结论：**默认不显示 textarea，但应显示 supportedEfforts，并在 UI 上明确 `xhigh -> max`。**

理由：
- Claude 协议下 reasoning 映射基本固定，不像 OpenAI-compatible 模型那样需要声明 `thinkingStyle` 或自由字符串映射。
- 当前对用户真正有价值的是：
  - 哪些 effort 级别可用
  - `xhigh` 会映射到 `max`
  - 当前模型使用 `adaptive` 还是 `manual-budget`
- 因此不需要暴露通用 `effortMap` textarea，但需要保留 effort 级别控制和可见文案。

建议：
- Claude 默认隐藏 `effortMap` textarea。
- Claude 显示 `supportedEfforts`。
- 在 Claude UI 上标注：`xhigh -> max`。
- Claude 的两种写法单独建模为 `thinkingMode` / `claudeMode`，不要并入 `thinkingStyle`。

## Data Model Note

建议数据层增加 Claude 专属 thinking 模式字段，例如：

```ts
compat.thinking = {
  enabled: true,
  supportedEfforts?: ReasoningEffort[],
  thinkingStyle?: 'openai' | 'deepseek' | 'qwen',
  claudeMode?: 'adaptive' | 'manual-budget'
}
```

同时，旧字段保留但标注废弃，例如：

```ts
capabilities: {
  /** @deprecated use options.compat.thinking.enabled */
  reasoningEffort?: boolean;
}

options: {
  /** @deprecated use options.compat.unsupported */
  unsupported?: (keyof IChatCompleteOption | string)[];
}
```

语义边界：
- `thinkingStyle`：仅用于 OpenAI-compatible 协议差异
- `claudeMode`：仅用于 Claude 协议内部模式选择

## Recommendation

先做 revision：A + B + C + D，并追加一项 Claude 专属数据层调整：
- 为 Claude 增加 `claudeMode` / `thinkingMode`
- Claude / Gemini 显示 `supportedEfforts`
- Claude 标注 `xhigh -> max`
- Gemini 标注最终走 `thinkingBudget`

这样能消除当前 UI 错乱，同时把 Claude 新推荐的 `adaptive` 模式纳入正式设计。
