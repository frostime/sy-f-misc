# 三协议通信兼容性检查

## 结论与检查范围

用户要求集中检查 OpenAI-compatible Chat Completions、Claude Messages、Gemini generateContent，确认基础通信框架是否可靠。基线为 `d2eb073`，检查前工作区干净。当前结论：普通文本通信的基本映射可用，但工具续轮、流式工具合并和失败处理仍有缺陷，不能把三协议整体标为通过。

本轮只检查，没有修改产品代码。执行了现有测试，核对官方文档，并用合成响应捕获生产适配器的出站请求。没有读取用户的 Provider 配置或密钥，没有请求真实模型。下文“复现”指本地生产代码的行为，不代表已复现真实服务端的 HTTP 400。

本文保留检查时的基线证据。后续修复范围与当前进度见同目录 `protocol-compat.TARGET-SPEC.md`、`protocol-compat.PLAN.md`；不要把下面的基线缺陷全部当作当前仍未修复。

## 已执行的验证

- `pnpm run test:gpt-protocol`：42 项通过；主要测试 `response-parse.ts`，没有覆盖完整请求适配器的工具续轮。
- `pnpm run test:gpt-tools`：33 项通过；其假模型替换了 `complete()`，不能证明三种协议的出站格式正确。
- 额外运行 36 个本地检查场景。三协议的普通非流式文字、system、base64 图片和简单工具声明映射，以及普通流式文字均通过。完整工具往返同时覆盖流式和非流式，捕获到下述数据丢失。

本机临时证据在忽略的 `tmp/`，不属于可长期依赖的测试设施：

- `tmp/protocol-audit/build.mjs`：打包真实 complete、adapter、parser、toolchain，仅替换 SiYuan 提示、日志、模型查找和图像能力查询边界。
- `tmp/protocol-audit/audit.mjs`：用假 fetch 返回合成响应，以只读内存工具运行完整工具往返；始终显式传入合成模型。
- `tmp/protocol-audit/results.json`：36 个场景的观测值；所有场景均完成，无实验设置错误。
- 重跑：`node tmp/protocol-audit/build.mjs`，再执行 `node tmp/protocol-audit/audit.mjs > tmp/protocol-audit/results.json`。
- 现有测试输出：`tmp/protocol-audit-baseline.log`、`tmp/protocol-audit-tools-baseline.log`。

## 1. 工具续轮丢失推理数据：三条路径都有问题

### Claude 原生

`src/func/gpt/openai/response-parse.ts` 的 `collectClaudeBlocks()` 只保留可读 thinking 文本，redacted thinking 只计数；流式消费明确忽略 `signature_delta`。`claude-complete.ts` 的 `toClaudeMessages()` 又只生成 text/tool_use，无法回传原始 thinking 块。

非流式与流式完整工具往返均复现：模型响应中的 thinking、signature、redacted thinking 没有进入续轮请求。官方要求同一次工具调用过程原样回传这些块。

### Gemini 原生

同文件 `collectGeminiParts()` / `consumeGeminiStream()` 不保留 `thoughtSignature`，`gemini-complete.ts` 也无法重建它。非流式与流式往返均确认续轮缺签名。Gemini 3 的签名校验不取决于用户是否手动调高 thinking；相关 functionCall 缺签名可被服务端拒绝。

### OpenAI-compatible：DeepSeek / OpenRouter

`adapter.ts:152` 的消息字段白名单去掉 `reasoning_content` 和 `reasoning_details`。解析层虽然提取了可读推理，但不保留完整的 OpenRouter reasoning_details；工具链生成的 assistant 消息也没有结构化推理数据。

非流式和流式往返均确认 `reasoning_content` 未进入续轮请求。当前 DeepSeek 官方指南明确要求带 tools 的后续请求完整回传 reasoning_content，否则返回 400。OpenRouter 要求保留原始 reasoning_details 的结构和顺序，纯文本不能替代其中的加密内容。

这是特定 OpenAI-compatible 服务的要求，不是 OpenAI 官方 Chat Completions 的通用字段。不能据此把这些扩展盲目发给所有服务。

