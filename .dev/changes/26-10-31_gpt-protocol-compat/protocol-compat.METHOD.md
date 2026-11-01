# 三协议修复方法

## 已接受的方向

用户建议在以 OpenAI 消息为基础的内部结构中增加 `extra` 承载特殊兼容数据。这里没有已证实的存储空间冲突；只存在内存不能覆盖历史重载，因此必要数据随回答版本保存。

`IMessageExtra` 定义在 `src/func/gpt/types.ts`。它按协议区分 payload：Claude 的原始 content blocks、Gemini 的原始 parts、OpenAI-compatible 的原始 reasoning 字段。展示正文仍使用原来的 content/reasoning_content。`extra` 不作为 API 字段发送。

## 数据归属与往返

- `response-parse.ts` 同时生成显示文本与 replay 数据。签名、redacted thinking、encrypted reasoning 不展示，也不从显示文字重建。
- `protocol-extra.ts` 负责来源判断与 replay 中可读文本的识别。来源只记录模型名、provider 名，不保存 URL、header 或密钥。
- 三种适配器只在协议及已记录来源匹配时恢复原生字段。无 extra 的旧消息仍走原转换；切换来源不自动发送旧协议数据。
- `toolchain.ts` 保留每条 assistant 的 extra；`tool-chain-result.ts` 在剥离中间展示推理时保留 extra；`message-lifecycle.ts` 将末条 assistant 的 extra 写入启动时准备的回答版本。
- 历史保存仍用既有 JSON/树版本结构，不新增仓库、不迁移全部旧会话。用户明确编辑正文时清除该消息的旧 extra，避免适配器用旧原文覆盖编辑。

## 响应式历史的传输快照

历史和设置可能来自 Solid store proxy，直接 structuredClone 会抛 DataCloneError。消息与选项在 adapter 边界按其 JSON 传输类型生成普通对象快照；聊天入口从 config.unwrap() 获取原始设置再捕获本轮配置。原始响应的 replay 数据随后才能安全复制。

普通 JSON 重载测试不覆盖这个问题；replay 测试另使用真实 useStoreRef，并先断言其嵌套 extra 确实不能直接 structuredClone，再检查真实 complete 能正常发送且历史不被修改。

## 流式语义的依据

OpenRouter reasoning_details 按官方 OpenRouterTeam/ai-sdk-provider 的规则组装：连续 text/summary 片段拼接；signature 关闭所属 text block；后续 text 即使 index 相同也开启新 block；encrypted 和未知记录保持独立。官方实现与测试已检查，不能按 index 合并全部 reasoning blocks。

Gemini parts 的数组下标只属于当前 chunk。无服务端 id 的完整 functionCall 按独立调用处理；有 id 时保留该 id 并用于结果关联。不得把本地合成 id 发到原始 signed Part。独立的空文字签名 part 也保留。Vertex 专有的 partialArgs/willContinue 参数流不在当前解析能力内，明确失败，不以空参数启动工具。

Gemini JSON Schema 使用原生 `parametersJsonSchema` 字段，与 `parameters` 互斥。该字段已在实际公开 REST discovery 中确认：`https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta` 的 schemas.FunctionDeclaration.properties.parametersJsonSchema。工具参数是 JSON Schema，不能按 Gemini 的另一种 Schema 对象挑字段后丢掉 `$defs` / 根约束。

## 范围

本轮只处理三种模型协议的通信和由此产生的原始回传数据问题。隐私、停止取消、结果审批、块编辑等其他功能不在本轮计划内。

## 验证范围

`tests/gpt-protocol-replay.test.ts` 运行真实 complete、解析器、适配器与工具链，用假 fetch 和只读内存工具检查：六种协议/流式组合、两工具、JSON 历史重载后的再次请求、原始块顺序和签名、无 id 的独立 Gemini 调用。

`tests/gpt-tools.test.ts` 用真实版本生命周期与树序列化检查 extra 不串版本、不在 JSON 重载时丢失。传输测试另检查来源隔离、extra 不出现在 API 请求中。真实服务端验收尚未执行，不把这些测试当成三个在线服务已通过。
