# Memory: standard-tool-call

**Updated**: <!-- ISO timestamp, minute precision -->

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the root change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/SiYuanDevelopment/sy-f-misc`
- Branch: `feat/support-full-tool-call`
- HEAD: `8f23d5db22a915ba0cba6d424d73df2255f03b3b`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## feat/support-full-tool-call
```

## Coordination
<!-- MUST update when sub-change status changes.
This is the authoritative root coordination summary that `change status` reads. -->

| Phase | Sub-Change | Status | Blocker |
|-------|------------|--------|---------|
| Phase 1 | standard-replay-backend | 📋 PLANNING | — |
| Phase 2 | codex-style-ui | 📋 PLANNING | Phase 1 |

## State
<!-- Current coordination focus — which phase to advance next. -->
Clarify 完成，root + 两 sub-change spec/design 已写。待用户 @align 确认 design 后进入 phase 1 Plan。

## Key Files
<!-- Cross-phase key files/documents.
- `changes/<sub-name>/` — what this sub-change covers
- `path/file` — what it contains, why it matters -->

## Knowledge
<!-- Cross-change decisions and dependencies. -->
- [2026-06-24] [CoordinationDecision] 一节点一 turn，内嵌 toolChainMessages: IMessage[]（不含末条 assistant）；message=末条 assistant 为唯一可编辑源，避免双份 drift。
- [2026-06-24] [CoordinationDecision] per-session toolCallMode 默认 'standard'；旧 cell 无 toolChainMessages 自动走 legacy，零迁移。
- [2026-06-24] [CoordinationDecision] legacy cell 在 standard 会话中不 strip，整段单条回放（=今天 legacy 会话内行为），0 新逻辑。
- [2026-06-24] [Constraint] 数据契约（toolChainMessages/message/toolChainResult 字段 + 切分规则）phase 1 定型，phase 2 只消费不改。
- [2026-06-24] [Gotcha] toolchain.ts:643 合成 [SYSTEM] user 消息只进 allMessages 不进 toolChainMessages → 持久化 toolChainMessages 自动排除，回放不重发。
- [2026-06-24] [Gotcha] addMsgItemVersion 现状只拷 message，standard cell 需整组拷 toolChainMessages+toolChainResult 否则版本退化丢结构。
- [2026-06-24] [Deferred] reasoning_content 持久化前剥离；CodeX 式 UI + 编辑面板 + 结构化流式留 phase 2。

## Milestones
- [2026-06-24T01:30] Clarify 收敛：确定 standard 模式=原生 IMessage[] 持久化+回放、一节点一 turn 内嵌序列、message=末条 assistant、per-session 默认 standard、legacy 不 strip、分期交付；root + phase1/phase2 spec 写毕，待 align。
