# Method: GPT Message Replay Contract

## Baseline

Current implementation is on `quasi-main` at `16512cb` when this change was opened. The current protocol work is documented in `.dev/changes/26-10-31_gpt-protocol-compat/`. Relevant contracts and paths:

- `src/func/gpt/types.ts`: `IMessage`, `IMessageExtra`, and `ICompletionResult`.
- `src/func/gpt/types-v2.ts`: `IMessagePayload`; its `toolChainMessages` comment identifies the final message as the unique editable source.
- `src/func/gpt/openai/response-parse.ts`: normalizes provider responses and currently captures complete Claude blocks / Gemini parts.
- `src/func/gpt/openai/claude-complete.ts` and `gemini-complete.ts`: replay compatible `extra` or rebuild from canonical message fields.
- `src/func/gpt/openai/protocol-extra.ts`: protocol/model/provider source compatibility.
- `src/func/gpt/chat/ChatSession/use-chat-session.ts`: final-message and standard-turn edits.
- `src/func/gpt/chat/ChatSession/tool-chain-result.ts`: persistence of intermediate assistant messages.

The independent review found that the internal canonical format already exists. The missing contract is ownership and precedence: current Claude/Gemini `extra` is a second body owner, and same-source replay takes precedence over canonical `content`.

## Proposed Representation

Keep `IMessage` and the V2 version payload. Refine the replay payload written for new responses:

```ts
type ReplaySource = { model?: string; provider?: string };

type ClaudeReplay = {
  protocol: 'claude';
  source: ReplaySource;
  slots: Array<
    | { kind: 'thinking'; block: ClaudeThinkingOrRedactedBlock }
    | { kind: 'text' }
    | { kind: 'tool_use'; id: string }
    | { kind: 'opaque'; block: unknown }
  >;
};

type GeminiReplay = {
  protocol: 'gemini';
  source: ReplaySource;
  slots: Array<
    | { kind: 'thought'; part: GeminiThoughtPart }
    | { kind: 'text'; signature?: string }
    | { kind: 'function_call'; id?: string; signature?: string; opaqueFields?: Record<string, unknown> }
    | { kind: 'empty_signed_text'; signature: string }
    | { kind: 'opaque'; part: unknown }
  >;
};
```

This is a candidate shape, not an instruction to preserve these exact names. The implementation must prove that no visible body text or normalized tool-call arguments are duplicated as authoritative data. Ordering is represented by slot order. Claude tool-use input comes from normalized `tool_calls`; retain any data that cannot be reconstructed, including native IDs. Gemini call IDs and signatures remain attached to their corresponding slots. Multiple text slots must be represented without inventing a segmentation of an edited concatenated body.

OpenAI-compatible `extra` already stores reasoning-only replay fields rather than body text; keep its behavior unless testing shows it violates the target.

## Conversion Rules

1. Parsing creates canonical fields and provider replay metadata separately.
2. Same-source adapter conversion uses canonical `content` for every text slot and canonical `tool_calls` for normalized calls. Replay metadata supplies only native-only values and ordering.
3. A message without replay metadata, or whose source does not match the runtime provider/model, uses the canonical conversion path.
4. Existing full Claude/Gemini `extra` is a legacy representation. Do not reinterpret it as a narrow record. Untouched legacy records may retain exact replay. Any supported content edit must invalidate that legacy copy for the edited version/message.
5. A newly edited narrow-replay message keeps immutable reasoning only where the target provider contract allows it. A signature that may authenticate or bind the edited text must not be blindly reused. Resolve this with protocol evidence/spikes before committing the exact fallback.
6. A single canonical `content` string cannot recover boundaries among multiple text slots around thoughts or tool calls. Do not split edited text heuristically. Define a deterministic fallback for those shapes (likely canonical rebuild with native metadata omitted) and document any loss.
7. Preserve unknown native blocks only if they can be safely placed without duplicating or replacing canonical body/call data. Otherwise use a documented fallback and test it.
8. Replay metadata is stored inside each answer message in its version payload. Rerun writes a new version; it must not mutate existing versions.

