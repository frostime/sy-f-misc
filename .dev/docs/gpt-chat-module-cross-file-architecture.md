---
name: GPT Chat Module Cross-File Architecture
description: Cross-file call chains, implicit conventions, naming pitfalls, and design rationale for agents working on src/func/gpt/ — a wiki-map of vital knowledge not recoverable from single-file reads.
updated: 2026-05-03
scope:
  - /src/func/gpt/types.ts
  - /src/func/gpt/types-v2.ts
  - /src/func/gpt/model/config.ts
  - /src/func/gpt/model/config_migration.ts
  - /src/func/gpt/model/model_resolution.ts
  - /src/func/gpt/model/preset.ts
  - /src/func/gpt/model/storage.ts
  - /src/func/gpt/openai/complete.ts
  - /src/func/gpt/openai/adpater.ts
  - /src/func/gpt/openai/claude-complete.ts
  - /src/func/gpt/openai/gemini-complete.ts
  - /src/func/gpt/chat/main.tsx
  - /src/func/gpt/chat/session-setting.tsx
  - /src/func/gpt/chat/ChatSession/use-chat-session.ts
  - /src/func/gpt/chat/ChatSession/use-openai-endpoints.ts
  - /src/func/gpt/chat/ChatSession/use-tree-model.ts
  - /src/func/gpt/setting/ChatSetting.tsx
  - /src/func/gpt/setting/ProviderSettingV2.tsx
---

# GPT Chat Module — Cross-File Architecture

## Overview

`src/func/gpt/` 包含 ~160 文件、10 个子模块。Agent 单文件阅读无法理解的跨文件关系，以及隐式约定，记录在此。

---

## 1. Parameter Merge Chain（参数合并链）

最终发到 API 的 chat option 经过 **5 个文件、4 层合并**。修改任何一个环节都要理解它在链中的位置。

```
[1] model/config.ts: defaultConfig.chatOption
      ↓  defineProperty copy (main.tsx line ~120)
[2] chat/main.tsx: config (per-session storeRef)
      ↓  spread (session-setting.tsx → <ChatSetting config={config} />)
[3] chat/ChatSession/use-openai-endpoints.ts: buildChatOption()
      │  base = config().chatOption                    ← 来自 [2]
      │  merged = deepMerge(base, customOptions())     ← [4] 最高优先级
      │  + tools injection (toolExecutor)
      │  + delete null/undefined
      ↓  return option
[4] chat/main.tsx: session.modelCustomOptions signal
      │  set via editCustomOptions() JSON dialog
      │  OR via createEffect: model().config?.options?.customOverride
      ↓  becomes customOptions() in [3]
[5] openai/adpater.ts: adaptChatOptions(option, runtimeLLM)
      structuredClone → delete null → unsupported → limits → capabilities → deleteIfEqual
      → 最终 payload
```

**Merge priority（低→高）**：`defaultConfig` < `modelConfig.customOverride` < `session.customOptions`

**Agent trap**：`adpater.ts` 第 ~85 行 `customOverride` 注入**被注释掉了**。实际生效路径是 `main.tsx` 的 `createEffect`（监听 `model().config?.options?.customOverride` → `session.modelCustomOptions()`）。改 adapter 里的逻辑不会影响这条路径。

---

## 2. Context Building Chain（上下文构建链）

发送消息时，「哪些历史消息被附带」由 3 个文件协作决定：

```
chat/main.tsx: config().attachedHistory  (sliding window size, 默认 3)
    ↓
chat/ChatSession/use-chat-session.ts: getAttachedHistory(itemNum?, fromIndex?)
    → 调用 treeModel.getWorldLine() + 遍历规则
    ↓
chat/ChatSession/use-tree-model.ts:
    ├── separator: 上下文硬断点。遍历向前时遇到 separator → 停止（除非 pinned 在后面）
    ├── hidden: 跳过。但仅跳过构建上下文，UI 仍可见
    ├── pinned: 无视 separator + sliding window，强制包含
    └── 遍历方向: worldLine 末尾 ← 向前，直到收集够 attachedHistory 条
```

**规则优先级**：`pinned > separator > hidden > attachedHistory 数量限制`

**Agent trap**：`hidden` 对 `rerun` 有副作用——`use-openai-endpoints.ts` 的 `reRunMessage` 检查 `targetMsg.hidden`，若为 true 则拒绝 rerun 并 showMessage。

---

## 3. Model Resolution Chain（模型查询链）

```
model/config.ts: defaultModelId signal ("siyuan" 或 "modelName@providerName")
    ↓
model/model_resolution.ts: useModel(bareId, fallback?)
    ├── "siyuan" → 构造思源内置 IRuntimeLLM
    ├── "name@provider" → 在 llmProviders[] 中匹配
    │   ├── 匹配 config.model 或 displayName
    │   ├── 组装 url = baseUrl + endpoints[type]
    │   └── 返回 IRuntimeLLM { model, url, apiKey, protocol, config, provider }
    └── fallback='null' → 找不到返回 null（否则级联 fallback）
    ↓
model/model_resolution.ts: resolveEndpointUrl(provider, serviceType)
    baseUrl (trimTrailingSlash) + "/" + endpoints[type] (ensureLeadingSlash)
```

**Agent trap**：`fallback` 参数默认不传时，`useModel` 会级联尝试 defaultModelId → siyuan → utilityModelId → 硬编码 fallback URL。调用方传 `'null'` 则只查一次。

---

