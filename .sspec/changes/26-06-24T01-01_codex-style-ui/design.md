---
change: "codex-style-ui"
created: 2026-06-24T01:01:03
updated: 2026-06-24
---

# Design: codex-style-ui

## 0. 现状约束（来自 UI 结构映射）

MessageItem.tsx (924 行) 写死「单字符串 content」假设，phase 2 硬约束：

| 约束 | 位置 | 影响 |
|---|---|---|
| A. 单串文本抽取 + 单 innerHTML | `MessageItem.tsx:47-62,85-92,899-900` | 无法塞交错序列 |
| B. 流式按 `\n\n` 段落分块 | `MessageItem.helper.ts:287-305` | 无法表达 tool 行边界 |
| C. 后处理扫单 `msgRef` DOM | `helper:142-184`, `MessageItem:101-114` | 多 assistant 段需共享根 ref |
| D. ToolChain 与正文并列、不交错；loading 时隐藏 | `MessageItem.tsx:913`, `ToolChainIndicator.tsx:19-20` | 需改为时序嵌入 |
| E. 编辑单串签名 `updateIt(text:string)` | `MessageItem.tsx:29,186-237` | 多段编辑需新回调 |
| F. ReasoningSection 独立块 | `MessageItem.tsx:685-744,889` | turn 头部保留即可 |

可复用：`createMarkdownRenderer`（单段 Markdown→HTML）、`runMarkdownPostRender`（共享根 ref 全 DOM 后处理）、`ToolChainTimeline` tool 行渲染单元、AttachmentList/版本/分支/菜单/工具栏（与正文解耦）。

**数据层关键差距**：`toolChainResult.toolCallHistory` 只有 `roundIndex`，丢失 assistant 文本段与 tool_call 的相对位置。phase 2 时序交错**必须遍历 `toolChainMessages`（原生 IMessage 序列）**，不能从 `toolCallHistory` 反推。

## 1. Structural Blueprint — 渲染分流

`MessageItem` 按 cell 模式分两条渲染路径，legacy 路径完全不动：

```
MessageItem(props)
 ├─ 标准/legacy 判定: getPayload(item,'toolChainMessages') != null
 ├─ Legacy 路径（不动）: textContent memo + userPromptSlice 切片 + 单 messageAsHTML + 现有 ToolChainIndicator
 └─ Standard 路径（新）: <StandardTurnView item={item} loading={loading} .../>
```

新增组件 `StandardTurnView`（同目录新文件），承载 CodeX 式交错渲染。MessageItem 仅在 standard 分支委托给它，避免污染 924 行 legacy 路径。

## 2. Behavioral Spec — StandardTurnView 渲染

遍历 `[...toolChainMessages, message]` 产出交错 DOM：

```
StandardTurnView
 ├─ ReasoningSection (turn 头部, 复用, 仅 message.reasoning_content)
 ├─ div.turnBody ref={turnRootRef}        ← 单一根 ref 供 runMarkdownPostRender 扫描
 │   └─ For each msg in [...toolChainMessages, message]:
 │       ├─ msg.role === 'assistant' && msg.content 有文本:
 │       │   └─ div.assistantTextBlock innerHTML={renderMarkdown(extractContentText(msg.content))}
 │       ├─ msg.role === 'assistant' && msg.tool_calls?.length:
 │       │   └─ For each tc in msg.tool_calls:
 │       │       └─ <ToolCallRow toolCall={tc} result={lookupResult(tc.id)} />   ← 复用 ToolChainTimeline 渲染单元
 │       └─ msg.role === 'tool':
 │           └─ (跳过; tool 结果已并入 ToolCallRow)   或: 单独 tool 行若 tool_call 匹配失败
 └─ (无独立 ToolChainIndicator; tool 行已内联)
```

**tool 结果查找**：建 `Map<tool_call_id, toolCallHistoryEntry>` 从 `toolChainResult.toolCallHistory` 查（按 callId）。`toolChainMessages` 里的 `tool` 消息与 `toolCallHistory` entry 通过 `tool_call_id`/`callId` 关联。

**后处理**：所有 assistant 文本段共享 `turnRootRef`，流式/完成后调 `runMarkdownPostRender(turnRootRef)` 一次覆盖全部 markdown 段（hljs/katex/mermaid）。ToolCallRow 容器不含 `pre>code.language-*` 选择器目标，不干扰。

** Legacy 兼容**：legacy cell 无 `toolChainMessages` → 走原 MessageItem 路径，`ToolChainIndicator` 仍并列显示。零回归。

## 3. Behavioral Spec — 多段编辑面板

编辑入口扩展。现状 `updateIt(text:string)` 单串。standard cell 编辑面板需表达多段结果。

**最小契约扩展**（不改 legacy 签名）：
```
// 新增 optional prop，仅 standard 分支用
onEditTurn?: (edits: {
    finalMessageContent: string;            // 末条 assistant 文本（message.content）
    intermediateEdits?: Record<number, string>;  // toolChainMessages[index].content 的编辑（按序号）
}) => void;
```
- `updateIt` 保留供 legacy；standard 分支用 `onEditTurn`。
- 编辑面板（floatingEditor 扩展或新 dialog）：列出所有 assistant 文本段（中间段 + 最终段），tool 消息只读展示。确认时回写：最终段 → `message.content`；中间段 → `toolChainMessages[i].content`。
- 写回经 `use-chat-session` 新增 `updateStandardTurn(edits)`：更新当前 version payload 的 `message.content` 与 `toolChainMessages[i].content`（不碰 tool 消息、不碰 toolChainResult）。

