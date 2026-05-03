---
change: "chat-options"
created: 2026-05-03T01:54:11
---

# Memory: chat-options

## State

Implementation complete. 8 个 phase 已完成，TypeScript 检查通过，`pnpm run build` 通过。当前等待用户在思源中做手工验收。

## Key Files

- `src/func/gpt/openai/adpater.ts` — `applyOptionCompat` + `adaptChatOptions` 重写核心；处理 toggle 删除、unsupported、thinkingStyle 注入、supportedEfforts clamp
- `src/func/gpt/setting/ChatSetting.tsx` — UI 改动最大的文件，6 个 toggle + Reasoning / 采样参数 section
- `src/func/gpt/setting/ProviderSettingV2.tsx` — 模型 compat panel 新增：thinking enabled / thinkingStyle / supportedEfforts / effortMap / enabledByDefault
- `src/func/gpt/model/preset.ts` — MODEL_PRESETS 补齐 compat（GPT-5.x / DeepSeek / Claude / Gemini）
- `src/func/gpt/model/config_migration.ts` — schema 3.1 → 3.2 迁移：旧值保留 + toggle 全开 + capabilities.reasoningEffort 映射
- `src/func/gpt/chat/main.tsx` — toolbar 温度显示空值安全；读取 compat.enabledByDefault 初始化 toggle 默认值
- `src/func/gpt/openai/claude-complete.ts` — Claude thinking block 注入 + budget 映射 + 阻止 reasoning_effort 透传
- `src/func/gpt/openai/gemini-complete.ts` — Gemini thinkingConfig 注入 + 阻止 reasoning_effort 透传
- `reference/chat-thread-export_R1-Deisgn.xml` — 上一轮设计讨论导出记录（R1）
- `reference/chat-thread-export_R2-Implement.xml` — 本轮实现讨论导出记录（R2）

## Knowledge

### Research

- [2026-05-03T01:54] [Insight] **Pi Coding Agent 的 compat 架构**：`thinkingLevel` 作为顶级归一化概念，`thinkingLevelMap` 映射到各 API 原生值，`thinkingFormat`（`openai`/`deepseek`/`zai`/`qwen`/`openrouter`/`qwen-chat-template`）指定参数封装风格。Pi 做了 URL-based auto-detection（如 `isDeepSeek` 从 baseUrl 推断），用户可显式覆盖。我们还参考了 `simple-options.ts` 中的 `clampReasoning` 和 `adjustMaxTokensForThinking`。
- [2026-05-03T01:54] [Insight] **OpenCode 的 protocol-per-client 架构**：每个 provider 独立实现 client（`AnthropicClient`、`OpenAIClient` 等），不做跨协议归一化。`model.CanReason` 只是一个 boolean。
- [2026-05-03T01:54] [Insight] **OpenAI Chat Completions 官方 spec**：`reasoning_effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"`，扁平 string。无 `thinking: {type: "enabled"}`。来源：`https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/index.md`。
- [2026-05-03T01:54] [Insight] **OpenAI Responses API 用了不同的格式**：`reasoning: {effort: "low"}` 嵌套对象。这是新版 API，当前项目不走此路径。
- [2026-05-03T01:54] [Insight] **`thinking: {type: "enabled"}` 是 DeepSeek 私有扩展**：通过 `extra_body` 传入 OpenAI SDK，非 OpenAI 标准。DeepSeek API 文档 `https://api-docs.deepseek.com/guides/thinking_mode` 确认了这一点。
- [2026-05-03T01:54] [Insight] **OpenRouter 使用 `reasoning: {effort: "medium"}` 嵌套格式**：与 OpenAI Responses API 结构一致，语义是「透传给底层 provider」。
- [2026-05-03T01:54] [Insight] **Qwen3 使用 `enable_thinking: true` 或 `chat_template_kwargs: {enable_thinking: true}`**：Pi 同时支持两种（`qwen` vs `qwen-chat-template`），Qwen3 cloud API 用前者，本地模型可能用后者。
- [2026-05-03T02:30] [Insight] **Code-reviewer subagent 审计发现**：原 design 有 7 个缺陷——迁移删除旧值（与 "保持兼容" 矛盾）、枚举口径不一致、`enabledByDefault` 被误用作 runtime 过滤器、`main.tsx` 空值崩溃风险、Scope Summary 文件归属错误、Claude/Gemini thinking payload 未定义、`supportedEfforts`/`budgetMap` 定义但未消费。全部已修复。
- [2026-05-03T03:00] [Insight] **第二轮审计（pure-agent + gpt-5.4）发现 7 个问题**：`IChatCompleteOption.reasoning_effort` 类型未扩展至 6 级、`xhigh` budget 无默认值、memory.md 与 spec 枚举冲突、memory.md 迁移策略冲突、`enabledByDefault` 所有权模糊、`main.tsx` toggle-off UX 未定义、命名 `optionCompat` vs `options.compat` 不一致。全部已修复。
- [2026-05-03T04:20] [Insight] **`reasoning_effort` 在 Claude/Gemini builder 中必须阻止透传**：两者 payload builder 都有“未知 key 直接透传”逻辑；如果不把 `reasoning_effort` 加入 knownKeys，会在 thinking 已转译为 Claude `thinking` / Gemini `thinkingConfig` 后仍把原字段顶层发出去。
- [2026-05-03T04:20] [Insight] **`toggles` 最小侵入接入方式 = 透传给 `complete()` 再进 adapter**：相比在 20+ 消费点改 `IChatCompleteOption` leaf type，给 `complete()` / `adaptChatOptions()` 增加可选 `toggles` 参数可以保持核心数据流稳定。

