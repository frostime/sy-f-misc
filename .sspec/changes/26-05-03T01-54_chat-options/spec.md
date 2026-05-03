---
name: chat-options
status: DONE
change-type: single
created: 2026-05-03 01:54:11
reference:
  - source: .sspec/requests/26-05-03T00-36_chat-options.md
    type: request
    note: Linked from request
  - source: .sspec/changes/26-05-03T01-54_chat-options/revisions/003-provider-effort-matrix-ui.md
    type: revision
    note: Provider effort matrix UI + Gemini none semantics
---

# chat-options

## Problem Statement

`IChatCompleteOption` 的参数管理存在三个问题，导致用户无法精确控制发送给 LLM 的参数：

1. **隐性开关**：参数值永远存储在 config 中，`adaptChatOptions` 末尾用 `deleteIfEqual(key, 默认值)` 决定是否删除。用户无法区分「我主动设为 0」和「我只是没改、恰好默认值是 0」。例如 `frequency_penalty: 0` 总被删除——但如果用户就想发 `frequency_penalty: 0` 呢？
2. **reasoning_effort 淹没**：它是 `IChatCompleteOption` 的普通字段，UI 上是与 temperature 平级的普通下拉框，但它的重要性远超采样参数——不同 reasoning effort 对输出质量有本质影响。
3. **跨协议兼容散落四处**：thinking 参数格式差异（GPT 的 `reasoning_effort` vs DeepSeek 的 `thinking: {type}` vs Qwen 的 `enable_thinking`）没有统一处理——要么靠用户手写 JSON override，要么完全缺失，要么靠历史遗留的 `capabilities.reasoningEffort` boolean。

## Proposed Solution

### Approach

三个层面解决：

1. **显式开关**：为 `IChatSessionConfig` 新增 `chatOptionToggles` 旁路字段（`Record<string, boolean>`），不改动 `IChatCompleteOption` 类型。Toggle=false → 参数不发送，toggle=true → 发送（哪怕值等于 API 默认值）。ChatSetting UI 为 6 个采样参数各加一个 checkbox。

2. **`optionCompat` 统一兼容配置**：在 `ILLMConfigV2.options` 下新增 `compat` 字段，收敛 thinking 格式声明、不支持的参数列表、默认启用参数。替代散落在 `capabilities`、`options.unsupported`、硬编码 `deleteIfEqual` 中的逻辑。

3. **清空全局默认值**：`defaultConfig.chatOption` 不再预设 temperature=0.7 等采样参数值，让 API 自行使用内部默认。用户在 per-session 或 per-model 中显式开启。

reasoning_effort 保持为 `IChatCompleteOption` 字段（不提升为顶级设置），但 UI 上独立成 section 以突出其重要性。

### Key Change

**Feat A: `chatOptionToggles` 机制 + `IChatCompleteOption.reasoning_effort` 类型扩展**

- `IChatSessionConfig` 新增 `chatOptionToggles?: Partial<Record<keyof IChatCompleteOption, boolean>>`
- `IChatCompleteOption.reasoning_effort` 类型从 `'none' | 'low' | 'medium' | 'high'`（4 级）扩展为 `ReasoningEffort`（6 级：`'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'`）
- ChatSetting 中 6 个参数（temperature、max_tokens、top_p、presence_penalty、frequency_penalty、reasoning_effort）各加 toggle checkbox。`stream` 本身是 boolean 无需额外 toggle

**Feat B: `optionCompat` 结构化兼容配置**

`ILLMConfigV2.options` 新增 `compat?: ILLMOptionCompat`：

```typescript
// ChatSetting UI 中用户可手动开关的参数（共 6 个）
type ConfigurableChatOption = 'temperature' | 'max_tokens' | 'top_p'
  | 'frequency_penalty' | 'presence_penalty' | 'reasoning_effort';

interface ILLMOptionCompat {
  unsupported?: (keyof IChatCompleteOption)[];
  /** 该模型默认启用哪些可配置参数（仅限 ConfigurableChatOption 键）。
      用于初始化 session 的 chatOptionToggles，不参与 runtime 过滤 */
  enabledByDefault?: ConfigurableChatOption[];
  thinking?: {
    enabled: boolean;
    thinkingStyle?: 'openai' | 'deepseek' | 'qwen';
    supportedEfforts?: ReasoningEffort[];
    effortMap?: Partial<Record<ReasoningEffort, string>>;
    budgetMap?: Partial<Record<ReasoningEffort, number>>;
  };
}
```

**Feat C: Adapter 重写**