**边界**：只编辑 assistant 文本段；tool 消息只读（design 既定）。中间段编辑后回放即发编辑后文本，tool_calls 结构不动。

## 4. Behavioral Spec — 结构化流式

phase 1 为 final_swap（生成中占位、结束切结构化）。phase 2 升级为结构化实时。

**回调升级**（`executeToolChain` callbacks）：
```
onAssistantTextDelta?: (segmentIndex: number, delta: string) => void;
onToolCallStart?: (toolName, args, callId) => void;     // 已有
onToolCallComplete?: (result, callId) => void;          // 已有
onAssistantSegmentStart?: (segmentIndex: number) => void;  // 新 assistant 文本段开始
```
`executeToolChain` 主循环已在每轮 push assistant 消息；需在 `complete` 流式 `streamMsg` 回调里区分"当前 assistant 段"并 emit `onAssistantTextDelta`。segmentIndex = 当前 assistant 消息在 `toolChainMessages` 中的序号。

**StandardTurnView live 状态**：生成中维护临时结构 signal：
```
liveState = {
    segments: [{content, streaming}],   // assistant 文本段，随 delta 追加
    toolCalls: [{callId, toolName, status, result}],  // 随 start/complete 追加
    finalSegment: null                  // 末条 assistant 完成后填
}
```
完成后 finalize 一次性写入持久化 payload，liveState 丢弃，切到从 payload 渲染的稳定视图。

**约束 B 解法**：流式不再走 `MessageItem.helper:287-305` 的 `\n\n` 分块；StandardTurnView 直接按 segment 渲染，每段独立 `renderMarkdown`（非流式段）或转义直显（流式段残留）。

**Legacy 流式不动**：legacy cell 仍走 `messageAsHTML(loading)` 单串流式。

## 5. File Layout

```
src/func/gpt/chat/components/
├─ MessageItem.tsx                 [改] 顶层分流: standard → <StandardTurnView/>
├─ StandardTurnView.tsx            [新] CodeX 式交错渲染 + live 流式
├─ ToolCallRow.tsx                 [新] 单个 tool 行（从 ToolChainTimeline 抽取渲染单元）
├─ ToolChainTimeline.tsx           [改/复用] 渲染单元抽到 ToolCallRow; legacy 仍用 timeline 平铺
├─ MessageItem.helper.ts           [不动] renderMarkdown/runMarkdownPostRender 复用
├─ TurnEditPanel.tsx               [新] 多段编辑面板（standard 分支）
src/func/gpt/chat/ChatSession/
├─ use-openai-endpoints.ts         [改] 回调升级透传 onAssistantTextDelta 等; finalize 不变
├─ use-chat-session.ts             [改] 新增 updateStandardTurn(edits)
src/func/gpt/tools/toolchain.ts    [改] callbacks 增 onAssistantTextDelta/onAssistantSegmentStart; 流式 emit
```

## 6. Phasing（phase 2 内部分步，便于增量验证）

| 步 | 内容 | 验证 |
|---|---|---|
| 2a | StandardTurnView 静态交错渲染（无流式、无编辑）+ ToolCallRow 抽取 + MessageItem 分流 | standard cell 完成后显示交错 turn；legacy 不变 |
| 2b | 多段编辑面板 + updateStandardTurn + onEditTurn | 编辑中间段/最终段；回放发编辑后文本 |
| 2c | 结构化流式（回调升级 + liveState） | 生成中 tool 行/文本段 live 追加 |
| 2d | 导出/snapshot 完整序列渲染（sy-doc.ts/xml.ts 从 toolChainMessages 渲染） | 导出含交错结构 |

## 7. What Stays Unchanged

- Legacy cell 全渲染路径（MessageItem 单串 + ToolChainIndicator 并列）。
- `executeToolChain` 主循环 / 审批 / maxRounds / 期 1 数据契约（toolChainMessages/message/toolChainResult 字段与切分规则）。
- AttachmentList / MessageToolbar / VersionIndicator / BranchIndicator / 菜单（与正文解耦）。
- `toolChainResult` 产出路径（仍是 UI 元数据源；ToolCallRow 的结果数据从其 toolCallHistory 查）。
- phase 1 的 finalize 切分、回放分流、addVersion 整组拷贝。

## 8. Open Questions（design 阶段需用户确认的分支）

- **OQ1 ToolCallRow 内联形态**：tool 行是单行可展开（CodeX 式，点击展开参数/结果），还是直接平铺参数+结果（更接近现 ToolChainTimeline）？
- **OQ2 中间 assistant 文本段默认展示**：默认展开显示，还是折叠（次要思考文本）只显示 tool 行 + 最终回复？
- **OQ3 流式优先级**：2c 结构化流式实现成本较高（改 executeToolChain 流式 emit），是否接受先 2a/2b/2d 用 final_swap，2c 作为可选增强？
