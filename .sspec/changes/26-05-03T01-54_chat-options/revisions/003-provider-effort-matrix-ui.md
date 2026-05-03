---
revision: 3
date: 2026-05-03T21:14:33
trigger: "scope-expansion"
---

# provider-effort-matrix-ui

## Reason
用户要求将 Provider 模型配置中的 `supportedEfforts` 与 `effortMap` 合并为一个更适合人的操作组件，避免直接编辑 JSON；同时要求评估 Claude / Gemini 的官方 thinking 策略与当前代码是否一致。

## Changes

### Spec Impact
- Provider 面板中的 Effort 配置从“支持级别 + JSON 映射”改为单一的 Effort Matrix 交互组件。
- 所有 protocol 都显示该组件，但右侧控件按 protocol 语义变化：
  - OpenAI: 字符串映射
  - Claude adaptive: 只读映射提示
  - Claude manual-budget: 数字 budget
  - Gemini: 数字 budget
- `supportedEfforts` 的既有语义保持不变：留空表示全部支持。
- `none` 保持为标准 reasoning effort，纳入同一组件。

### Design Impact
- `ProviderSettingV2.tsx` 中删除原 `supportedEfforts` checkbox 区和 `effortMap` JSON textarea，替换为新的表格式组件。
- 新组件统一读写 `supportedEfforts`，并按 protocol 分别读写 `effortMap` / `budgetMap`。
- Gemini runtime 补一处语义对齐：当 `reasoning_effort === 'none'` 时显式发送 `thinkingBudget: 0`，避免 UI 的“关闭 thinking”与实际请求语义不一致。
- Claude runtime 保持当前总体策略，仅在 UI 上体现 adaptive / manual-budget 的不同编辑语义。

### Task Impact
- 在 Provider compat 面板任务下追加 Effort Matrix UI 改造。
- 在 Gemini thinking 注入任务下追加 `none -> thinkingBudget: 0` 语义修复。
