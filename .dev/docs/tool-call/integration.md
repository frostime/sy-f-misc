---
name: Chat 集成层（use-openai-endpoints）
description: Tool Call 在 ChatSession 中的完整集成逻辑：注入工具定义、构建 systemPrompt、执行链路、结果保存与历史回放
updated: 2026-10-30
scope:
  - /src/func/gpt/chat/ChatSession/use-openai-endpoints.ts
  - /src/func/gpt/chat/ChatSession/tool-chain-result.ts
  - /src/func/gpt/chat/ChatSession/message-lifecycle.ts
  - /src/func/gpt/chat/ChatSession/use-chat-session.ts
deprecated: false
---

# Chat 集成层（use-openai-endpoints.ts）

**位置**：`/src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`

本文档描述 Tool Call 如何嵌入完整的 Chat 请求流程。

---

## 工具调用持久化

新生成只有一种形态：**原生工具消息**。payload 中：

| 字段 | 内容 |
|------|------|
| `toolChainMessages` | 一个 turn 内的原生序列，**不含末条 assistant**：`[assistant(tool_calls), tool, assistant(tool_calls), tool, ...]`；中间 assistant 已剥离 `reasoning_content` |
| `message` | 末条 assistant（唯一可编辑源，避免双份 drift） |
| `toolChainResult` | `toolCallHistory` + `stats` + `status` + `error`，供 UI 折叠 timeline 与统计 |
| `userPromptSlice` | 新生成不设置（`finalize` 显式写 `undefined`） |

没有压缩日志、没有工具结果变量、没有 `$VAR_REF`。完整的 `assistant(tool_calls)` / `role:tool` 序列就是持久化内容。

**回放判定**（既有读取路径，未改动）：`payload.toolChainMessages != null` → 原生序列 cell，展开为 `[...toolChainMessages, message]`；否则按单条 assistant 回放。因此打开旧记录不会触发迁移或重写，旧记录仍可继续聊天；旧记录的 `userPromptSlice` 继续用于显示层截取回答正文。

设置侧：配置 schema 3.4 删除了 `toolCallMode`。迁移只删除旧字段，不保留“重新启用旧生成路径”的开关；旧记录按原内容读取。

---

## 架构分层

| 层 | 类/函数 | 职责 |
|----|---------|------|
| **生命周期层** | `createMessageLifecycle` | 创建占位节点、流式更新、最终写入 TreeModel |
| **Handler 层** | `createChatHandler` / `createImageHandler` / `createAudioHandler` | 各模态执行逻辑 |
| **工具链层** | `handleToolChain` + `toolChainToCompletion` | 调用 `executeToolChain()`，把结果转成可持久化的回答 |
| **编排层** | `useGptCommunication` | 对外提供 `sendMessage` / `reRunMessage`，协调上述三层 |

---

## 1. 工具注入（buildChatOption）

```typescript
// createChatHandler 内部
const buildChatOption = (): IChatCompleteOption => {
    let option = { ...config().chatOption };
    option = deepMerge(option, customOptions() || {});  // 用户自定义选项最高优先级

    if (toolExecutor?.hasEnabledTools()) {
        option.tools = toolExecutor.getEnabledToolDefinitions();  // ← 注入工具列表
        option.tool_choice = 'auto';
    }
    // 清理 null/undefined 字段
    return option;
};
```

`getEnabledToolDefinitions()` 会在存在按需规则时自动附加内部工具 `read-rule`，见 [rules.md](./rules.md)。

**触发条件**：只要 `toolExecutor.hasEnabledTools()` 为 true，即有任何工具组被启用。

---

## 2. System Prompt 构建（buildSystemPrompt）