## Required Technical Spikes

Before finalizing provider-specific edit behavior, investigate the following. Use official provider documentation and a minimal live API check where credentials/access permit; record exact request and response status without exposing secrets.

- Claude: current comments claim tool continuation may be rejected without thinking, while the no-extra reconstruction path omits thinking. Verify a tool turn with (a) original thinking block, (b) thinking omitted, and (c) text + tool_use only. Establish whether edited content can coexist with unchanged thinking/signature.
- Gemini: verify continuation with and without thought signatures for (a) signed text, (b) signed functionCall, and (c) empty signature-only text. Inspect streaming signature distribution across text chunks. Determine which parts can be omitted after editing without rejection or unacceptable behavior.

If live access is unavailable, keep the target design direction, mark provider-dependent policy unresolved, and do not claim real API acceptance. Prefer a conservative fallback that emits edited canonical content and does not reuse a signature bound to altered content.

## Compatibility

- Read no-extra legacy records through existing canonical conversion.
- Read current full Claude/Gemini `extra` as a distinct legacy shape; retain exact replay for untouched messages.
- Read new narrow replay records through a new explicit shape discriminator (protocol plus a version/kind field if needed to avoid ambiguous structural inference).
- Write only the new representation after the contract and spikes are resolved.
- Do not change the top-level chat-history schema or rewrite stored sessions unless a concrete compatibility failure requires it. Any need for a breaking change returns to the user before implementation.
- When editing legacy full-extra messages, remove/invalidate only the edited copy; preserve other versions and payloads.

## Implementation Boundaries

Keep wire assembly inside the protocol adapters and response capture in `response-parse.ts`. Put shared replay-shape/source discrimination in `protocol-extra.ts` only if it removes duplicated rules. Keep user edit operations responsible for invalidating stale legacy replay; do not spread invalidation logic into unrelated persistence/export code.

Tests should use the existing production adapter/parser harness in `tests/gpt-protocol-replay.test.ts` and lifecycle/version tests. Add narrow contract tests for legacy and new shapes, edit paths, model switching, multi-message tool turns, and version immutability. Mocks prove emitted payload construction, not provider acceptance.

---

## 实施记录：窄 replay 落地（v2）

按 PLAN 阶段 1 的保守出口执行：**没有向任何真实 Provider 发请求，也没有读取或使用 provider key**。以下行为以"不产生第二个所有者"和"不搬运未验证的签名"为准，不宣称 Provider 已接受。

### 形状与判别

- 窄记录：`{ protocol, v: 2, model?, provider?, slots }`；`v` 是显式判别字段。
- legacy 全量记录：`{ protocol, data }`（无 `v`），只读，原样回放，不被重新解释为窄记录。
- 来源继续用顶层 `model` / `provider`，复用 `getCompatibleExtra` 现有的 协议 + model + provider.name 三重匹配，不新增 `source` 结构。
- 判别集中在 `src/func/gpt/openai/replay-contract.ts`；适配器只调用 `prepare*`，不各自判断形状。

### 写侧裁剪（`captureClaudeReplay` / `captureGeminiReplay`）

返回 `undefined` 时表示"不写 replay"，消息完全走 canonical 转换。触发条件：

| 情况 | 处理 | 理由 |
|---|---|---|
| 正文 text slot/run 多于 1 个 | 不写 replay | 一个 `content` 字符串无法还原多个正文段边界 |
| text 块/part 上带未知字段 | 不写 replay | 无法在不复制正文的前提下保留 |
| Claude `tool_use` 缺 id，或带 `type/id/name/input` 之外的字段 | 不写 replay | 无法在不复制参数的前提下关联 |
| 未知块/part 携带 `text/thinking/input/content/args/functionCall/functionResponse` | 不写 replay | 保留原件就会复制正文或参数 |
| 未知块/part 不携带上述字段 | 记为 `opaque` 原样保留 | 保真且不产生第二所有者 |
| Gemini 正文分片 > 1 且带 `thoughtSignature` | 不写 replay | 把签名搬到合并后的文本上是未验证假设 |
| Gemini 正文分片 > 1 且分片签名不一致 | 不写 replay | 无法确定哪个签名有效 |
| 全部 slot 都是可重建类型 | 不写 replay（空对象也不写） | 没有 native-only 数据可存 |