### Decisions

- [2026-05-03T01:54] [Decision] **`chatOptionToggles` 采用旁路字段方案（方案 B）而非改 leaf type（方案 A）**：方案 A 改 `IChatCompleteOption` 所有字段类型，侵入 20+ 消费点。方案 B 只在 adapter 和 UI 层增加逻辑，数据流核心不动。
- [2026-05-03T01:54] [Decision] **全局默认值清空而非保持**：用户选择「默认不设置，让 API 自行决定」。temperature=0.7 等历史预设值在迁移中删除，stream 保留（因为已有独立开关）。
- [2026-05-03T01:54] [Decision] **reasoning_effort 留在 `IChatCompleteOption` 而非提升为顶级字段**：用户明确「设计上属于 chatOption，UX 上突出」。Pi 选择提升，但本项目协议复杂度较低，不提升可以接受。
- [2026-05-03T01:54] [Decision] **thinking 风格用 `thinkingStyle` 命名而非 `thinkingFormat`**：用户指出 `format` 语义模糊，我们将其重命名为 `thinkingStyle`，描述行为差异（额外发送 `thinking: {type}` vs 发 `enable_thinking` vs 只发 `reasoning_effort`）而非格式。
- [2026-05-03T01:54] [Decision] **6 级别归一化（`none`/`minimal`/`low`/`medium`/`high`/`xhigh`）匹配 OpenAI 官方值**：用户倾向 Pi 同款，且这是 OpenAI 官方定义的全集。`none` 保留为第一级别，对齐官方 spec。
- [2026-05-03T01:54] [Decision] **toggle 覆盖范围 = ChatSetting UI 中已有的 6 个采样参数 + reasoning_effort**：用户指示「检查 UI 上有哪些参数就保留给用户操作」。stream 已是 boolean 无需额外 toggle。tools 等有独立控制机制。
- [2026-05-03T01:54] [Decision] **`paramFormat`（字段名映射）defer**：当前三种协议 builder 已各自处理（`top_p`→`topP`、`stop`→`stop_sequences`），此次不碰。等到有 OpenAI 兼容但字段名不同的模型时再加。
- [2026-05-03T01:54] [Decision] **per-model 预设只做简化 panel，不嵌入完整 ChatSetting**：用户选择简化面板（reasoning 级别 + 启用参数列表 + 少数默认值）。完整 ChatSetting 嵌入留作未来方向。
- [2026-05-03T01:54] [Decision] **迁移策略：旧 toggle 全开，旧值保留**：`chatOptionToggles[key] = true` 对已有值的所有 key；不删除旧用户的 temperature 等值。老用户行为完全不变。`defaultConfig.chatOption` 清空仅对新安装用户生效。
- [2026-05-03T03:00] [Decision] **命名约定**：概念层面称 `optionCompat`（文档、讨论），落地字段为 `ILLMConfigV2.options.compat`。`ConfigurableChatOption` 收窄 `enabledByDefault` 的值域到 6 个 UI 可控参数。
- [2026-05-03T01:54] [Decision] **`capabilities.reasoningEffort` 不删除，只追加写入 `optionCompat.thinking.enabled`**：保持向后兼容，迁移代码同时写两处。
- [2026-05-03T04:20] [Decision] **`enabledByDefault` 的初始化落点放在 `main.tsx` 的 model-change effect**：这里本来已处理 `customOverride` 注入；同处增加 `compat.enabledByDefault` → `chatOptionToggles` 的默认填充，改动最小。
- [2026-05-03T04:20] [Decision] **memory / tasks / spec 文档避免 emoji 依赖**：用户环境下 `.md` 文件可能因编码或 shell 替换导致 emoji 损坏；后续状态文件优先使用 ASCII 标记（如 `[x]`, `Done`, `->`）。

