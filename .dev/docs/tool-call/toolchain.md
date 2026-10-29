---
name: 工具调用链（ToolChain）
description: executeToolChain() 的 LLM↔工具循环、原生消息结构、停止条件与已知未修复行为
updated: 2026-10-30
scope:
  - /src/func/gpt/tools/toolchain.ts
deprecated: false
---

# 工具调用链（ToolChain）

**位置**：`/src/func/gpt/tools/toolchain.ts`

`executeToolChain` 只负责循环与消息组装：它产出原生 `IMessage[]`，不做压缩、不写变量、不改 TreeModel。持久化形态由集成层决定，见 [integration.md](./integration.md)。

---

## 入口函数

```typescript
async function executeToolChain(
    toolExecutor: ToolExecutor,
    llmResponseWithToolCalls: ICompletionResult,  // 第一次 LLM 响应（含 tool_calls）
    options: ToolChainOptions
): Promise<ToolChainResult>
```

调用方为集成层的 `handleToolChain`（`use-openai-endpoints.ts`），条件是首次响应带 `tool_calls`。

---

## ToolChainOptions 关键字段

| 字段 | 说明 |
|------|------|
| `contextMessages` | 调用前的完整消息历史 |
| `maxRounds` | 最大工具调用轮次，默认 10 |
| `abortController` | 可从外部中断 |
| `model` / `systemPrompt` / `chatOption` | 后续 `complete()` 请求参数 |
| `toggles` | 参数显式开关，透传给 `complete()` |
| `checkToolResults` | true → 启用结果审批（作为 `skipResultApproval: false` 传给 `executor.execute`） |
| `callbacks.onToolCallStart` | 工具调用开始时触发（UI 更新） |
| `callbacks.onToolCallComplete` | 工具调用完成时触发 |
| `callbacks.onLLMResponseUpdate` | 流式 LLM 内容更新（含工具执行状态文本） |
| `callbacks.onLLMResponseComplete` | 单轮 LLM 响应完成 |
| `callbacks.onBeforeSendToLLM` | 发送给 LLM 前可返回修改后的消息列表 |
| `callbacks.onError` | 按阶段（`parse_arguments` / `tool_execution` / `llm_response` / `final_response` / `chain_execution`）报错 |

---

## 主循环逻辑

```
初始化 state:
  allMessages = [...contextMessages]
  toolChainMessages = []          ← 持久化来源
  toolCallHistory = []

追加初始 LLM 响应（role:'assistant', tool_calls:[...]）

while (有 tool_calls && roundIndex < maxRounds && status == 'running'):
  roundIndex++

  for each toolCall in tool_calls:
    1. args = JSON.parse(toolCall.function.arguments)
       解析失败 → 追加 tool 消息 {error: 'Failed to parse arguments as JSON: ...'}，跳过该调用
    2. callbacks.onToolCallStart(name, args, id)
    3. result = await executor.execute(name, args, {skipResultApproval: !checkToolResults})
    4. 记录 historyEntry（callId/toolName/args/result/startTime/endTime/roundIndex）
    5. 构建 tool 消息：
       - EXECUTION_REJECTED / RESULT_REJECTED
           → {role:'tool', content: JSON({status:'rejected', message: rejectReason})}
           并在 historyEntry 标记 resultRejected / resultRejectReason
       - SUCCESS → content = finalText ?? JSON.stringify(data)
       - 其他失败 → content = finalText ?? JSON.stringify({error})
    6. 追加到 allMessages + toolChainMessages

  检查 abortController.signal.aborted → status='aborted' 并 break

  messagesToSend = onBeforeSendToLLM(allMessages) ?? allMessages
  currentResponse = await complete(messagesToSend, ...)
  追加 assistant 消息（content / reasoning_content / tool_calls）
  累积 usage，并把本轮 usage 回填到本轮 historyEntry.llmUsage

  LLM 调用抛错 → status='error'，break
```

**消息结构图**：

```
toolChainMessages = [
  {role:'assistant', tool_calls:[A]}       ← 第1次 LLM 响应
  {role:'tool', tool_call_id:A, content}   ← 工具结果（同轮多工具则多条）
  {role:'assistant', ...}                  ← 第2次 LLM 响应
  ...
  {role:'assistant', content}              ← 最终文本回复（无 tool_calls，可能不存在）
]

allMessages = [...contextMessages, ...toolChainMessages（含内部追加的 [SYSTEM] user 提示）]
```

`role:'tool'` 消息始终携带 `tool_call_id` 与 `name`，内容是模型可见的 `finalText`，不含变量引用或压缩日志。

---

## 停止与收尾

循环退出后，若 `status == 'running'` 且（仍有未执行的 `tool_calls` 或最终内容为空），执行一次收尾请求：

1. 为每个未执行的 tool call 追加占位消息 `{status:'incomplete', reason:'max_rounds_reached'}`（同时进入两个消息列表，不再执行）；
2. 向 `allMessages` 追加一条 `role:'user'` 的 `[SYSTEM]` 提示，要求模型总结已完成部分并给出回复（**只进 `allMessages`，不进入 `toolChainMessages`**）；
3. 调用一次 `complete()` 取得最终回复；该回复同时追加到两个消息列表。

收尾请求失败只记录 `onError(error, 'final_response')`，不改变状态：链仍以 `completed` 返回，此时末条消息可能不是 assistant，由集成层处理边界。

状态取值：

| status | 产生条件 |
|--------|---------|
| `completed` | 循环正常结束，或收尾请求完成后 |
| `aborted` | 工具轮次之间检测到 `abortController.signal.aborted` |
| `error` | LLM 请求抛错或链外层异常 |
| `timeout` | 类型中保留，当前执行路径不会产生 |

---

## ToolChainResult 结构

```typescript
interface ToolChainResult {
    responseContent: string;          // 末次 LLM 响应文本
    usage: ICompletionResult['usage']; // 各轮累加
    messages: {
        context:   IMessage[];        // 原始上下文消息
        toolChain: IMessage[];        // 本轮助手/工具消息序列（持久化源）
        complete:  IMessage[];        // context + toolChain + 内部 [SYSTEM] user 提示
    };
    toolCallHistory: [{
        callId, toolName, args,
        result: ToolExecuteResult,    // 已裁剪：只保留 status/data(finalText)/error/rejectReason
        startTime, endTime, roundIndex,
        llmUsage?,                    // 该轮调用对应的 LLM token 用量
        resultRejected?, resultRejectReason?
    }][];
    status: 'completed' | 'aborted' | 'error' | 'timeout';
    error?: string;
    stats: { totalRounds, totalCalls, totalTime, startTime, endTime };
}
```

返回前 `toolCallHistory[].result` 被裁剪，不携带 `formattedText` / `isTruncated` 等执行期字段，避免重复保存工具输出。

---

## 已知未修复行为（本轮范围外）

以下行为仍然存在，改动前应先确认是否需要单独立项：

1. **错误结果不走结果审批**：`ToolExecutor.execute()` 在工具返回非 `SUCCESS` 时提前返回，`resultApprovalPolicy: 'on-error'` 实际不会对错误结果触发审批。
2. **中断/失败丢掉已完成的工具记录**：集成层在 `status != 'completed'` 时回退到首次响应，本轮已执行的 tool 消息不进入回答版本。
3. **工具链后续请求不经隐私屏蔽**：首轮请求由 `chatHandler` 做 `maskMessages`，工具链内部再次 `complete()` 时直接发送 `allMessages`。

删除变量系统后，被拒绝的结果不再有“变量仍可读”的旁路；这不等于上述审批、中断与隐私问题已修复。
