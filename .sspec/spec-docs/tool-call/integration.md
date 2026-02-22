---
name: Chat 集成层（use-openai-endpoints）
description: Tool Call 在 ChatSession 中的完整集成逻辑：注入工具定义、构建 systemPrompt、执行链路、结果保存
updated: 2026-02-22
scope:
  - /src/func/gpt/chat/ChatSession/use-openai-endpoints.ts
  - /src/func/gpt/chat/ChatSession/use-chat-session.ts
deprecated: false
---

# Chat 集成层（use-openai-endpoints.ts）

**位置**：`/src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`

本文档描述 Tool Call 如何嵌入完整的 Chat 请求流程。

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

---

## 4. 工具链集成（handleToolChain）

```typescript
const handleToolChain = async (params: ToolChainParams): Promise<ExtendedCompletionResult> => {
    // 仅当 toolExecutor 存在且第一次响应含 tool_calls 时才调用
    const toolChainResult = await executeToolChain(toolExecutor, initialResponse, {
        contextMessages,       // 发给 LLM 的完整消息历史
        maxRounds: config().toolCallMaxRounds,  // 用户可配置最大轮次
        abortController: controller,
        model,
        systemPrompt: chatHandler.buildSystemPrompt(),  // ← 含 toolRules()
        chatOption: chatHandler.buildChatOption(),
        checkToolResults: true,   // 启用结果审批
        callbacks: {
            onLLMResponseUpdate: (content) => {
                treeModel.updatePayload(targetId, { message: { role: 'assistant', content } });
                scrollToBottom?.(false);  // 流式更新时实时滚动
            },
            onError: (error, phase) => showMessage(`工具调用出错 (${phase}): ${error.message}`)
        }
    });

    if (toolChainResult.status === 'completed') {
        return {
            content: toolChainResult.toolChainContent + toolChainResult.responseContent,
            hintSize: toolChainResult.toolChainContent.length,  // ← 记录分隔位置
            toolChainResult: {
                toolCallHistory: toolChainResult.toolCallHistory,
                stats:  toolChainResult.stats,
                status: toolChainResult.status,
                error:  toolChainResult.error
            },
            usage: toolChainResult.usage,
            ...
        };
    }
};
```

---

## 5. 结果持久化（lifecycle.finalize）

`finalize()` 将 `ExtendedCompletionResult` 写入 TreeModel 节点：

```typescript
treeModel.updatePayload(id, {
    message: { role: 'assistant', content: result.content },
    // content = toolChainContent + responseContent（拼接字符串）
    usage:    result.usage,
    time:     result.time,
    token:    result.usage?.completion_tokens,

    // 工具链专属字段
    userPromptSlice: result.hintSize ? [result.hintSize, result.content.length] : undefined,
    // userPromptSlice[0] = toolChainContent.length = System Hint 的字节边界
    // UI 通过 userPromptSlice 知道哪部分是 "hint"，哪部分是真正的回复

    toolChainResult: result.toolChainResult ?? undefined
    // 保存完整工具调用历史，供 UI 展示工具调用面板使用
});
```

**`userPromptSlice` 的作用**：在 Chat UI 中，`message.content` 是 `toolChainContent + responseContent` 的拼接，`userPromptSlice` 告诉 UI 在位置 `[0, hintSize)` 是 System Hint（可以折叠/隐藏），`[hintSize, end)` 才是展示给用户的真实回复。

---

## 6. ExtendedCompletionResult 类型

```typescript
interface ExtendedCompletionResult extends ICompletionResult {
    hintSize?: number;             // toolChainContent 的字符长度（分隔边界）
    toolChainResult?: IMessagePayload['toolChainResult'];  // 工具调用历史 + 统计
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