### Constraints

- [2026-05-03T01:54] [Constraint] **不能破坏现有用户的配置**：迁移必须保持旧行为——toggle 全开 + 旧值保留。用户需手动关闭不想要的参数。
- [2026-05-03T01:54] [Constraint] **`IChatCompleteOption` 类型不能改**：大量消费点（chat、adapter、protocol builders、UI）直接读写 option 值，类型变更代价过高。
- [2026-05-03T01:54] [Constraint] **Schema 必须 bump 到 3.2**：遵循现有 `compareSchemaVersion` + `历史版本兼容()` 增量迁移模式。

### Gotchas

- [2026-05-03T01:54] [Gotcha] **`adaptChatOptions` 中 `customOverride` 被注释掉了**：第 85 行 `// Object.assign(chatOption, config.options.customOverride)`。但 `main.tsx` 通过 `createEffect` 把 `customOverride` 注入到 `session.modelCustomOptions`。这意味着 customOverride 走了另一条路径——不是 adapter 层而是 session 层。设计中需注意不要双重应用。
- [2026-05-03T01:54] [Gotcha] **`deleteIfEqual(chatOption, 'top_p', 1)` 只在值为 1 时删除**：但 top_p 默认值也是 1。如果用户设 top_p=0.5，它会发；如果设 top_p=1 或 undefined，它会删。行为正确但语义模糊——用户不知道规则。
- [2026-05-03T01:54] [Gotcha] **`buildClaudePayload` 和 `buildGeminiPayload` 把 `option` 的未知 key 直接透传**（`Object.entries(option).forEach(([key, value]) => {...payload[key] = value})`）。这意味着 `thinking` 注入到 option 后会自动透传给 Claude/Gemini，但 Claude/Gemini 可能不认识。需要确认 Claude 的 `thinking` block 和 Gemini 的 `thinkingConfig` 是否冲突。
- [2026-05-03T01:54] [Gotcha] **`chatOptionToggles` 的 key 不存在语义**：需要明确定义——key 不存在 = toggle=true（兼容旧数据，旧数据无 toggle 字段）。这个语义在 `applyOptionCompat` 中实现。
- [2026-05-03T01:54] [Gotcha] **DeepSeek R1 不支持任何采样参数**：如果用户启用 temperature toggle 并发给 DeepSeek R1，API 会报错。当前靠 `unsupported` 列表保护，新系统中要确认这个路径仍然生效。
- [2026-05-03T01:54] [Gotcha] **`enabledByDefault` 和 `chatOptionToggles` 的交互**（已修复）：原设计把 `enabledByDefault` 当 runtime 过滤器（不在列表就删），会误删 `tools`/`stream` 等。修复后 `enabledByDefault` 仅用于 session 初始化时填充 toggle 默认值，不参与 adapter 过滤。
- [2026-05-03T02:30] [Gotcha] **`main.tsx` 空值崩溃**：`config().chatOption.temperature.toFixed(2)` 在清空默认值后必然崩。修复：加空值检查 + toolbar 显示适配 toggle 语义。
- [2026-05-03T02:30] [Gotcha] **`CURRENT_SCHEMA` 位置**：在 `config_migration.ts` 而非 `config.ts`。Scope Summary 已修正。
- [2026-05-03T04:20] [Gotcha] **`complete()` 自己声明了内联 options 类型**：不仅有 `protocol-utils.ts` 的 `CompleteOptions`，`openai/complete.ts` 也自己定义了 options 结构；给 `toggles` 加字段时两处都要改。
- [2026-05-03T04:35] [Gotcha] **PowerShell / shell 替换可能破坏 UTF-8 emoji**：对 `tasks.md` 的批量替换曾导致 `⏳` / `✅` 变成乱码；已改为纯 ASCII 状态标记并重写文件。

