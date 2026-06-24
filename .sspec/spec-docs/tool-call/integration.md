---
name: Chat 集成层（use-openai-endpoints）
description: Tool Call 在 ChatSession 中的完整集成逻辑：注入工具定义、构建 systemPrompt、执行链路、结果保存
updated: 2026-06-24
scope:
  - /src/func/gpt/chat/ChatSession/use-openai-endpoints.ts
  - /src/func/gpt/chat/ChatSession/use-chat-session.ts
deprecated: false
---

# Chat 集成层（use-openai-endpoints.ts）

**位置**：`/src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`

本文档描述 Tool Call 如何嵌入完整的 Chat 请求流程。

---

## 工具调用持久化模式

`config().toolCallMode`（per-session，默认 `'standard'`）决定工具调用 turn 的持久化与回放形态：

| 模式 | 持久化 | 回放 |
|------|--------|------|
| **Standard** | payload 新增 `toolChainMessages: IMessage[]`（原生序列，不含末条 assistant）；`message`=末条 assistant（唯一可编辑源）；不设 `userPromptSlice` | `getAttachedHistory` 展开为 `[...toolChainMessages, message]`，发给 LLM 的是真实 `assistant(tool_calls)` + `role:tool` 序列 |
| **Legacy** | 压缩串 `toolChainContent + responseContent` 写入 `message.content`；`userPromptSlice=[hintSize, len]` 标记 hint 边界 | 单条 assistant 消息（压缩串，不 strip） |

判定：`payload.toolChainMessages != null` → standard cell；否则 legacy cell。旧数据无此字段自动 legacy，零迁移。`executeToolChain` 自身不区分模式——分流发生在集成层 `handleToolChain` 与 `getAttachedHistory`。详见 [standard-tool-call change](/../../changes/26-06-24T01-00_standard-tool-call/)。

---

## 架构分层

`use-openai-endpoints.ts` 内部采用四层职责分离：

| 层 | 类/函数 | 职责 |
|----|---------|------|
| **生命周期层** | `createMessageLifecycle` | 创建占位节点、流式更新、最终写入 TreeModel |
| **Handler 层** | `createChatHandler` / `createImageHandler` / `createAudioHandler` | 各模态执行逻辑 |
| **工具链层** | `handleToolChain` | 调用 `executeToolChain()`，整合结果 |
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
        prompt += toolExecutor.toolRules();  // ← 所有工具组 rulePrompt + Skill Rules 索引
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

- 用 `{ updateAt: N }` 或 `{ insertAt: N }` 代替 `'append'`（就地更新或插入）
- 从上下文还原用户输入（`extractMessageContent(userPayload.message.content)`）
- 同样先获取历史再创建占位

### 回放分流（getAttachedHistory）

`getAttachedHistory`（[`use-chat-session.ts`](/src/func/gpt/chat/ChatSession/use-chat-session.ts)）在选定窗口（按 item=turn 计数）后，末尾按 cell 模式展开为发给 LLM 的 `IMessage[]`：

```
return [...finalContext, targetMessage].flatMap(item => {
  const msg = getPayload(item, 'message')
  const tcm = getPayload(item, 'toolChainMessages')
  if (tcm != null)  return [...tcm, msg]   // standard: 展开原生序列 + 末条 assistant
  else              return [msg]           // legacy: 整段单条 assistant（不 strip）
})
```

窗口计数仍按 item（=turn），展开发生在窗口选定之后。语义：只有 user 输入才是 turn 边界，一个 assistant→tool→...→assistant 序列视为一个 turn。

---

## 4. 工具链集成（handleToolChain）

`handleToolChain` 调用 `executeToolChain()` 后，按 `config().toolCallMode` 分流收尾。`executeToolChain` 自身不区分模式，始终返回 `{ messages.toolChain, toolChainContent, responseContent, toolCallHistory, stats, status, error, usage }`。

```
result = executeToolChain(...)
if status == 'completed':
  if mode == 'standard':
    tcm = result.messages.toolChain                  // 原生序列（已不含合成 [SYSTEM] user）
    last = tcm[末]
    if last.role == 'assistant':                      // 正常
      message = { role:'assistant', content=extractContentText(last.content), reasoning_content=last.reasoning_content }
      toolChainMessages_persist = tcm[0..-2].map(stripReasoning)   // 剥离中间 assistant 的 reasoning
    else:                                             // 边界 fallback（follow-up 异常，末元素为 tool(incomplete)）
      message = { role:'assistant', content='' }
      toolChainMessages_persist = tcm.map(stripReasoning)
    return { content, reasoning_content, toolChainMessages: toolChainMessages_persist, toolChainResult, usage }
    // 不设 hintSize → finalize 不设 userPromptSlice
  else:  // legacy
    return { content: toolChainContent + responseContent, hintSize: toolChainContent.length, toolChainResult, usage }
else:
  return initialResponse   // aborted/error：退化走 legacy finalize（无 toolChainMessages）
```

`stripReasoning(msg)`：剥离 assistant 消息的 `reasoning_content`（tool 消息 no-op）。`toolChainMessages` 中间 assistant 一律剥离；`message`（末条 assistant）保留 reasoning 供 UI。

**数据源**：`result.messages.toolChain` 由 `executeToolChain` 返回（执行器不改），即 `state.toolChainMessages`。合成 `[SYSTEM]` user 消息（maxRounds 兜底）只进 `state.allMessages` 不进 `toolChainMessages` → 持久化自动排除。
    }
};
```

---

## 5. 结果持久化（lifecycle.finalize）

`finalize()` 将 `ExtendedCompletionResult` 写入 TreeModel 节点，按模式分流：

```typescript
treeModel.updatePayload(id, {
    message: { role: 'assistant', content: result.content, ...reasoning_content },
    usage, time, token,

    // standard: userPromptSlice=undefined，写 toolChainMessages
    // legacy:   userPromptSlice=[hintSize, len]，无 toolChainMessages
    userPromptSlice: result.toolChainMessages
        ? undefined
        : (result.hintSize ? [result.hintSize, result.content.length] : undefined),
    toolChainMessages: result.toolChainMessages ?? undefined,
    toolChainResult: result.toolChainResult ?? undefined   // 两模式均写（UI timeline 元数据源）
});
```

**Standard**：`message.content` = 末条 assistant 最终回复（纯文本/多模态，符合 OpenAI 规范）；`toolChainMessages` = turn 内原生序列；UI 通过 `toolChainResult` 驱动折叠 timeline。

**Legacy**：`message.content` = `toolChainContent + responseContent`（压缩串）；`userPromptSlice[0]` = hintSize = System Hint 字节边界，UI 在 `[0, hintSize)` 折叠 hint、`[hintSize, end)` 显示回复。

**`toolChainResult` 定位**：两模式均产出，是 UI/统计元数据源（timing、llmUsage、rejectReason、stats、status、error），与 `toolChainMessages`（消息序列/回放源）分工；重叠仅只读 `result.data`，无 drift。

---

## 6. ExtendedCompletionResult 类型

```typescript
interface ExtendedCompletionResult extends ICompletionResult {
    hintSize?: number;             // legacy: toolChainContent 字符长度（分隔边界）；standard: 不设
    toolChainResult?: IMessagePayload['toolChainResult'];  // 两模式：UI/统计元数据
    toolChainMessages?: IMessage[];  // standard: turn 内原生序列（不含末条 assistant，已 strip reasoning）
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
