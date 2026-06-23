---
change: "standard-replay-backend"
created: 2026-06-24T01:01:03
---

# Design: standard-replay-backend

## 1. Data Architecture

### 1.1 Payload 字段（`types-v2.ts` `IMessagePayload`）

```typescript
interface IMessagePayload {
    id: string;
    message: IMessage;                       // 不变。standard 下 = 末条 assistant；legacy 下 = 压缩串
    // ...既有字段不变...
    userPromptSlice?: [number, number];       // 仅 legacy 设置；standard 不设

    /**
     * Standard 模式: 一个 turn 内的原生消息序列（不含末条 assistant）。
     * 缺省 = legacy cell，回放走 legacy 分支。
     * 顺序: [首条 assistant(content?, tool_calls=[A]),
     *        tool(id=A, content=finalText),
     *        assistant(content?, tool_calls=[B]),
     *        tool(id=B, content=finalText),
     *        ...,
     *        末个 tool result]   ← 末条 assistant 已拆到 message
     * 持久化前剥离 assistant 消息的 reasoning_content（回放不把 reasoning 灌回 LLM + 减 payload）。
     *   - tool 消息无 reasoning_content，strip 是 no-op（仅标注：作用于 assistant 消息）。
     */
    toolChainMessages?: IMessage[];

    toolChainResult?: { ... };                // 不变，继续按现有路径产出
}
```

判定规则：`payload.toolChainMessages != null` → standard cell；否则 legacy cell。无 schema 版本变更（schema 仍 2，新增可选字段）。

**`toolChainResult` 定位（不废弃）**：与 `toolChainMessages` 分工，非纯冗余。
- `toolChainMessages` = 消息序列/回放源（assistant 信封 + tool_calls + role:tool）。
- `toolChainResult` = UI/统计元数据源（timing、llmUsage、rejectReason、stats、status、error）——这些无法从消息序列派生。
- 重叠仅 `result.data` = tool 消息 `content`（同一 finalText），且均只读（编辑不碰二者）→ 无 drift。
- phase 1 `ToolChainIndicator`/`ToolChainTimeline` 仍依赖 `toolChainResult`，保留；phase 2 可评估从 `toolChainMessages` 派生 `toolCallHistory` 视图给 UI，元数据仍留 `toolChainResult`。

### 1.2 配置（`types.ts` `IChatSessionConfig`）

```typescript
interface IChatSessionConfig {
    // ...既有...
    toolCallMode: 'standard' | 'legacy';   // 默认 'standard'
}
```

`defaultConfig` (`model/config.ts`) 同步 `toolCallMode: 'standard'`。per-session 持久化随现有 config 路径（`main.tsx` 由 `props.config` 注入）。

## 2. Behavioral Spec — finalize 切分

`handleToolChain` (`use-openai-endpoints.ts`) 在 `executeToolChain` 返回后，按 `config().toolCallMode` 分流。**数据源 = `result.messages.toolChain`（已由 `executeToolChain` 返回，执行器不改）。**

```
result = executeToolChain(...)
if mode == 'standard':
    tcm = result.messages.toolChain            # 原生序列（已不含合成 [SYSTEM] user）
    last = tcm[tcm.length - 1]
    if last.role == 'assistant':                # 正常：末元素为 final assistant
        message = stripReasoning(last)          # message 保留 reasoning_content（见下），此处 strip 仅作用于 toolChainMessages
        toolChainMessages_persist = stripReasoning(tcm[0 .. len-2])
    else:                                       # 边界：follow-up 异常，末元素为 tool(incomplete)
        message = { role: 'assistant', content: '' }   # 合成空，保持 standard 形状，不混入 legacy
        toolChainMessages_persist = stripReasoning(tcm)
    # reasoning_content 策略：toolChainMessages 中 assistant 一律剥离；message 保留 last.reasoning_content
    message.reasoning_content = last.reasoning_content   # 仅正常分支保留；边界分支无
    payload.message           = message
    payload.toolChainMessages = toolChainMessages_persist
    payload.toolChainResult   = { toolCallHistory, stats, status, error }   # 现有路径不变
    payload.userPromptSlice   = undefined      # standard 不设
    payload.content(写入)     = extractContentText(message.content)
else:  # legacy
    # 现状不变：content = toolChainContent + responseContent；userPromptSlice = [hintSize, len]
```

**reasoning_content 策略（明确）**：`toolChainMessages` 中 assistant 消息一律剥离（回放不把 reasoning 灌回 LLM + 减 payload）；`message`（末条 assistant）**保留** `reasoning_content`（供 phase 2 UI reasoning 查看；小且可逆）。回放路径若不应发送 reasoning，由 `complete`/adapter 层负责过滤（需在实现时核实，非持久化职责）。tool 消息无 reasoning_content，strip 是 no-op。

切分前提（已核实 `toolchain.ts`）：`toolChainMessages` 由 `state.toolChainMessages` 累积，**不含** maxRounds 兜底插入的合成 `{role:'user', content:'[SYSTEM] ...'}`（该消息只进 `state.allMessages`，见 `toolchain.ts:643`）。

**边界 case：末元素非 assistant**（follow-up LLM 抛异常）：`toolchain.ts:682` catch 只 `console.error`+`onError`，不改 status、不 push toolChainMessages；之后 `:691` 把 status 置 `completed`（pre-existing bug：异常被误报为 completed）。此时 `tcm` 末元素 = placeholder `{role:'tool', status:'incomplete'}`。fallback：合成空 `message`，`toolChainMessages = tcm`（保留 standard 形状，不引入 per-turn 模式覆盖）。该 pre-existing status bug **不在本 change 修复**（记为已知问题，避免扩大执行器改动）。

## 3. Behavioral Spec — 回放分流