## 4. Protocol Dispatch（协议分发）

```
chat/ChatSession/use-openai-endpoints.ts: sendMessage()
    → model().type 决定走哪个 handler
    ├── 'chat' → chatHandler.execute()
    │     → gpt.complete() in openai/complete.ts
    │         → getProviderProtocol(model) → 'openai'|'claude'|'gemini'
    │         ├── claude → claudeComplete() in openai/claude-complete.ts
    │         ├── gemini → geminiComplete() in openai/gemini-complete.ts
    │         └── openai → 内联 fetch in openai/complete.ts
    ├── 'image-gen' → imageHandler.generate() in openai/images.ts
    ├── 'audio-stt' → audioHandler.transcribe() in openai/audio.ts
    └── 'audio-tts' → audioHandler.speak() in openai/audio.ts
```

**Claude/Gemini 的 thinking 参数现状**：两个协议的 `buildXxxPayload` 都将 unknown keys 透传（`knownKeys` set 之外的字段直接 `payload[key] = value`）。这意味着如果用户在 customOptions 里手写 Claude 的 `thinking` 对象，它会被透传——但没有任何结构化处理，完全靠用户手动填 JSON。

---

## 5. Naming Pitfalls（命名陷阱）

| 实际文件名/字段 | 正确拼写 | 影响 |
|----------------|---------|------|
| `openai/adpater.ts` | adapter | grep "adapter" 找不到这个文件 |
| `ILLMProviderV2.protocal` | protocol | 为了兼容旧数据，两个字段共存。`getProviderProtocol()` 同时读两者 |
| `IChatSessionMsgItemV2.type = 'separator'`（V2） | separator | V1 里拼写是 `seperator`。代码中有兼容转换但 grep 时要注意 |

---

## 6. Schema Migration Pattern（配置迁移模式）

`model/config_migration.ts` — `CURRENT_SCHEMA = '3.1'`，迁移函数 `历史版本兼容()` 按版本号递增比较：

```
compareSchemaVersion(dataSchema, targetVersion) < 0 → 执行迁移块
  1.5: modelId → defaultModelId
  1.6: autoTitleModelId → utilityModelId
  2.0: IGPTProvider[] → ILLMProviderV2[] (大改)
  2.1: 隐私配置从 globalMiscConfigs 移到 config
  3.0: 工具权限配置清理旧格式
  3.1: protocol/protocal 字段归一化
```

每个迁移块最后 `migrated = true`，函数末尾 `data.schema = CURRENT_SCHEMA`。`model/storage.ts` 的 `load()` 调用 `deepMerge(defaultData, migratedData)` 再分发到各个 signal/store。

**Agent trap**：新增迁移时，必须**同时更新** `model/config.ts` 的 `asStorage()`（如果新增了 store 字段）和 `CURRENT_SCHEMA`。

---

## 7. Model Preset Matching（模型预设匹配）

`model/preset.ts` — `createModelConfig(modelName)` 按优先级遍历 `MODEL_PRESETS`：

```
MODEL_PRESETS (从上到下，越具体越靠前)
  ├── gpt-5.1, gpt-5, gpt-4.1, gpt-4o, gpt (兜底)
  ├── claude-*
  ├── gemini-*
  ├── deepseek-v3.2, deepseek-v3.1, deepseek-r1, deepseek-v3, deepseek-chat
  ├── qwen3, qwq, qwen-vl, qwen (兜底)
  ├── glm-4.x
  ├── embedding 模型 (bge, m3e, gte, …)
  └── 图像模型 (dall-e, flux, …)
```

匹配规则：`keyword.test(modelName)`（Regex）或 `modelName.includes(keyword)`（string）。第一个命中 → `deepMerge(DEFAULT_CHAT_CONFIG, preset.config)` → 返回。

**Agent trap**：预设的顺序很重要。`/^gpt[-_]/i` 兜底在最后，但 `gpt-5`, `gpt-4o` 等在前。新增模型必须考虑是否被已有正则捕获。

---

## 8. V2 Tree Model Rationale（V2 树模型设计意图）

`types-v2.ts` 注释中说明了为什么不把 version 和 branch 做关联绑定：

- **version**：同一问题的多个回答（不同模型或 rerun），存储在 `versions: Record<string, IMessagePayload>`
- **branch**：从某个节点分叉出不同的 worldLine（用户手动操作）
- **两者不关联**：如果 version 切换自动改变 branch 结构，逻辑会很复杂。当前设计把 version 选择和 branch 选择作为正交操作。
- **separator 放在 V2 中而非 V1**：V1 的 separator 只是 UI 概念；V2 中它是真实的数据节点（`type: 'separator'`，`currentVersionId: ''`，`versions: {}`），上下文构建逻辑直接读取节点类型而非外部标记。

---

## 9. The Session-Setting Reuse Pattern

`chat/session-setting.tsx` 通过 Context Provider 模式复用全局设置 UI：

```
session-setting.tsx
  → useSimpleContext() 拿到 { model, config, session }
  → 渲染 <ChatSetting config={config} />  ← 直接复用 setting/ChatSetting
```

这意味着 **ChatSetting 的任何修改会自动同时影响全局设置和会话内设置**。不需要改两处。

**Agent trap**：但 ChatSetting 内部通过 `config.update('chatOption', key, value)` 写入。如果 ChatSetting 的逻辑改了但 `IChatSessionConfig` 的类型没同步，编译不会报错（因为 `update` 是泛型 dynamic key）。