### 读侧重建

- 正文取 `content`，工具参数取 `tool_calls`；`tool_use`/`function_call` slot 只带 id/位置。
- Claude：正文块放在原 text slot 位置；若原纪录没有 text slot 而正文非空，放在第一个 `tool_use` 之前（确定性规则，记录在此）。
- Gemini：`thought` / `empty_signed_text` / `opaque` 里的 part 原样发出；`function_call` slot 的 `id` 只在服务端真的给过时才回传，synthetic id 永不外发。
- `functionResponse.name` / 服务端 id 由同一次前向遍历收集，不再依赖"parts 顺序 ↔ tool_calls 顺序"的隐式对齐（legacy 记录仍按该顺序对齐）。
- 任何 slot 找不到对应 canonical 调用时返回 `undefined`，适配器回落 canonical 转换（会丢 native-only 数据，这是已记录的降级）。

### 编辑失效

- `updateMessage`（末条）与 `updateStandardTurn`（末条 + 中间消息）在写回正文时调用 `stripReplayMetadata`，删除该消息的 `extra`（窄与 legacy 都删）。
- 只影响当前 `currentVersionId` 的 payload；其它版本字节不变；`reasoning_content` 不被改写。
- 不改持久化/导出/归档代码，失效责任只留在编辑入口。

### Provider 验收状态（未验证）

以下问题**没有**真实 API 证据，实施按保守方向回避，不得写成已验证：

1. Claude 工具续轮省略 thinking 是否被拒：现状注释与 main 的长期行为矛盾，未实测。
2. 编辑后只发 `text + tool_use`（不带 thinking）的接受度与质量影响：未实测。当前实现即是此路径（编辑删除 replay）。
3. Gemini 省略 `thoughtSignature` 的降级程度、签名在流式正文分片上的分布、签名能否安全挂在合并后的文本上：未实测。当前实现对"分片 + 签名"直接不写 replay。
4. Claude interleaved thinking 的真实块序列形状：本实现按 slot 顺序原样保留，不假设固定三段式；但该模式下未经真实响应验证。
5. 多 text 块（Claude）与多正文 run（Gemini）的实际出现频率：未知；当前对这类消息不写 replay。

### 已知限制（非本 change 范围）

- 失败轮次会把 `[Error] ...` 文本追加进 `content`，且此时不写 replay。新契约把 `content` 定为唯一正文所有者后，这些错误串会作为助手正文回放。这是既有行为，本 change 不改，也不借机扩大范围。
- Gemini 在"正文分片 + 签名"场景不写 replay，因此该轮失去签名与思考复用；换取的是不搬运未验证签名。

## 复核修订（round 2，独立验收反馈）

### R1 · reasoning 文本不再复制进 replay

第一版把整个 thinking block / thought part 放进 slot，等于把 reasoning 文本存了两份。现已改为**只存长度引用**：

- `ClaudeReplaySlot`：`{ kind: 'thinking'; chars; signature? }`；`redacted_thinking` 与未知类型走 `{ kind: 'opaque'; block }`（无可见 reasoning 文本）。
- `GeminiReplaySlot`：`{ kind: 'thought'; chars; signature? }`。
- 读侧按 slot 顺序从 `message.reasoning_content` 连续切片（`chars` 累积游标）；切片长度不符或游标未覆盖全部 reasoning 时返回 `undefined`，回落 canonical。
- 写侧校验：native 思考段的拼接必须与解析出的 reasoning **逐字相等**，否则不写 replay（防止将来在 canonical 侧加入 think-tag 分区后静默错切）。
- 持久化配合：`tool-chain-result.stripReasoning` 对"带窄 replay 的 Claude/Gemini 消息"保留 `reasoning_content`（否则回放时无从重建）；其它协议维持原有的剥离，避免把 reasoning 灌进 OpenAI 输入。
- OpenAI 边界：`adpatInputMessage` 允许 `reasoning_content` 通过（Claude/Gemini 需要），同时 `toOpenAIWireMessages` 现在**显式丢弃** canonical `reasoning_content`，只从同源 `extra` 还原 reasoning 字段——与改动前的线上行为等价。

