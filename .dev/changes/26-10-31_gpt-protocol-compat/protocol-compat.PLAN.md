# 三协议修复计划

目标见 `protocol-compat.TARGET-SPEC.md`；缺陷依据见 `protocol-compat.AUDIT.md`。工作分支 `fix/gpt-protocol-compat`，代码基线 `d2eb073`。

## Mainline

1. **三协议通信修复与自动回归**：I1–I7 已实施；GPT 全量回归 191/191 通过。
2. **真实服务验收** << CURRENT：尚未向真实 OpenAI-compatible、Claude 或 Gemini 服务发请求；现有证据为官方协议资料与本地假端点往返。

## Current Phase

- `extra` 随回答版本保存协议必须回传的原始数据，由相应适配器还原成 wire 字段；extra 外壳不会发送给 API。
- 本轮只保留三协议通信及其直接引起的请求/回放问题。停止取消、结果审批、块编辑和隐私增强均标记 not-planned，不在此 change 实施。
- Now：已完成自动测试与构建，协议专项 105/105、GPT 全量 183/183、publish/private 构建均通过。完整类型检查仍有 5 个既有错误，位于未修改的 docfile-tools.ts 和 model/storage.ts。工作区未提交。
- 真实 Provider 与思源宿主验收未做。

## Issues

### I1 · 流式模式存在两个相互矛盾的来源

done。三协议统一最终流式模式，禁用能力/开关生效；OpenAI 保留自定义预处理器对 usage 选项的覆盖。Gemini 标准端点可双向切换。生产请求回归在 tests/gpt-protocol-transport.test.ts。

### I2 · 失败、截断和拒绝被记为空成功或正常完成

done。错误状态通过 complete、toolchain、现有回答结果转换保留；正文/usage/已知操作仍保留。提前 EOF、拒绝与已知拦截均有明确结果。相关回归在 protocol stream/native 与 gpt-tools 测试；另修复了非视觉模型收到合法 assistant.content:null 时的崩溃。

### I3 · OpenAI 工具参数片段因全带 id 而不合并

done。相同 id/index 的多个片段只生成一个完整调用；保留 id-only 和先 id-only 后 index-only 的兼容分片。回归在 tests/gpt-protocol-stream.test.ts。

### I4 · Claude 请求可生成矛盾预算或残缺 Schema

done。普通手动 thinking 预算不小于 max_tokens 时明确拒绝；interleaved 例外按明确请求头辨认，依据为官方 extended-thinking 的预算规则。input_schema 保留完整 JSON Schema。生产请求回归在 tests/gpt-protocol-native.test.ts。Gemini Schema 未顺带改。

### I5 · 原生协议回传数据没有载体

done（本地验证通过，在线服务验收未做）。通过 `extra` 保留 Claude raw blocks、Gemini raw parts 与 OpenAI-compatible reasoning data；工具续轮和回答版本保存后仍原样回传。不兼容的 protocol/model/provider extra 不发送。测试覆盖真实 complete、toolchain 和 JSON 历史重载。

### I6 · Gemini 工具调用 ID 与 chunk 位置

done（真实 Gemini 服务未验收）。保留服务端 functionCall.id 并在 functionResponse 回传；没有服务端 ID 时使用本地关联 ID，但不把它伪装成 wire ID。每个 SSE chunk 的 part 位置独立，无 ID 的并列调用不互相覆盖。

### I7 · Gemini JSON Schema 被裁剪

done（真实服务验收未做）。Gemini 工具声明使用 REST API 的 `parametersJsonSchema`，保留输入 JSON Schema 根约束和 `$defs`；Claude 同样保留完整 `input_schema`。合成请求测试检查线上 payload。
