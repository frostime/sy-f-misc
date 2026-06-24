---
change: "codex-style-ui"
updated: "2026-06-24"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 2a: 静态交错渲染 ✅
- [x] 抽取 `ToolCallRow` 单行可展开组件（从 ToolChainTimeline 渲染单元提取：toolName+状态+耗时 单行，点击展开参数/结果 + viewDetailData）`src/func/gpt/chat/components/ToolCallRow.tsx` [新]
- [x] `StandardTurnView` 遍历 `[...toolChainMessages, message]` 交错渲染：assistant 文本段（独立 renderMarkdown）+ ToolCallRow；中间 assistant 文本段默认折叠摘要可展开；末条 assistant（message）默认展开；共享 `turnRootRef` 供 runMarkdownPostRender `src/func/gpt/chat/components/StandardTurnView.tsx` [新]
- [x] tool 结果查找：从 `toolChainResult.toolCallHistory` 建 `Map<callId, entry>` 供 ToolCallRow `src/func/gpt/chat/components/StandardTurnView.tsx`
- [x] `MessageItem` 顶层分流：`toolChainMessages != null` → `<StandardTurnView/>`；否则 legacy 路径不动 `src/func/gpt/chat/components/MessageItem.tsx`
- [x] standard 分支不再渲染独立 `ToolChainIndicator`（tool 行已内联）；legacy 分支保留
**Verification**: tsc 通过；standard cell 完成后显示交错 turn（tool 行单行可展开 + 中间文本段折叠 + 最终回复展开）；legacy cell 渲染不变。
**User Check**:
1. standard 模式发触发工具调用的问题 → 回复完成后消息格显示：tool 行（单行，点开看参数/结果）+ 最终回复文本，**tool 行内联在文本流中而非底部独立折叠区**。
2. 多轮工具调用 → 中间 assistant 文本段以折叠摘要显示，点击可展开；末条回复默认展开。
3. 代码块/数学/mermaid 在各 assistant 文本段内正常渲染（hljs/katex/mermaid 后处理覆盖所有段）。
4. legacy 模式 / 旧会话 legacy cell → 显示与 phase 1 完全一致（单串 + 底部 ToolChainIndicator）= 零回归。

### Phase 2b: 多段编辑面板 ⏳
- [ ] `TurnEditPanel` 组件：列出所有 assistant 文本段（中间段 + 最终段）可编辑，tool 消息只读展示；确认时产出 `{finalMessageContent, intermediateEdits}` `src/func/gpt/chat/components/TurnEditPanel.tsx` [新]
- [ ] `use-chat-session` 新增 `updateStandardTurn(edits)`：更新当前 version payload 的 `message.content` 与 `toolChainMessages[i].content`（不碰 tool 消息、toolChainResult）`src/func/gpt/chat/ChatSession/use-chat-session.ts`
- [ ] `MessageItem` standard 分支编辑入口：菜单/工具栏「编辑」对 standard cell 弹 `TurnEditPanel` 而非 `floatingEditor`；新增 `onEditTurn` prop 透传 `src/func/gpt/chat/components/MessageItem.tsx`
- [ ] `addMsgItemVersion` 对 standard cell 编辑产新版本时仍整组拷贝（phase 1 已做，确认 edit 路径兼容）
**Verification**: tsc 通过；编辑中间段/最终段后回放发编辑后文本；tool 结构不变。
**User Check**:
1. 对 standard cell 点「编辑」→ 弹多段编辑面板，列出中间 assistant 文本段 + 最终回复段，tool 行只读。
2. 改中间段文本 + 改最终回复 → 保存 → 面板关闭，UI 显示编辑后内容。
3. 续对话 → LLM 看到编辑后的中间段与最终回复（控制台核实 messagesToSend）= 编辑生效且无 drift。
4. 编辑后切版本再切回 → 编辑内容保持 = 版本快照正确。
5. legacy cell 编辑 → 仍走原 floatingEditor 单串编辑 = legacy 不破坏。

### Phase 2d: 导出/snapshot 完整序列渲染 ⏳
- [ ] `sy-doc.ts` 对 standard cell（有 toolChainMessages）从 `[...toolChainMessages, message]` 渲染交错结构（assistant 文本 + tool 调用块）`src/func/gpt/persistence/sy-doc.ts`
- [ ] `xml.ts` 对 standard cell 渲染序列：assistant 段 + ToolCall 块交错（替代当前 `message.content` + 单一 ToolChain JSON block）`src/func/gpt/persistence/xml.ts`
- [ ] `json-files.ts` snapshot 对 standard cell 预览/元数据按序列生成（若 preview 需工具调用信息）`src/func/gpt/persistence/json-files.ts`
**Verification**: tsc 通过；导出 SiYuan 文档/XML 含交错结构（assistant 文本 + tool 调用）；legacy 导出不变。
**User Check**:
1. 对含 standard 工具调用格子的会话导出 SiYuan 文档 → 打开文档 → 含 assistant 文本段 + tool 调用块交错结构（非单一最终回复 + JSON 块）。
2. 导出 XML → 同样含交错结构。
3. legacy cell 导出 → 与 phase 1 一致（最终回复 + ToolChain JSON 块）= legacy 不破坏。

### Phase 2e: 集成验证 🚧
- [x] 代码侧：type-check 通过，无类型错误
- [ ] 端到端（待用户验证）：standard 交错渲染 + 多段编辑 + 导出；legacy 全回归；流式仍 final_swap
**Verification**: 上述全通过。
**User Check**:
1. standard 模式完整流程：发工具调用问题 → 生成中占位 → 完成切交错结构 → 编辑多段 → 续对话承接 → 导出含结构。
2. legacy 回归：切 legacy → 渲染/编辑/导出与 phase 1 一致。
3. 混合会话：同会话 legacy cell + standard cell → 各按模式渲染/回放/导出，不报错。

---

## Progress

**Overall**: 85%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 2a: 静态交错渲染 | 100% | ✅ |
| Phase 2b: 多段编辑面板 | 100% | ✅ |
| Phase 2d: 导出/snapshot 完整序列渲染 | 100% | ✅ |
| Phase 2e: 集成验证 | 30% | 🚧 |

**Recent**:
- 2a 实现：ToolCallRow + StandardTurnView + MessageItem 分流，tsc 通过。
- 2b 实现：TurnEditPanel + updateStandardTurn + editMessage standard 分支弹面板，tsc 通过。
- 2d 实现：xml.ts/sy-doc.ts standard 分支交错渲染；snapshot preview 无需改。
- 2e 代码侧 type-check 通过；端到端待用户验证。