### 下一次对话也要考虑

`src/func/gpt/chat/ChatSession/tool-chain-result.ts:20-35` 会通过 `stripReasoning()` 从中间 assistant 消息中删除 reasoning_content。仅修单次 complete 或当前工具循环，仍不足以满足后续带历史请求的回传要求。修复前需检查历史重建和版本存储；这不意味着要把签名显示给用户。

## 2. Gemini 的工具调用标识与流式合并不可靠

- 非流式与流式解析都用自造的 `gemini_call_*` 替代服务端 `functionCall.id`；出站 functionCall/functionResponse 没有恢复原 ID。Google 官方 SDK 类型明确说明：服务端给出 ID 时，客户端应在结果中回传匹配 ID。
- `consumeGeminiStream()` 使用当前 chunk 的 `partIndex` 作为整条流的工具调用标识。两个 chunk 各自携带不同 ID 的 functionCall，且都在本 chunk 的第 0 个 part 时，后一调用覆盖前一调用。
- 本地复现输入 `fc_1(q=A)` 和 `fc_2(q=B)`，最终只剩 `gemini_call_0(q=B)`。官方 JS SDK 对各 chunk 的 content 逐项收集，并没有把每个 chunk 的局部 part 下标视为全流标识。

尚未抓取真实 Gemini 服务在多工具输出时的 chunk 布局；已确认当前合并算法无法区分上述两个带不同服务端 ID 的调用。

## 3. 错误没有稳定地传到调用方

以下行为均已本地复现：

- `complete.ts:188-204`：OpenAI 返回 HTTP 429 和 JSON 错误时，结果没有 `ok:false`。
- Claude/Gemini 非流式解析对 `{unexpected:'shape'}` 返回 `ok:true, content:''`；与 OpenAI 已有的结构检查不同。
- Gemini 流式解析对 SSE 中的 `{error:...}` 返回空的成功结果。当前官方资料未确认 streamGenerateContent 在什么条件下发这种错误包，因此此项是对该输入的处理缺口，不宣称已在线出现。
- `toolchain.ts:321-358` 不检查 `complete()` 返回的 `ok`。模拟续轮 HTTP 500 时，工具链最终返回 `status:'completed'`，正文只是错误字符串。

修复应统一返回明确的失败状态，同时保留已经收到的正文与已发生的工具事实。与 `.dev/issues/26-10-31_gpt-stop-and-records.md` 的失败收尾相关，但本轮没有实施那项问题。

## 4. 流式模式的请求与解析选择不一致

`complete.ts` 构造请求时使用适配后的 chatOption.stream，选择响应解析器时却使用外层 options.stream。本地调用只传 `option:{stream:true}` 时，请求已经要求 SSE，返回后却调用 response.json()，最终抛出 SyntaxError；该异步 rejection 也没有被 complete 的 try/catch 转成失败结果。

三条路径都在 `adaptChatOptions()` 检查完 capabilities/toggles 后，用外层 options.stream 覆盖 stream。因此即使模型配置 streaming:false，调用者传 stream:true 仍会发起流式请求。

附带复现：`ensureGeminiEndpointByStream()` 只支持 generateContent → streamGenerateContent 的切换。若用户配置的是 streamGenerateContent?alt=sse，非流式调用不会切回 JSON 端点。默认 generateContent 地址不受此项影响。

## 5. 流正常结束与提前截断没有区分

三协议都在读到 EOF 后直接完成，没有要求协议的终止标志或 finish reason。合成流只发出 partial 正文，不发终止事件，三者都返回 `ok:true`。

已有 read() 抛错测试不能覆盖“连接正常关闭，但协议响应不完整”的情况。Google 官方 SDK 的 chats.ts 会检查 finishReason 后才把流式输出视为完整历史。需要按各协议定义完成状态，不能把 HTTP 字节读完直接等同于模型完成。

## 6. 拒绝回答或安全拦截会显示成空回答

