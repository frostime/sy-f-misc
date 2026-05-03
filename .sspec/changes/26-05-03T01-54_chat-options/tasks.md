---
change: "chat-options"
updated: "2026-05-03"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

---

### Phase 1: 类型 + 基础数据定义 [x]

- [x] `src/func/gpt/types.ts` — 新增 `ReasoningEffort`、`ConfigurableChatOption`、`ILLMOptionCompat`；扩展 `IChatCompleteOption.reasoning_effort` 至 6 级；`IChatSessionConfig` 新增 `chatOptionToggles`
- [x] `src/func/gpt/model/config.ts` — 清空 `defaultConfig.chatOption` 的采样参数预设值（仅保留 `stream: true`）；`chatOptionToggles` 默认不设

**Verification**: `tsc --noEmit` 通过；`defaultConfig.chatOption` 只剩 `stream: true`

---

### Phase 2: Adapter 重写 [x]

- [x] `src/func/gpt/openai/adpater.ts` — 新增 `applyOptionCompat(option, toggles, compat)`（含 `clampEffort`）；重写 `adaptChatOptions` 集成 `applyOptionCompat`；签名扩展增加可选 `toggles` 参数
- [x] `src/func/gpt/openai/complete.ts` — `complete()` options 增加可选 `toggles`；调用 `adaptChatOptions` 时透传
- [x] `src/func/gpt/openai/protocol-utils.ts` — `CompleteOptions` 增加 `toggles`
- [x] `src/func/gpt/chat/ChatSession/use-openai-endpoints.ts` — 调用 `gpt.complete` 时把 `config().chatOptionToggles` 传入

**Verification**: 构建无报错；toggle=false 的 key 被删除

---

### Phase 3: Claude / Gemini thinking 注入 [x]

- [x] `src/func/gpt/openai/claude-complete.ts` — `buildClaudePayload` 读取 `compat.thinking`，注入 `thinking: {type, budget_tokens}`；把 `reasoning_effort` 加入 knownKeys
- [x] `src/func/gpt/openai/gemini-complete.ts` — `buildGeminiPayload` 读取 `compat.thinking`，注入 `generationConfig.thinkingConfig`；把 `reasoning_effort` 加入 knownKeys 阻止透传

**Verification**: knownKeys 包含 `reasoning_effort`；DEFAULT_THINKING_BUDGETS 常量定义正确

---

### Phase 4: 模型预设补齐 [x]

- [x] `src/func/gpt/model/preset.ts` — DeepSeek V3.1/V3.2、DeepSeek R1、GPT-5.x、Claude 兜底、Gemini 兜底 补齐 `options.compat`

**Verification**: 每个需要 thinking 的模型都有 `compat.thinking.enabled: true`

---

### Phase 5: Schema 迁移 3.1 -> 3.2 [x]

- [x] `src/func/gpt/model/config_migration.ts` — bump `CURRENT_SCHEMA` 至 `'3.2'`；新增迁移块：旧 `chatOption` 有值的 key -> `chatOptionToggles[key] = true`（旧值保留）；`capabilities.reasoningEffort` -> `options.compat.thinking.enabled`

**Verification**: 构建通过；迁移逻辑不删除旧值

---

### Phase 6: ChatSetting UI [x]

- [x] `src/func/gpt/setting/ChatSetting.tsx` — 6 个采样参数各加 toggle checkbox，控制 `chatOptionToggles`；reasoning_effort 独立 Reasoning section；采样参数独立 section

**Verification**: 打开设置面板，每个参数左侧有 checkbox

---

### Phase 7: ProviderSettingV2 compat 面板 [x]

- [x] `src/func/gpt/setting/ProviderSettingV2.tsx` — 模型配置面板新增参数兼容 section：thinking enabled checkbox、thinkingStyle select、supportedEfforts 多选、effortMap JSON textarea、enabledByDefault 多选
- [ ] `src/func/gpt/setting/ProviderSettingV2.tsx` — 将 `supportedEfforts` + `effortMap` 合并为单一 Effort Matrix 组件；所有 protocol 都显示，但右侧编辑控件按 protocol 区分（OpenAI=字符串映射，Claude adaptive=只读映射提示，Claude manual-budget=budget 输入，Gemini=budget 输入）
- [ ] `src/func/gpt/openai/gemini-complete.ts` — `reasoning_effort === 'none'` 时显式发送 `thinkingBudget: 0`

**Verification**: 打开模型配置面板，能看到参数兼容 section；修改后保存能持久化

### Feedback Tasks (→ [003-provider-effort-matrix-ui](./revisions/003-provider-effort-matrix-ui.md))
- [x] Provider Effort Matrix UI 合并 supported levels / mapping editor
- [x] Gemini `none` thinking 语义与 UI 对齐

---

### Phase 8: main.tsx 空值安全 + enabledByDefault 初始化 [x]

- [x] `src/func/gpt/chat/main.tsx` — 修复两处 `temperature.toFixed(2)` 空值崩溃；toggle=false 或值 undefined -> 显示「API 默认」文本
- [x] `src/func/gpt/chat/main.tsx` — model 切换 effect 中读取 `compat.enabledByDefault`，写入 `chatOptionToggles` 初始值

**Verification**: 清空 temperature 默认值后打开 toolbar menu 不崩溃

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: 类型 + 基础数据 | 100% | Done |
| Phase 2: Adapter 重写 | 100% | Done |
| Phase 3: Claude/Gemini thinking | 100% | Done |
| Phase 4: 模型预设 | 100% | Done |
| Phase 5: Schema 迁移 | 100% | Done |
| Phase 6: ChatSetting UI | 100% | Done |
| Phase 7: ProviderSettingV2 | 100% | Done |
| Phase 8: main.tsx + session init | 100% | Done |

**Recent**:
- 2026-05-03: 全部 8 个 Phase 实现完毕，构建通过
