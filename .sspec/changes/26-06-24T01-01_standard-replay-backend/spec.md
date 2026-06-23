---
name: standard-replay-backend
status: PLANNING
change-type: sub
created: 2026-06-24T01:01:03
reference:
- source: .sspec/changes/26-06-24T01-00_standard-tool-call
  type: root-change
  note: "Phase 1: standard-replay-backend"
---

# standard-replay-backend

## Problem Statement

**Current state**: `executeToolChain` (`tools/toolchain.ts`) 执行期已构造标准 `IMessage[]` 序列，但 `MessageFlowFormatter` 在收尾把它压缩成单条 assistant 字符串 `toolChainContent + responseContent`，经 `handleToolChain` (`use-openai-endpoints.ts:687`) 写入单节点 `message.content`，并以 `userPromptSlice=[hintSize, len]` 标记 hint 边界。`getAttachedHistory` (`use-chat-session.ts:128`) 末尾 `.map(item => getPayload(item,'message')!)` 只回放这条压缩字符串 → 后续轮次给 LLM 的 context 丢失 `role:tool`/`tool_calls` 结构，不符合 OpenAI 标准协议；且完整工具结果未持久化（只存截断 `finalText`）。

**User need**: 工具调用 turn 以原生 `IMessage[]` 序列持久化与回放，cell 仍保持单 turn 可编辑/可加版本/可分叉的旧常识；Legacy 兼容、旧数据零迁移。

## Proposed Solution

### Approach

新增 **Standard 模式**（per-session 开关，默认 Standard）。数据层：一个 TreeModel 节点 = 一个 turn，payload 新增可选 `toolChainMessages: IMessage[]`（原生序列，**不含末条 assistant**），主 `message` = 末条 assistant（规范、可编辑、唯一源，避免双份 drift）。`message` 字段类型不变 → Legacy cell 无 `toolChainMessages` 自动走老逻辑，零迁移。

执行期 `executeToolChain` 循环不变；变的是**收尾切分**：Standard 模式下不再调 `MessageFlowFormatter`，改为把 `messages.toolChain` 切成 `{message=末条 assistant, toolChainMessages=其余}`，剥离 maxRounds 兜底插入的合成 `[SYSTEM]` user 消息。`toolChainResult`（元数据 + stats）仍按现有路径产出，供现有 `ToolChainIndicator` 使用。

回放：`getAttachedHistory` 分流——standard cell（有 `toolChainMessages`）→ `[...toolChainMessages, message]`；legacy cell → 整段 `message` 当单条 assistant 回放（**不 strip**，行为同今天 legacy 会话内，0 新逻辑 0 风险）。

UI：phase 1 **近 0 改动**。standard cell 无 `userPromptSlice` → `MessageItem` 显示 `message.content`（最终回复）；`ToolChainIndicator` 仍由 `toolChainResult` 驱动（已存在）。CodeX 式结构化 UI 留 phase 2。

**why this over alternatives**: 「一节点一消息 + turn-group」会破坏现有 per-node version/worldLine 语义、风险大；「扁平 content 含日志」会迫使 UI 必改（100 分努力）。本方案 `message` 类型不变 + 新增可选字段 = 数据层最小侵入、零迁移，UI 可分期。

### Key Change

- **Feat A: 模式开关** — `IChatSessionConfig` 新增 `toolCallMode: 'standard' | 'legacy'`，默认 `'standard'`；`defaultConfig` 同步。per-session 持久化随现有 config 路径。
- **Feat B: 数据模型字段** — `IMessagePayload`（`types-v2.ts`）新增可选 `toolChainMessages?: IMessage[]`；`message` 语义在 standard 下 = 末条 assistant（字段类型不变）。
- **Feat C: finalize 切分** — `handleToolChain` Standard 分支：从 `executeToolChain` 返回的 `result.messages.toolChain`（已存在，执行器不改）切出 `{message=末条 assistant, toolChainMessages=其余, toolChainResult}`，不设 `userPromptSlice`，剥离 `toolChainMessages` 中 assistant 的 reasoning_content（`message` 保留末条 reasoning），follow-up 异常时末元素非 assistant → 合成空 `message` fallback；Legacy 分支保持现状。
- **Feat D: 回放分流** — `getAttachedHistory` 末尾按 `toolChainMessages` 存在性分流展开。
- **Feat E: addVersion 整组拷贝** — `addMsgItemVersion` 拷贝 `toolChainMessages` + `toolChainResult` 到新版本（仅 `message.content` 不同）；`userPromptSlice` 按 presence 拷（legacy cell 用）。避免版本退化丢结构。
- **Feat F: Legacy 不 strip** — legacy cell 在 standard 会话中整段回放，无切片逻辑。
- **Compat G: 迁移** — 无强制迁移；`msg_migration.ts` 透传新可选字段；旧数据无 `toolChainMessages` → 自动 legacy。
- **Compat H: `toolChainResult` 不废弃** — 与 `toolChainMessages` 分工（消息序列/回放源 vs UI/统计元数据源），重叠仅只读 `result.data`，无 drift；phase 1 UI 仍依赖它。

**What Stays Unchanged**:
- `executeToolChain` 主循环、审批、maxRounds、abort、VariableSystem 缓存逻辑。
- Legacy 模式整条路径（`MessageFlowFormatter`、压缩、`userPromptSlice`）。
- `toolChainResult` 产出路径与 `ToolChainIndicator`/`ToolChainTimeline` UI。
- 非 UI 消费者（export/snapshot/搜索）phase 1 继续用 `message.content` 兜底（显示最终回复）。
- rerun 执行链路（rerun 走 `handleToolChain` → 自动产 standard payload）。

### Scope Summary

| File | Change |
|------|--------|
| `src/func/gpt/types.ts` | `IChatSessionConfig` 增 `toolCallMode` |
| `src/func/gpt/model/config.ts` | `defaultConfig` 增 `toolCallMode: 'standard'` |
| `src/func/gpt/types-v2.ts` | `IMessagePayload` 增可选 `toolChainMessages` |
| `src/func/gpt/tools/toolchain.ts` | 暴露切分所需信息（末条 assistant 标识 / 合成消息标记），或由集成层切分 |
| `src/func/gpt/chat/ChatSession/use-openai-endpoints.ts` | `handleToolChain` Standard 分支切分 payload，不压缩 |
| `src/func/gpt/chat/ChatSession/use-chat-session.ts` | `getAttachedHistory` 分流；`addMsgItemVersion` 整组拷贝 |
| `src/func/gpt/model/msg_migration.ts` | 透传 `toolChainMessages` |
| session 配置 UI（`session-setting.tsx`） | 模式开关入口（最小） |

### Design Reference

→ See [design.md](./design.md)