`getAttachedHistory` (`use-chat-session.ts:128`) 末尾现状：

```
return [...finalContext, targetMessage].map(item => getPayload(item, 'message')!)
```

改为按 cell 模式展开：

```
return [...finalContext, targetMessage].flatMap(item => {
    const p = getPayload(item)!
    if (p.toolChainMessages != null)                      # standard
        return [...p.toolChainMessages, p.message]
    else                                                  # legacy（不 strip，整段单条）
        return [p.message]
})
```

窗口计数（`itemNum`）仍按 **item（= turn）** 计——standard cell = 1 item = 1 turn，计数逻辑不动；展开发生在窗口选定之后。语义符合"只有 user 输入才是 turn 边界"。

## 4. Behavioral Spec — addVersion 整组拷贝

`addMsgItemVersion` (`use-chat-session.ts:352`) 现状只拷 `message`：

```
newPayload = { id, message: {...current.message, content}, author:'User', timestamp }
```

改为整组拷贝（仅 `message.content` 不同）：

```
newPayload = {
    id, author:'User', timestamp,
    message: {...current.message, content},
    ...(current.toolChainMessages ? { toolChainMessages: current.toolChainMessages } : {}),
    ...(current.toolChainResult   ? { toolChainResult:   current.toolChainResult   } : {}),
    ...(current.userPromptSlice   ? { userPromptSlice:   current.userPromptSlice   } : {})   // legacy cell 拷；standard cell 无此字段，自动跳过
}
```

语义：同一组工具调用结果，换最终回复措辞 → 保留 `toolChainMessages`/`toolChainResult`。rerun（重执行）走 `reRunMessage` → `handleToolChain` → 产全新 `{message, toolChainMessages, toolChainResult}`，与新版本语义不冲突。

## 5. Edge Cases

| Case | 处理 |
|---|---|
| maxRounds 兜底合成 `[SYSTEM]` user 消息 | 持久化 `toolChainMessages` 已自动排除（只在 `allMessages`）。回放不重发。✓ |
| maxRounds follow-up LLM 抛异常 | `tcm` 末元素 = tool(incomplete) 非 assistant → fallback 合成空 `message`，`toolChainMessages=tcm`，保留 standard 形状。pre-existing status bug（误报 completed）不在本 change 修。✓ |
| maxRounds 未执行 tool_calls 的占位 `{role:'tool', status:'incomplete'}` | 在 `toolChainMessages` 内，原样回放（合法 tool 结果，告知 LLM 未完成）。✓ |
| turn 内无 tool 调用（`executeToolChain` 未触发） | `handleToolChain` 不调用 → payload 无 `toolChainMessages` → 走 legacy/普通回复路径，与今天一致。✓ |
| final assistant content 为空 | `message.content = ''`；可由 edit 填充。✓ |
| reasoning_content | `toolChainMessages` 中 assistant 消息持久化前剥离；`message`（末条 assistant）保留供 phase 2 UI。tool 消息无此字段。✓ |
| export/snapshot/搜索（phase 1） | XML（`xml.ts:213`）仍导出 `toolChainResult` JSON block（同今天）；`message.content` 变最终回复（比 legacy 压缩串更干净）。`toolChainMessages` 序列化渲染留 phase 2。**非降级**——phase 1 导出信息量不减。✓ |
| legacy cell 混入 standard 会话 | 无 `toolChainMessages` → 整段单条 assistant 回放，行为同今天 legacy 会话内。✓ |
| standard cell 被 hidden/pinned | 节点级标志作用于整个 turn；hide 整个 turn、pin 整个 turn。✓ |
| `attachedHistory` token 膨胀 | 1 standard cell 展开为 N 条消息，按条数配置的窗口 token 占用变大。非 bug；设置项文案提示即可。 |

## 6. Migration Path

- 无强制迁移、无 schema 版本号变更。
- `msg_migration.ts`：新版本透传 `toolChainMessages`（旧数据无此字段 → undefined → 自动 legacy）。
- 旧会话：其 cell 均无 `toolChainMessages` → 即使会话切到 standard 模式，旧 cell 仍按 legacy 回放（不 strip）；新产生的 turn 才是 standard cell。
- 新建会话：默认 `toolCallMode: 'standard'`，新 turn 即 standard cell。
- 回滚：把 `toolCallMode` 改回 `'legacy'` 即恢复旧行为；已产生的 standard cell 仍能回放（`toolChainMessages` 存在 → 展开），不丢数据。

## 7. What Stays Unchanged（边界守护）

- `executeToolChain` 主循环 / 审批 / maxRounds / abort / VariableSystem 缓存。
- `executeToolChain` **返回值不改动**：已含 standard 所需 `messages.toolChain`（切分源）+ `toolCallHistory`/`stats`/`status`/`error`/`usage`。瑕疵：`responseContent`/`toolChainContent` 在 standard 模式被丢弃（浪费的字符串格式化，成本低）——可选未来清理：把 `MessageFlowFormatter` 移到集成层 legacy 分支让执行器 mode-agnostic，**不进 phase 1**。
- Legacy 全路径（`MessageFlowFormatter` / 压缩 / `userPromptSlice`）。
- `toolChainResult` 产出路径 + `ToolChainIndicator`/`ToolChainTimeline` UI。
- `MessageItem` 渲染（standard cell 无 `userPromptSlice` → 显示 `message.content`；timeline 仍由 `toolChainResult` 驱动）。
- rerun 执行链路。

### 已知 pre-existing 问题（本 change 不修）

- `toolchain.ts:682` follow-up catch 未置 `status='error'`，导致 follow-up 异常被误报为 `completed`。本 change 在切分层用末元素 role 校验做 fallback 兜住持久化形态；status 误报留作后续独立修复，避免扩大执行器改动范围。