`adaptChatOptions` → 拆为两步：

1. `applyOptionCompat(option, toggles, compat)`：
   - Toggle 检查：`chatOptionToggles[key] === false` → 删除 key
   - `compat.unsupported` → 删除 key
   - `compat.thinking` → 按 `thinkingStyle` 注入对应参数
   - `compat.thinking.supportedEfforts` → 二次校验：如果 effort 不在 supportedEfforts 中，clamp 到最近可用值
2. 保留 limits clamp、capabilities 检查（在 adapter 末尾）

`enabledByDefault` 不在 adapter 层消费——它只用于初始化 session 的 toggle 默认值，不影响 runtime payload。

**Feat D: ChatSetting UI 改进**

- 推理参数独立 section（Reasoning Effort），视觉上与采样参数区分
- 采样参数每个前加 toggle checkbox
- `chatOptionToggles` 持久化到 config

**Feat E: Provider 配置面板补充**

`ProviderSettingV2` 的模型配置面板新增「参数兼容」section：
- thinking: enabled / thinkingStyle / supportedEfforts
- effortMap（JSON，按需）
- unsupported（已有，类型收紧）
- enabledByDefault（多选）

**Feat F: 模型预设更新**

`preset.ts` 中所有 MODEL_PRESETS 补齐 `options.compat`，特别是 DeepSeek 系列的 `thinkingStyle: 'deepseek'`。

**Feat G: Schema 迁移 3.1 → 3.2**

- 旧 `chatOption` 值 → 对应 `chatOptionToggles[key] = true`（全开）
- **旧 `chatOption` 值保留不动**（不删除老用户的 temperature 等已配置值）
- `config.ts` 的 `defaultConfig.chatOption` 仅对**新安装用户**清空采样参数预设值
- `capabilities.reasoningEffort` → 写入 `optionCompat.thinking.enabled`（不删除旧字段）
- `options.unsupported` 保留
- `options.customOverride` 保留但标记 deprecated

### Scope Summary

| 文件 | 变更 |
|------|------|
| `src/func/gpt/types.ts` | + `ReasoningEffort`, `ILLMOptionCompat`, `chatOptionToggles` |
| `src/func/gpt/model/config.ts` | 清空 defaultConfig 预设值（仅新安装用户生效） |
| `src/func/gpt/model/config_migration.ts` | bump CURRENT_SCHEMA（位于此文件），3.1→3.2 migration logic |
| `src/func/gpt/model/storage.ts` | 验证 deepMerge 路径兼容性：新 defaultData 结构 + 旧 data merge |
| `src/func/gpt/model/preset.ts` | 所有 MODEL_PRESETS 补齐 `options.compat` |
| `src/func/gpt/openai/adpater.ts` | 重写 `adaptChatOptions`，新增 `applyOptionCompat` |
| `src/func/gpt/openai/complete.ts` | 集成 thinking 风格参数注入 |
| `src/func/gpt/openai/claude-complete.ts` | `buildClaudePayload` 支持 thinking budget |
| `src/func/gpt/openai/gemini-complete.ts` | `buildGeminiPayload` 支持 thinking |
| `src/func/gpt/chat/ChatSession/use-openai-endpoints.ts` | `buildChatOption` 集成新 adapter |
| `src/func/gpt/chat/ChatSession/use-chat-session.ts` | session 初始化时从 `compat.enabledByDefault` 设置 toggles 默认值 |
| `src/func/gpt/setting/ChatSetting.tsx` | toggle checkbox + reasoning section 提升 |
| `src/func/gpt/setting/ProviderSettingV2.tsx` | 模型配置面板新增 compat section |
| `src/func/gpt/chat/main.tsx` | 修复 temperature 空值安全 + toolbar toggle-off 显示「API 默认」+ 快捷调参入口 |

**不在此次范围内**：
- `paramFormat`（字段名映射，如 `stop` vs `stop_sequences`）——当前三种协议 builder 各自处理
- Responses API 的 `reasoning: { effort }` 嵌套格式——等需要时再加
- per-model 预设的完整可视化（完整 ChatSetting 嵌入）——仅做简化 panel

### Design Reference

→ 参见 [design.md](./design.md)

### Revisions

- [001-provider-panel-cleanup](./revisions/001-provider-panel-cleanup.md) — Provider panel cleanup + Claude adaptive thinking
- [002-session-reasoning-menu-cleanup](./revisions/002-session-reasoning-menu-cleanup.md) — Session reasoning / quick menu cleanup + 3.2 migration补全