```typescript
const buildSystemPrompt = (): string => {
    const today = `${year}-${month}-${day} (${timeZone})`;  // 仅到日期（不含时分秒）
    let prompt = systemPrompt().trim() || '';

    // 隐私屏蔽规则（如启用）
    if (privacyEnabled && privacyFields.length > 0) {
        prompt += `\n\n<PRIVACY_RULE>...`;
    }

    // 注入工具规则
    if (toolExecutor?.hasEnabledTools()) {
        prompt += toolExecutor.toolRules();  // ← 工具组 rulePrompt + 规则索引
    }

    return `${ptime}\n\n${prompt}`;
};
```

**时间只精确到日期的设计理由**：每次更新时间（精确到秒）会导致 systemPrompt 每条请求都不同，破坏 LLM API 的 prompt cache 命中率，增加 token 消耗。

---

## 3. 执行链路

### sendMessage 完整流程

```
sendMessage(userMessage, attachments, contexts)
  1. preValidateModalType(modelType, attachments)    ← 预检（image-edit / audio-stt）
  2. const msgToSend = getAttachedHistory()          ← 在创建占位符前获取历史
     （⚠️ 必须在 prepareSlot 之前，否则占位 loading 节点会污染历史）
  3. targetId = lifecycle.prepareSlot('append')      ← 创建 loading 占位
  4. executeByModalType(modelType, ...)
     └─ case 'chat': executeChatRequest(msgToSend, targetId)
           ├── chatHandler.execute(...)              ← 第一次 LLM 请求
           └── if response.tool_calls?.length
               → handleToolChain(...)               ← 工具调用链
  5. lifecycle.finalize(targetId, result, meta)      ← 写入最终结果
  6. return { updatedTimestamp, hasResponse }
```

**为什么要在 prepareSlot 之前获取历史**：`lifecycle.prepareSlot('append')` 会在 TreeModel 中插入一个 `loading: true` 的占位节点。如果在之后调用 `getAttachedHistory()`，这个占位节点会被计入消息历史，导致 LLM 看到 `"thinking..."` 这样的占位内容。

### reRunMessage 流程差异

- 用 `{ updateAt: N }` 或 `{ insertAt: N }` 代替 `'append'`（就地新建版本或插入）
- 从上下文还原用户输入（`extractMessageContent(userPayload.message.content)`）
- 同样先获取历史再创建占位
- 新版本独立写入：旧版本的工具消息不被覆盖

### 回放分流（getAttachedHistory）

`getAttachedHistory`（[`use-chat-session.ts`](/src/func/gpt/chat/ChatSession/use-chat-session.ts)）在选定窗口（按 item=turn 计数）后，末尾按 cell 形态展开为发给 LLM 的 `IMessage[]`：

```
return [...finalContext, targetMessage].flatMap(item => {
  const msg = getPayload(item, 'message')
  const tcm = getPayload(item, 'toolChainMessages')
  if (tcm != null)  return [...tcm, msg]   // 原生序列 cell：展开历史工具消息
  else              return [msg]           // 旧记录：单条 assistant
})
```

窗口计数仍按 item（=turn），展开发生在窗口选定之后。语义：只有 user 输入才是 turn 边界，一个 assistant→tool→...→assistant 序列视为一个 turn。回放只读取已保存内容，不重新执行历史工具。

---

## 4. 工具链集成（handleToolChain）

`handleToolChain` 调用 `executeToolChain()`，成功时用 `toolChainToCompletion()` 转成回答版本；非 `completed` 一律回退首次响应。

```
result = executeToolChain(...)
if status == 'completed':
  return toolChainToCompletion(result, initialResponse)
else:                       // aborted / error
  return initialResponse    // 只保存首次响应文本，已执行的工具消息不落盘
```

`toolChainToCompletion()`（`tool-chain-result.ts`）：

```
tcm  = result.messages.toolChain
last = tcm[末]
if last.role == 'assistant':                       // 正常收尾
  content            = extractContentText(last.content)
  reasoning_content  = last.reasoning_content
  toolChainMessages  = tcm[0..-2]（stripReasoning）
else:                                              // 收尾请求失败的边界
  content            = ''
  toolChainMessages  = tcm（stripReasoning）
toolChainResult = { toolCallHistory, stats, status, error }
```

