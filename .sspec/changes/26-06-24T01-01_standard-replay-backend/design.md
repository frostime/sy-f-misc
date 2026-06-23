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
     * 持久化时剥离 reasoning_content（不作为内容持久化，减 payload）。
     */
    toolChainMessages?: IMessage[];

    toolChainResult?: { ... };                // 不变，继续按现有路径产出
}
```

判定规则：`payload.toolChainMessages != null` → standard cell；否则 legacy cell。无 schema 版本变更（schema 仍 2，新增可选字段）。

### 1.2 配置（`types.ts` `IChatSessionConfig`）

```typescript
interface IChatSessionConfig {
    // ...既有...
    toolCallMode: 'standard' | 'legacy';   // 默认 'standard'
}
```

`defaultConfig` (`model/config.ts`) 同步 `toolCallMode: 'standard'`。per-session 持久化随现有 config 路径（`main.tsx` 由 `props.config` 注入）。

## 2. Behavioral Spec — finalize 切分

`handleToolChain` (`use-openai-endpoints.ts`) 在 `executeToolChain` 返回后，按 `config().toolCallMode` 分流：

```
result = executeToolChain(...)
if mode == 'standard':
    tcm = result.messages.toolChain            # 原生序列（已不含合成 [SYSTEM] user）
    # 末元素必为 final assistant（自然结束或 maxRounds 兜底 fallback）
    finalAssistant = tcm[tcm.length - 1]
    toolChainMessages_persist = tcm[0 .. len-2]
    # 剥离 reasoning_content
    toolChainMessages_persist = stripReasoning(toolChainMessages_persist)
    finalAssistant_clean = stripReasoning(finalAssistant)

    payload.message           = finalAssistant_clean          # 末条 assistant，规范、可编辑、唯一源
    payload.toolChainMessages = toolChainMessages_persist
    payload.toolChainResult   = { toolCallHistory, stats, status, error }   # 现有路径不变
    payload.userPromptSlice   = undefined                      # standard 不设
    payload.content(写入)     = extractContentText(finalAssistant_clean.content)
else:  # legacy
    # 现状不变：content = toolChainContent + responseContent；userPromptSlice = [hintSize, len]
```

切分前提（已核实 `toolchain.ts`）：`toolChainMessages` 由 `state.toolChainMessages` 累积，**不含** maxRounds 兜底插入的合成 `{role:'user', content:'[SYSTEM] ...'}`（该消息只进 `state.allMessages`，见 `toolchain.ts:643`）。末元素恒为 final assistant。

`executeToolChain` 自身**不改**：仍返回 `messages.toolChain` / `toolChainContent` / `responseContent`。切分在集成层做，保持执行器纯净。

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
    // standard cell 不设 userPromptSlice
    ...(current.userPromptSlice && !current.toolChainMessages ? { userPromptSlice: current.userPromptSlice } : {})
}
```

语义：同一组工具调用结果，换最终回复措辞 → 保留 `toolChainMessages`/`toolChainResult`。rerun（重执行）走 `reRunMessage` → `handleToolChain` → 产全新 `{message, toolChainMessages, toolChainResult}`，与新版本语义不冲突。

## 5. Edge Cases

| Case | 处理 |
|---|---|
| maxRounds 兜底合成 `[SYSTEM]` user 消息 | 持久化 `toolChainMessages` 已自动排除（只在 `allMessages`）。回放不重发。✓ |
| maxRounds 未执行 tool_calls 的占位 `{role:'tool', status:'incomplete'}` | 在 `toolChainMessages` 内，原样回放（合法 tool 结果，告知 LLM 未完成）。✓ |
| turn 内无 tool 调用（`executeToolChain` 未触发） | `handleToolChain` 不调用 → payload 无 `toolChainMessages` → 走 legacy/普通回复路径，与今天一致。✓ |
| final assistant content 为空 | `message.content = ''`；可由 edit 填充。✓ |
| reasoning_content | 持久化前 `stripReasoning` 剥离（不作为内容持久化）。✓ |
| legacy cell 混入 standard 会话 | 无 `toolChainMessages` → 整段单条 assistant 回放，行为同今天 legacy 会话内。✓ |
| standard cell 被 hidden/pinned | 节点级标志作用于整个 turn；hide 整个 turn、pin 整个 turn。✓ |
| export/snapshot/搜索（phase 1） | 继续用 `message.content`（最终回复）兜底；工具调用信息不进导出（phase 2 再渲染序列）。可接受降级。 |
| `attachedHistory` token 膨胀 | 1 standard cell 展开为 N 条消息，按条数配置的窗口 token 占用变大。非 bug；设置项文案提示即可。 |

## 6. Migration Path

- 无强制迁移、无 schema 版本号变更。
- `msg_migration.ts`：新版本透传 `toolChainMessages`（旧数据无此字段 → undefined → 自动 legacy）。
- 旧会话：其 cell 均无 `toolChainMessages` → 即使会话切到 standard 模式，旧 cell 仍按 legacy 回放（不 strip）；新产生的 turn 才是 standard cell。
- 新建会话：默认 `toolCallMode: 'standard'`，新 turn 即 standard cell。
- 回滚：把 `toolCallMode` 改回 `'legacy'` 即恢复旧行为；已产生的 standard cell 仍能回放（`toolChainMessages` 存在 → 展开），不丢数据。

## 7. What Stays Unchanged（边界守护）

- `executeToolChain` 主循环 / 审批 / maxRounds / abort / VariableSystem 缓存。
- Legacy 全路径（`MessageFlowFormatter` / 压缩 / `userPromptSlice`）。
- `toolChainResult` 产出路径 + `ToolChainIndicator`/`ToolChainTimeline` UI。
- `MessageItem` 渲染（standard cell 无 `userPromptSlice` → 显示 `message.content`；timeline 仍由 `toolChainResult` 驱动）。
- rerun 执行链路。