### Rejected

- [2026-05-03T01:54] [Rejected] **改 `IChatCompleteOption` 的 leaf type 为 `{enabled, value}`**：侵入性太大，20+ 消费点需要改动，用户也不倾向。
- [2026-05-03T01:54] [Rejected] **`thinkingFormat` 命名**：用户认为 `format` 模糊化语义，改用 `thinkingStyle`——它不是在描述「格式」，而是在描述「是否需要 + 如何发送 enable-thinking 信号」。
- [2026-05-03T01:54] [Rejected] **在 `thinkingStyle` 中加入 `responses`（OpenAI Responses API）和 `openrouter`**：当前项目不用 Responses API，OpenRouter 可通过 `standard` + `effortMap` 覆盖。按需添加，不在初期引入未使用的枚举值。
- [2026-05-03T01:54] [Rejected] **`paramFormat` 字段名映射**：三种协议 builder 已各自处理，没有新的 OpenAI 兼容模型需要字段名差异。等具体需求出现再加。
- [2026-05-03T01:54] [Rejected] **per-model 预设嵌入完整 ChatSetting 组件**：UI 过于复杂，用户选择简化面板。

## Milestones

- [2026-05-03T00:36] Request created: chat-options
- [2026-05-03T01:00] Clarify: 完成代码阅读（12 个关键文件），覆盖 adapter、ChatSetting、ProviderSettingV2、三种协议 complete、preset、migration
- [2026-05-03T01:30] Clarify: 完成 Pi Coding Agent + OpenCode + OpenAI 官方 spec 调研
- [2026-05-03T01:54] Design: change 创建，spec.md + design.md + memory.md 初始填充
- [2026-05-03T02:00] Design: memory.md 补充完整——所有 research 发现、decisions、gotchas、rejected 记录完毕
- [2026-05-03T02:30] Review: code-reviewer subagent 审计发现 7 个问题 → 全部验证通过并修复
- [2026-05-03T03:00] Review: pure-agent + gpt-5.4 二轮审计发现 7 个问题（2 🛑 + 4 ⚠️ + 1 💡）→ 全部验证通过并修复
- [2026-05-03T04:05] Plan: tasks.md 拆分为 8 个 phase，覆盖 types/config、adapter、protocol builder、preset、migration、ChatSetting、ProviderSettingV2、main.tsx
- [2026-05-03T04:05] Implement: 完成全部 8 个 phase 代码改动
- [2026-05-03T04:15] Verify: `npx tsc --noEmit` 通过
- [2026-05-03T04:16] Verify: `pnpm run build` 通过
- [2026-05-03T04:35] Maintenance: `tasks.md` 因 emoji 编码损坏，已重写为 ASCII 状态标记版本
- [2026-05-03T04:40] Reference: 记录 `reference/chat-thread-export_R1-Deisgn.xml`（设计会话导出）与 `reference/chat-thread-export_R2-Implement.xml`（实现会话导出）供后续 agent 追溯因果