`stripReasoning(msg)`：剥离 assistant 消息的 `reasoning_content`（tool 消息 no-op）。中间 assistant 一律剥离；`message`（末条 assistant）保留 reasoning 供 UI。

**数据源**：`result.messages.toolChain` 即 `state.toolChainMessages`；合成 `[SYSTEM]` user 提示只进 `state.allMessages`，因此不会进入持久化。

---

## 5. 结果持久化（lifecycle.finalize）

`finalize()` 把结果写入**启动本次请求时确定的版本**（`prepareSlot` 记录的 `targetVersions`），而不是用户当前查看的版本：

```typescript
treeModel.updatePayload(id, {
    message: { role: 'assistant', content: result.content, ...reasoning_content },
    author, timestamp, usage, time, token,
    userPromptSlice: undefined,                 // 新生成不设
    toolChainMessages: result.toolChainMessages,
    toolChainResult: result.toolChainResult
}, versionId);
treeModel.updateNode(id, { loading: false, attachedItems, attachedChars });
```

`attachedItems` / `attachedChars` 记录本次发送的上下文规模。版本被删除时 `finalize` 抛错，不会写回错误的版本。

用户手动“添加版本”时（`addMsgItemVersion`），`toolChainMessages`、`toolChainResult` 与旧 `userPromptSlice` 会一并拷贝到新版本，避免版本切换后丢工具调用结构。

---

## 6. ExtendedCompletionResult 类型

```typescript
interface ExtendedCompletionResult extends ICompletionResult {
    toolChainResult?: IMessagePayload['toolChainResult']; // UI/统计元数据
    toolChainMessages?: IMessage[]; // 原生工具消息（不含末条 assistant，已 strip reasoning）
}
```

`IMessagePayload.toolChainResult` 结构：

```typescript
{
    toolCallHistory: ToolChainResult['toolCallHistory'];
    stats: ToolChainResult['stats'];
    status: 'completed' | 'aborted' | 'error' | 'timeout';
    error?: string;
}
```

---

## 7. 多模态支持

`useGptCommunication` 支持四种模态，Tool Call 仅适用于 `chat`：

| `model.type` | Handler | Tool Call 支持 |
|-------------|---------|---------------|
| `'chat'` / 未指定 | `chatHandler` | ✅ |
| `'image-gen'` | `imageHandler.generate()` | ❌ |
| `'image-edit'` | `imageHandler.edit()` | ❌ |
| `'audio-stt'` | `audioHandler.transcribe()` | ❌ |
| `'audio-tts'` | `audioHandler.speak()` | ❌ |

条件判断在 `executeByModalType()` 的 `switch(modelType)` 中。

---

## 8. toolCallMaxRounds 配置

`config().toolCallMaxRounds` 来自 `IChatSessionConfig`，用户可在设置中配置。
传递给 `executeToolChain` 的 `maxRounds` 参数，控制最大 LLM↔工具往返次数（默认 10，见 [toolchain.md](./toolchain.md)）。

---

## 9. 已知未修复行为（本轮范围外）

- **中断/失败回退**：`handleToolChain` 在 `status != 'completed'` 时返回首次响应，本轮已执行的工具调用记录不进入回答版本；只有首轮文本被保存（工具的实际副作用可能已经发生）。
- **跨轮隐私**：`maskMessages` 只作用于首轮请求（`chatHandler.execute`）；工具链内部后续 `complete()` 请求发送未屏蔽的 `allMessages`。
- **错误结果审批**：`checkToolResults: true` 已传入，但执行器对非 `SUCCESS` 结果提前返回，`on-error` 结果审批不会触发（见 [toolchain.md](./toolchain.md) 与 [executor.md](./executor.md)）。
- **工具关闭仍可按名称执行**：启用状态只影响注入的定义，不构成执行禁止；这是刻意设计，不属于上述缺陷。
