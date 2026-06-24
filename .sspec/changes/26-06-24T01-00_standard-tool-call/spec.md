---
name: standard-tool-call
status: PLANNING
change-type: root
created: 2026-06-24 01:00:32
reference:
- source: .sspec/requests/26-06-20T16-30_tool-call-message.md
  type: request
  note: Linked from request
- source: .sspec/changes/26-06-24T01-01_standard-replay-backend
  type: sub-change
  note: "Phase 1: standard-replay-backend"
- source: .sspec/changes/26-06-24T01-01_codex-style-ui
  type: sub-change
  note: "Phase 2: codex-style-ui"
- source: .sspec/changes/26-06-24T01-00_standard-tool-call/reference/handover.md
  type: doc
  note: "交接文档：phase 2 端到端验证前的状态与后续动作（只载 change 之外信息，详情见各 sub-change）"
---

# standard-tool-call

## Problem Statement

当前 GPT 工具调用在执行期构造的是标准 OpenAI 消息序列（`assistant(tool_calls)` + `role:tool` 交错），但**收尾持久化**阶段由 `MessageFlowFormatter` 把整条 toolchain 压缩成单条 assistant 字符串（`SystemHint + [Tool Execution Log] 块 + 最终回复`）塞进一个 TreeModel 节点。后果：

- 后续对话 `getAttachedHistory` 只能取回这条压缩字符串，**丢失 `role:tool` / `tool_calls` 结构**，给 LLM 的 context 不符合业内标准协议。
- 为在单字符串里切出 hint 与真实回复而引入 `userPromptSlice` hack，且完整工具结果**未持久化**（只存截断 `finalText` + 易失 VariableSystem 缓存）。
- 与业内通行做法不一致，带来使用与扩展不便。

成功 = 在 Standard 模式下，工具调用 turn 以**原生 `IMessage[]` 序列**持久化与回放（续对话时发给 LLM 的是真实的 `assistant(tool_calls)` + `role:tool` 序列），同时 cell 仍保持"单 turn 可编辑、可加版本、可分叉"的旧常识边界；Legacy 模式作为兼容保留，旧数据零迁移、零风险。

## Proposed Solution

### Overall Approach

**数据层保持原生标准消息，UI 层自由合并/编辑。** 一个 TreeModel 节点 = 一个 turn（version/rerun 单位），节点内部存原生 `IMessage[]` 序列（`toolChainMessages`），主 `message` 字段 = 末条 assistant（规范、可编辑、唯一源，避免双份 drift）。`message` 字段类型不变，`toolChainMessages` 为新增可选字段 → Legacy cell 无此字段自动走老逻辑，零迁移。

模式为 **per-session 开关，默认 Standard**。回放：standard cell → `[...toolChainMessages, message]`；legacy cell → 整段当单条 assistant 回放（不 strip，行为同今天 legacy 会话内）。

交付分两期，phase 1 先落地后端回放与最小 UI（现有 `ToolChainIndicator` 已可用），phase 2 再做 CodeX 式结构化 UI 与编辑面板。

### Phase Overview

| Phase | Goal | Depends On | Scope |
|-------|------|-----------|-------|
| Phase 1: standard-replay-backend | standard 模式下原生 `IMessage[]` 持久化 + 回放分流 + 旧常识边界保持；legacy 不受影响 | — | toolchain / 集成层 / TreeModel / 类型 / 配置开关 |
| Phase 2: codex-style-ui | CodeX 式合并显示（assistant 文本段 + tool 行交错）+ 多段编辑面板 + 结构化流式 | Phase 1 | MessageItem / ToolChainTimeline / 编辑面板 / 流式回调 / 导出渲染 |

```
Phase 1 (standard-replay-backend) ──► Phase 2 (codex-style-ui)
```

Coordination Notes:
- 共享数据契约在 phase 1 定型（`toolChainMessages` 字段、切分规则、回放分流）。phase 2 只消费该契约，不得再改数据形态。
- `toolChainResult`（UI 元数据 + stats）两期共用：phase 1 继续按现有路径产出（不派生自 `toolChainMessages`，避免双源 drift 风险——编辑不触碰 `toolCallHistory.result.data`）；phase 2 可评估是否从 `toolChainMessages` 派生。
- 非 UI 消费者（export/snapshot/搜索）phase 1 用 `message.content`（最终回复）兜底；完整序列渲染留 phase 2。
- 模式开关 per-session 默认 Standard；新建会话默认 Standard，旧会话保持其模式。

### Design Reference

跨期数据契约与切分规则见 phase 1 sub-change 的 design.md。root 不另设 design.md（无跨期架构决策超出 phase 1 契约范围）。
