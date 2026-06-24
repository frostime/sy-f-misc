---
name: codex-style-ui
status: DOING
change-type: sub
created: 2026-06-24T01:01:03
reference:
- source: .sspec/changes/26-06-24T01-00_standard-tool-call
  type: root-change
  note: "Phase 2: codex-style-ui"
---

# codex-style-ui

## Problem Statement

Phase 1 落地后 standard cell 数据已是原生 `IMessage[]` 序列，但 UI 仍只显示 `message.content`（最终回复）+ 折叠 `ToolChainIndicator`（工具调用计数）。**中间 assistant 文本段、tool 调用行、结果预览未在主区域交错可视化**，不符合 CodeX / Claude 式 agent UI 惯例；且编辑只能改最终回复，无法编辑中间 assistant 文本段。

## Proposed Solution

### Approach

`MessageItem` 对 standard cell 新增**结构化渲染路径**：遍历 `[...toolChainMessages, message]`，把 assistant `content` 段渲染为 markdown 文本块、tool call 渲染为可展开行（name/args/status/timing/结果预览），交错呈现为一个不可分割的 turn 单元。Legacy cell 保留现有 `userPromptSlice` 切串渲染。

编辑：独立编辑面板，支持编辑**所有 assistant 文本段**（中间 + 最终），tool 消息只读。编辑中间段写 `toolChainMessages[i].content`；编辑最终回复写 `message.content`。

流式：phase 1 为 final_swap（生成中占位、结束切结构化）。phase 2 升级为结构化实时——`executeToolChain` 回调丰富为 `onAssistantTextDelta` / `onToolCallStart` / `onToolCallComplete`，生成中即 live 追加 tool 行与文本段。

非 UI 消费者：export/snapshot/搜索 对 standard cell 改从 `toolChainMessages` + `message` 渲染完整序列（phase 1 兜底仅最终回复的降级在此补全）。

### Key Change

- **Feat A: 结构化渲染** — `MessageItem` standard 分支：`toolChainMessages` + `message` 交错渲染（assistant 文本块 + tool 行）。
- **Feat B: 编辑面板** — 多 assistant 文本段可编辑；tool 消息只读；写回对应字段。
- **Feat C: 结构化流式** — `executeToolChain` 回调升级；`MessageItem` live 渲染。
- **Feat D: 导出/快照完整渲染** — `sy-doc.ts`/`xml.ts`/snapshot 对 standard cell 渲染序列。

**What Stays Unchanged**: 数据契约（`toolChainMessages`/`message`/`toolChainResult` 字段与切分规则）phase 1 定型，phase 2 只消费不改。

### Scope Summary

| File | Change |
|------|--------|
| `src/func/gpt/chat/components/MessageItem.tsx` | standard 结构化渲染分支 + 编辑面板入口 |
| `src/func/gpt/chat/components/ToolChainTimeline.tsx` | 复用/改造为内联 tool 行渲染 |
| `src/func/gpt/tools/toolchain.ts` | 回调升级为结构化事件 |
| `src/func/gpt/chat/ChatSession/use-openai-endpoints.ts` | 透传新回调 |
| `src/func/gpt/persistence/sy-doc.ts` / `xml.ts` | standard cell 序列渲染 |
| `src/func/gpt/persistence/json-files.ts` (snapshot) | standard cell 元数据/预览 |

### Design Reference

→ See [design.md](./design.md)（含 UI 现状约束映射、StandardTurnView 渲染/编辑/流式设计、文件布局、内部分步 2a-2d、Open Questions）。