写入前后对照：

```text
旧（错误）：extra = [{ kind:'thinking', block:{ thinking:'…原文…', signature } }]
新（正确）：content = '正文'      reasoning_content = '…思考原文…'
            extra = [{ kind:'thinking', chars: 12, signature }]
```

### R2 · Gemini 调用映射：native id 预留 + 单次消费

`buildGeminiParts` 现在：

1. 先收集所有带 native id 的 slot 所引用的 canonical id 作为 `reservedCalls`；
2. 带 id 的 slot 只做精确匹配，且命中已消费调用时视为记录不一致（回落 canonical）；
3. 无 id 的 slot 优先绑定"未被预留且未被消费"的调用，其次才回退到剩余调用；
4. 每个 canonical 调用最多被消费一次（`usedCalls`）。

回归覆盖两组混合顺序（native id 在前 / 在后）：wire 上两个 `functionCall` 不重复、顺序不变、`functionResponse.id` 只出现在原本拥有该 id 的调用上。

### R3 · "存储不可编辑" 与 "续轮是否携带 reasoning" 是两件事

- **存储**：`reasoning_content` 是可编辑 UI 之外的不可编辑字段；编辑正文不会改写或删除它（`stripReplayMetadata` 只删 `extra`）。
- **wire**：正文被编辑后，该消息失去 replay，走 canonical 转换，因此**不会**把旧 thinking/签名发回上游。这是有意的保守行为：签名与旧正文绑定，编辑后复用没有证据支持。它不改变"字段本身仍保留、仍可展示、仍随版本保存"这一事实。

### Provider 状态

仍为**未验证**（未发真实请求、未使用 key）。上面两处修订不改变 METHOD §Provider 验收状态 中的任何未解问题。

## 复核修订（round 3：无签名 reasoning 不再被丢弃）

问题：round 2 的 `needsClaudeReplay` / `needsGeminiReplay` 只在存在 `signature` 时保留 slots，导致"有 reasoning、没有签名"的同源消息回落到 canonical 转换，**未编辑也丢掉了旧版本会回放的 reasoning**。旧解析器只要出现 thinking/redacted_thinking（Claude）或 thought（Gemini）就写 full extra，因此这是相对基线的回归。

修正后的写侧裁剪规则（替代 round 2 中的同名规则）：

| 情况 | 是否写窄 replay | 说明 |
|---|---|---|
| 存在 reasoning slot（`chars > 0`），有或没有签名 | **写** | reasoning 由 `reasoning_content` 按长度重建，不依赖签名 |
| reasoning slot 的 `chars === 0` 且无签名 | 不写（除非还有其它 native-only 数据） | 该 slot 不携带任何可保留内容 |
| `opaque` / `empty_signed_text` / 文本或调用的签名 / 服务端调用 id | 写 | 无法从 canonical 字段重建 |
| 只有 text / tool_use / 无 id 的 function_call | 不写 | 完全可由 `content` + `tool_calls` 重建 |

不变量不变：`extra` 不复制 reasoning 文本；编辑后仍删除 replay，`reasoning_content` 字段保留但不向 wire 发送。

**残留风险（未验证）**：Claude 的 thinking 块没有 `signature` 时，回放会发出不带签名的 thinking 块。这与改动前的基线行为一致（旧代码原样回放收到的块），但上游是否接受缺少签名的 thinking 块没有实测证据；一旦真实 Provider 拒绝，应改为"无签名时不发 thinking 块"（仍需先取证据）。
