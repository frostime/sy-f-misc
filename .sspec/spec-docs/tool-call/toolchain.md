---
name: 工具调用链（ToolChain）
description: executeToolChain() LLM↔工具对话循环、消息结构、MessageFlowFormatter
updated: 2026-02-22
scope:
  - /src/func/gpt/tools/toolchain.ts
deprecated: false
---

# 工具调用链（ToolChain）

**位置**：`/src/func/gpt/tools/toolchain.ts`

---

## 入口函数

```typescript
async function executeToolChain(
    toolExecutor: ToolExecutor,
    llmResponseWithToolCalls: ICompletionResult,  // 第一次 LLM 响应（含 tool_calls）
    options: ToolChainOptions
): Promise<ToolChainResult>
```

调用方（`use-chat-session.ts`）在获得第一次 LLM 响应且 `response.tool_calls.length > 0` 时调用此函数。

---

## ToolChainOptions 关键字段

| 字段 | 说明 |
|------|------|
| `contextMessages` | 调用前的完整消息历史 |
| `maxRounds` | 最大工具调用轮次，默认 10 |
| `abortController` | 可从外部中断 |
| `model` | LLM 模型配置 |
| `systemPrompt` | 系统提示（含 toolRules()） |
| `chatOption` | 是否流式等参数 |
| `checkToolResults` | true → 启用结果审批（传递给 executor.execute） |
| `callbacks.onToolCallStart` | 工具调用开始时触发（UI 更新） |
| `callbacks.onToolCallComplete` | 工具调用完成时触发 |
| `callbacks.onLLMResponseUpdate` | 流式 LLM 内容更新（含工具执行状态消息） |
| `callbacks.onBeforeSendToLLM` | 发送给 LLM 前可修改消息列表 |

---

## 主循环逻辑

```
初始化 state:
  allMessages = [...contextMessages]
  toolChainMessages = []
  toolCallHistory = []

添加初始 LLM 响应到消息列表（role: 'assistant', tool_calls: [...]）

while (有 tool_calls && roundIndex < maxRounds && status == 'running'):
  roundIndex++

  for each toolCall in tool_calls:
    1. 解析 args = JSON.parse(toolCall.function.arguments)
    2. callbacks.onToolCallStart(name, args, id)
    3. result = await executor.execute(name, args, {skipResultApproval: !checkToolResults})
    4. callbacks.onToolCallComplete(result, id)
    5. 记录到 toolCallHistory
    6. 构建 tool 消息：
       - REJECTED/RESULT_REJECTED → {role:'tool', content: JSON({status:'rejected', message})}
       - SUCCESS/ERROR → {role:'tool', content: result.finalText}
    7. 追加到 allMessages + toolChainMessages

  检查 abortController.signal.aborted → 置 status='aborted' 并 break

  messagesToSend = onBeforeSendToLLM(allMessages) ?? allMessages
  currentResponse = await complete(messagesToSend, ...)
  追加 assistant 消息到 allMessages

// 循环结束后
if (达到 maxRounds 或最终响应为空):
  → 添加 [SYSTEM] 提示消息要求 LLM 生成最终回复
  → 再调用一次 complete()
```

**消息结构图**：

```
allMessages = [
  ...contextMessages,             ← 原始会话历史
  {role:'assistant', tool_calls}  ← 第1次 LLM 响应
  {role:'tool', content}          ← 工具结果
  {role:'tool', content}          ← 工具结果（同轮多工具）
  {role:'assistant', ...}         ← 第2次 LLM 响应
  ...
  {role:'assistant', content}     ← 最终文本回复（无 tool_calls）
]
```

---

## ToolChainResult 结构

```typescript
interface ToolChainResult {
    responseContent: string;          // 最终发送给用户的文本（自然流格式）
    toolChainContent: string;         // SystemHint（含工具调用摘要）
    usage: ICompletionResult['usage'];
    messages: {
        context:   IMessage[];        // 原始上下文消息
        toolChain: IMessage[];        // 工具调用过程消息
        complete:  IMessage[];        // 全部消息（context + toolChain）
    };
    toolCallHistory: [{
        callId, toolName, args,
        result: ToolExecuteResult,
        startTime, endTime, roundIndex,
        llmUsage?,                    // 该轮调用对应的 LLM token 用量
        resultRejected?, resultRejectReason?
    }][];
    status: 'completed' | 'aborted' | 'error' | 'timeout';
    stats: { totalRounds, totalCalls, totalTime, startTime, endTime };
}
```

