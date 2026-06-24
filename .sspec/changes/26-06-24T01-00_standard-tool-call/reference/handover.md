---
title: standard-tool-call 交接（Phase 2 端到端验证前）
created: 2026-06-24T04:30:00+08:00
handover-for: fresh Pi Coding Agent resuming this change
---

# 交接：standard-tool-call

> 本文档只承载 change 文件之外、影响后续 continuation 的状态。完整设计/任务/决策记录在 change 内，按路径引用，不重复。

## Current Status

- **Phase 1 `standard-replay-backend`**: DONE ✅（用户基本验证通过，未全测）。
- **Phase 2 `codex-style-ui`**: 代码完成（2a/2b/2d），type-check 通过；**2e 端到端待用户在思源中验证**。status=DOING→待 REVIEW。
- **Phase 2c（结构化流式）**: 延后为可选增强，本次不实现；流式仍用 final_swap（生成中占位、结束切结构化）。
- **Root change**: 仍 active，需 phase 2 验收通过后才收尾。

## Next Actions（按序）

1. 等用户 `npm run dev` 后执行 phase 2 的 User Check（见 `../26-06-24T01-01_codex-style-ui/tasks.md` Phase 2e）：
   - 交错渲染 / 多段编辑 / 导出 / legacy 回归 / 混合会话。
2. 通过 → phase 2 spec.md `status: REVIEW → DONE`；root `tasks.md` Phase 2 milestone 标完成。
3. 评估是否更新 spec-doc `tool-call/toolchain.md`（phase 2 UI 形态变化，可选）。
4. 可选：启动 phase 2c 结构化流式（新 follow-up change，需 @align）。

## Decisions（change 之外、非显然、影响后续）

- **流式过渡用 final_swap**：phase 2 交付期不碰 `executeToolChain` 流式 emit，生成中沿用现有字符串占位，完成时一次性切结构化视图。2c 才做 live 结构化流式。
- **`snapshot preview` 不改**：`json-files.ts` preview 用 `message.content`=最终回复 + 长度限制取摘要，工具调用细节不进 preview，合理。phase 2d 未动该文件。
- **pre-existing `toolchain.ts:682` status bug 不修**：follow-up 异常被误报 `completed`；phase 1 切分层用末元素 role 校验兜住持久化形态，status 误报留作后续独立修复，避免扩大执行器改动。
- **`toolChainResult` 不废弃**：与 `toolChainMessages` 分工（回放源 vs UI/统计元数据源），phase 2 `ToolCallRow` 的结果数据仍从其 `toolCallHistory` 查。

## Risks / To Verify

- 用户 phase 1/phase 2 均"基本常用操作 OK，未全测"。未全测项见各 tasks.md User Check，特别是：多轮工具调用回放、maxRounds fallback、edit drift、混合会话。
- 流式期体验降级（final_swap）：生成中只看到状态字，完成才切交错结构。非 bug，2c 解决。
- `StandardTurnView` 后处理 `runMarkdownPostRender` 依赖共享 `turnRootRef`，多 assistant 段的 hljs/katex/mermaid 需在用户环境实测确认覆盖完整。

## Relevant Files and References

先读这些（按序）：

- `../26-06-24T01-00_standard-tool-call/spec.md` — root 范围 + 两期分解。
- `../26-06-24T01-00_standard-tool-call/memory.md` — 跨期决策/陷阱/里程碑（Knowledge 区是最密信息源）。
- `../26-06-24T01-00_standard-tool-call/tasks.md` — root milestones。
- `../26-06-24T01-01_standard-replay-backend/{spec,design,tasks}.md` — phase 1 完整设计与实现记录。
- `../26-06-24T01-01_codex-style-ui/{spec,design,tasks}.md` — phase 2 完整设计与实现记录。
- `../../spec-docs/tool-call/{integration,toolchain}.md` — 已更新的 standard 模式说明。
- 代码入口：`src/func/gpt/chat/components/{StandardTurnView,ToolCallRow,TurnEditPanel}.tsx`、`src/func/gpt/chat/components/MessageItem.tsx`（顶层分流）、`src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`（finalize 切分）、`src/func/gpt/chat/ChatSession/use-chat-session.ts`（回放分流 + updateStandardTurn）。
