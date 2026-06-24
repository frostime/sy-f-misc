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
| Phase 1 | standard-replay-backend | ✅ DONE | — |
| Phase 2 | codex-style-ui | 📋 PLANNING | Phase 1 |

## State
<!-- Current coordination focus — which phase to advance next. -->
Phase 1 DONE。Phase 2 codex-style-ui design 写毕（含 UI 映射约束、StandardTurnView、编辑面板、流式、分步 2a-2d、3 Open Questions），待用户 @align design 后进 plan。

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
- [2026-06-24] [Gotcha] toolchain.ts:682 follow-up catch 未置 status='error' → follow-up 异常被误报 completed，末元素为 tool(incomplete) 非 assistant。切分层用末元素 role 校验 fallback（合成空 message）；status bug 本 change 不修。
- [2026-06-24] [CoordinationDecision] toolChainResult 不废弃：与 toolChainMessages 分工（回放源 vs UI/统计元数据源），重叠仅只读 result.data 无 drift；phase 1 UI 仍依赖。
- [2026-06-24] [CoordinationDecision] reasoning_content：toolChainMessages 中 assistant 剥离；message（末条 assistant）保留供 phase 2 UI。
- [2026-06-24] [CoordinationDecision] executeToolChain 返回值 phase 1 不改（已含 messages.toolChain 切分源）；MessageFlowFormatter 移集成层的清理不进 phase 1。
- [2026-06-24] [Gotcha] xml.ts:213 已导出 toolChainResult JSON block，phase 1 standard cell 导出信息量不减（message.content 反更干净）；序列渲染留 phase 2。
- [2026-06-24] [ImplementationNote] msg_migration 无需透传 toolChainMessages：V1 IChatSessionMsgItem 无此字段，V2 payload 从 JSON 直接加载自然含新可选字段。
- [2026-06-24] [ImplementationNote] handleToolChain 非完成（aborted/error）分支保持现状返回 initialResponse（无 toolChainMessages → finalize 走 legacy 退化）。design 未覆盖此异常路径，保持与 legacy 一致的丢弃行为。
- [2026-06-24] [ImplementationNote] config 加载 `{...defaultConfig, ...props.config}` 合并使旧会话也获 toolCallMode='standard'，但旧 cell 无 toolChainMessages 仍走 legacy 回放（cell 级判定），新 turn 才 standard。符合 design「旧 cell 保留、新 turn 按模式」。

- [2026-06-24] [Deferred] reasoning_content 持久化前剥离；CodeX 式 UI + 编辑面板 + 结构化流式留 phase 2。

## Milestones
- [2026-06-24T01:30] Clarify 收敛：确定 standard 模式=原生 IMessage[] 持久化+回放、一节点一 turn 内嵌序列、message=末条 assistant、per-session 默认 standard、legacy 不 strip、分期交付；root + phase1/phase2 spec 写毕，待 align。
- [2026-06-24T02:00] Design align 通过；subagent 审查意见落地（末元素 fallback、reasoning 策略、XML export 更正、toolChainResult 定位不废弃、executeToolChain 返回值不改）。
- [2026-06-24T02:15] Plan 写毕：phase 1 tasks 6 阶段（类型配置/finalize切分/回放分流/addVersion/UI开关/集成验证），root milestones 两期。进 implement。
- [2026-06-24T02:45] Phase 1-5 代码实现完成，tsc/type-check 通过；Phase 6 端到端待用户验证。实现中发现：migration 无需透传（V1 无字段）、非完成分支保持现状、config 合并使旧会话 toolCallMode='standard' 但旧 cell 仍 legacy 回放。
- [2026-06-24T03:00] 用户在思源中测试基本常用操作基本 OK（未全测）。Phase 1 tasks 100%，spec status → REVIEW。
- [2026-06-24T03:10] Phase 1 验收通过 → DONE。启动 phase 2。
- [2026-06-24T03:30] Phase 2 design 写毕：subagent 映射 MessageItem UI 结构（924 行，6 处单串假设约束），design 含 StandardTurnView 交错渲染/多段编辑/结构化流式/文件布局/分步 2a-2d/3 OQ。spec-doc tool-call 已补 standard 模式。待 align。