- OpenAI 标准 `message.refusal` 没有被解析；合成 refusal-only 响应变成空的成功回答，拒绝原因丢失。
- Gemini 的 `promptFeedback.blockReason:'SAFETY'` 虽保存在 providerMeta，调用层仍得到空的成功回答。`finishReason` 的其他失败/拦截类型也需要逐项核对，不能把所有非 STOP 情况一概当作错误。

## 7. 参数与工具 Schema 还有局部问题

### Claude 手动 thinking 预算

未指定输出上限时，max_tokens 默认 4096；manual-budget 模式 medium 的默认 budget_tokens 却是 8192。本地捕获到这组矛盾参数。官方要求普通手动 thinking 的预算小于 max_tokens；开启特定 interleaved thinking 时有例外。本例没有启用该例外。

这应在预算/输出上限的配置边界处理，不能只靠更换签名字段解决。模型支持 adaptive 还是 manual-budget 是另一项模型能力限制，不能假定所有 Claude 都支持同一配置。

### 工具 Schema 被静默裁剪

`claude-complete.ts:86-99` 和 `gemini-complete.ts:105-119` 都重建工具根 Schema，只挑出部分字段。合成 Schema 中 properties 里的 `$ref:'#/$defs/Query'` 被保留，根 `$defs` 被删除，变成悬空引用；根 allOf 也丢失。Gemini 还会丢 additionalProperties。

Claude 应保留受支持的完整 JSON Schema；Gemini 应明确采用其支持的 Schema 表达，不能靠删字段把不支持的约束伪装成已支持。真实服务是否接受具体 Schema，需要按各自接口验证；本轮只确认出站语义已变。

### OpenAI 流式工具片段的全 ID 快捷分支

`mergeOpenAIStreamToolCalls()` 在所有片段均带 id 时直接返回原数组，不按 index 合并。合成的两个参数分片都带相同 id/index 时，结果变成两个调用，而不是一个完整调用。OpenAI 标准允许 id 字段存在，不能用“每个片段有 id”推断“每个片段都是完整调用”。已有测试把这个快捷分支当成预期行为，需要一起修正。

## 建议的修复顺序

1. 先明确“展示正文”和“协议回传数据”的分别存放方式，让原始推理块、签名及工具 ID 能经过解析、工具链、后续请求与必要的历史重建。不要只在 parser 上补字段。
2. 修 Gemini 调用合并和 OpenAI 工具片段合并，以完整往返测试保证每个调用恰好一次、参数完整、结果对应。
3. 统一错误与完成状态；让请求、解析器使用同一个最终 stream 值，落实 capabilities/toggles。
4. 修 thinking 预算、工具 Schema 等请求合法性问题，再做真实服务验证。

正式回归需要运行生产 complete/adapter/parser/toolchain，假端点只替代网络边界。至少覆盖每协议流式与非流式的普通回答、两工具往返、推理回传、下一轮带历史、HTTP 错误、流内错误和中途截断。真实服务应另用合成文字与只读内存工具验证，不用用户笔记做试验。

## 官方依据

- Claude thinking 回传：https://platform.claude.com/docs/en/build-with-claude/thinking#preserving-thinking-blocks
- Claude 手动预算：https://platform.claude.com/docs/en/build-with-claude/extended-thinking#budget-rules-and-tuning
- Claude streaming：https://platform.claude.com/docs/en/build-with-claude/streaming
- Gemini 签名、调用与结果顺序：https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures
- Google JS SDK FunctionCall/FunctionResponse 类型：https://github.com/googleapis/js-genai/blob/main/src/types.ts
- Google JS SDK 流式历史收集与完成检查：https://github.com/googleapis/js-genai/blob/main/src/chats.ts
- DeepSeek thinking 工具回传：https://api-docs.deepseek.com/guides/thinking_mode
- OpenRouter reasoning_details：https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- OpenAI Chat Completions Schema：https://github.com/openai/openai-openapi/blob/master/openapi.yaml

官方材料读取于 2026-10-31。ai.google.dev 的 thought-signatures 页面本次只返回导航外壳，因此 Gemini 规则主要依据 Google Cloud 的 generateContent 文档和官方 SDK，不能用新 Interactions API 的格式替代本插件现有接口。