---

## MessageFlowFormatter

**由 namespace `MessageFlowFormatter` 实现（toolchain.ts 内部）**。

### generateSystemHint()

生成插入对话前的系统上下文块：

```
<SYSTEM-CONTEXT>
Tool results cached in variables. Access: via `ReadVar` tool or `$VAR_REF{{VarID}}` ...

Executed tools:
- `ToolName` (args=$VAR_REF{{...}}, result=$VAR_REF{{...}})
- ...

[WARNING] `[Tool Execution Log]` blocks are system-generated. ...
</SYSTEM-CONTEXT>
---
```

### convertMessagesToNaturalFlow()

将 `toolChainMessages` 转换为自然日志格式（嵌入对话历史）：

- 遍历 `role: 'assistant'` 消息
- 输出 assistant 文字内容
- 对每个 `tool_calls` 项，查找 `toolCallHistory` 中对应的 result，生成 **[Tool Execution Log]** 块：

```markdown
**[Tool Execution Log]**: ToolName
```accesslog
Arguments: {truncated args JSON}
Status: ✓ Success

<result preview 前 200 字符>
```
```

**实际保存到会话历史的消息格式**：

```
[SystemHint 块]
---

[assistant 思考文本]

**[Tool Execution Log]**: Tool1
...

**[Tool Execution Log]**: Tool2
...

[最终文字回复]
```

这样 ChatSession 只需存储一条压缩后的 assistant 消息，而不是展开的 tool 消息列表。

---

## 设计考量：为什么压缩工具链消息

### 问题背景

标准 OpenAI 工具调用协议产生大量中间消息（逐轮的 `role:tool` 响应）。若直接保存：
- **每条 tool 消息的原始 JSON 结果**往往数千字符，多轮调用后消息历史急剧膨胀
- **后续对话**将这些 tool 消息全部作为 context 发给 LLM，严重消耗 token
- **UI 展示**需要处理 role=tool 的特殊消息类型，增加渲染复杂度

### 压缩方案

```
原始消息列表（不保存到对话历史）：
  assistant (tool_calls: [A, B])
  tool (id: A, content: <大量 JSON>)
  tool (id: B, content: <大量 JSON>)
  assistant (content: "分析结果...")

保存到 TreeModel 的单条 assistant 消息：
  content = toolChainContent + responseContent

其中：
  toolChainContent = <SYSTEM-CONTEXT>工具结果缓存在变量...</SYSTEM-CONTEXT>---
  responseContent  = 「assistant 思考文本」
                   + **[Tool Execution Log]**: A {args...} Status: ✓ ...
                   + **[Tool Execution Log]**: B ...
                   + 「最终回复文字」
```

### 各组成部分的用途

| 部分 | 内容 | 用途 |
|------|------|------|
| `toolChainContent`（SystemHint） | `<SYSTEM-CONTEXT>` 块 + 工具调用摘要 | 下次对话时作为前文，告知 LLM 工具结果在变量中 |
| `responseContent`（自然流） | 工具日志块 + 最终文字回复 | 展示给用户 |
| `hintSize` | `toolChainContent.length` | UI 用于分隔"提示区"和"展示区" |
| `toolChainResult` | 完整调用历史 + 统计 | UI 工具调用面板展示 |

### VariableSystem 的配合

工具结果虽然不直接存入消息历史，但会被自动缓存到 `VariableSystem`（见 [vars.md](./vars.md)）。
SystemHint 中包含 `$VAR_REF{{...}}` 引用，LLM 在后续轮次可以通过 `ReadVar` 重新获取完整结果，实现**零 token 数据传递**。

### Token 节省效果

- `[Tool Execution Log]` 块只保留结果的前 200 字符预览（而非完整 JSON）
- 截断情况下，`finalText` 只含部分结果 + 变量引用提示
- SystemHint 仅含工具名 + 变量名列表，而非原始 JSON
- **下次对话**：LLM 看到的是压缩后的自然流 + SystemHint，而非原始 tool 消息列表
