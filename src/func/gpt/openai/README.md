# GPT OpenAI Adapter Subsystem

This directory implements a unified LLM completion interface supporting three protocols: **OpenAI**, **Claude** (Anthropic), and **Gemini** (Google). The upper layers (chat sessions, tool chains, tiny-agent) all call `complete()` from `complete.ts` using OpenAI-format inputs and outputs; protocol differences are fully encapsulated here.

## Architecture Overview

```
Upper Layer (chat session / toolchain / tiny-agent)
        │ uses OpenAI-format IMessage[], IToolDefinition[], etc.
        ▼
   complete.ts  ── getProviderProtocol() ──► protocol switch
       ├── 'openai'  → original OpenAI fetch + SSE parser (in complete.ts)
       ├── 'claude'  → claudeComplete()  (claude-complete.ts)
       └── 'gemini'  → geminiComplete()  (gemini-complete.ts)
        │
        ▼  all return ICompletionResult  (unified output)
```

**Key files:**

| File | Role |
|------|------|
| `complete.ts` | Entry point; protocol detection + redirect; OpenAI native path |
| `claude-complete.ts` | Full Claude `/messages` adapter (request, streaming, tool calls) |
| `gemini-complete.ts` | Full Gemini `generateContent` adapter (request, streaming, tool calls) |
| `protocol-utils.ts` | Shared helpers: header building, message normalization |
| `response-parse.ts` | Zero-dependency response parsing layer: SSE framing, usage normalization, reasoning normalization, per-protocol stream/nonstream consumers (unit-testable offline) |
| `adpater.ts` | Input normalization: message field whitelisting, option filtering, model config application |
| `claude.d.ts` | TypeScript types for the Anthropic API protocol |
| `gemini.d.ts` | TypeScript types for the Google Gemini API protocol |

---

## Message Mapping

### System Messages

All three protocols handle system prompts differently. `normalizeMessagesWithSystem()` (in `protocol-utils.ts`) extracts all `role: 'system'` messages from the array, merges them with the `systemPrompt` option, and returns a `{ messages, systemPrompt }` pair. The remaining messages never contain system roles.

| | OpenAI | Claude | Gemini |
|---|---|---|---|
| System prompt location | Messages array as `role: 'system'` | Top-level `system` field in payload | `systemInstruction.parts[{text}]` |

### User Messages

| Part type | OpenAI wire format | Claude wire format | Gemini wire format |
|-----------|-------------------|-------------------|-------------------|
| Text | `{type:'text', text}` or plain string | `{type:'text', text}` block | `{text}` part |
| Image (base64 data URL) | `{type:'image_url', image_url:{url:'data:...'}}` | `{type:'image', source:{type:'base64', media_type, data}}` | `{inlineData:{mimeType, data}}` |
| Remote image URL | `{type:'image_url', image_url:{url:'https://...'}}` | ⚠️ not supported (skipped) | ⚠️ not supported (skipped, warning logged) |

### Assistant Messages

| Part type | OpenAI wire format | Claude wire format | Gemini wire format |
|-----------|-------------------|-------------------|-------------------|
| Text | `content: str \| ContentPart[]` | `{type:'text', text}` block | `{text}` part |
| Tool call | `tool_calls: [{id, function:{name, arguments}}]` | `{type:'tool_use', id, name, input:{...}}` block | `{functionCall:{name, args:{...}}}` part |
| Thinking / reasoning | `reasoning_content` / `reasoning` / text in `reasoning_details` | `{type:'thinking', thinking: str}` block | `{text, thought:true}` part |

### Tool Result Messages (`role: 'tool'`)

| Field | Our `IToolMessage` | Claude | Gemini |
|-------|--------------------|--------|--------|
| Link back to call | `tool_call_id` | `tool_use_id` in `tool_result` block | `name` in `functionResponse` |
| Function name | `name` (NEW — added for Gemini) | not needed | `functionResponse.name` |
| Content | string | string (Claude accepts both string and block array) | object (parsed JSON; falls back to `{content: rawString}`) |

---

## Tool Call Lifecycle

```
toolchain.ts builds tool result:
  { role:'tool', tool_call_id: call.id, name: call.function.name, content: result }
        │
        │ adpatInputMessage() whitelist: ['role','content','tool_call_id','tool_calls','name']
        │ (name MUST be in whitelist to survive normalization)
        ▼
claude-complete.ts:
  tool_result = { type:'tool_result', tool_use_id: msg.tool_call_id, content: msg.content }
  (Claude doesn't need name — tool_use_id is sufficient)

gemini-complete.ts:
  name = msg.name  <-- primary source (explicit, zero reconstruction)
       || toolCallIdToName.get(msg.tool_call_id)  <-- fallback for old messages
       || 'tool'   <-- last resort (may break Gemini's association)
  functionResponse = { name, response: parsedContent }
```

### Tool Call ID Stability

**Claude**: server-assigned IDs (`block.id` from `content_block_start`). Globally unique per request. These are passed directly as `tool_use_id` in tool results.

**Gemini non-streaming**: `gemini_call_${partIndex}` — deterministic, stable within a response.

**Gemini streaming**: Per-call counter (`toolCallCounter`) initialized to 0 inside `consumeGeminiStream`. On first encounter of part index, assign `gemini_call_${counter++}`. On subsequent events for the same part index, reuse the same id. This ensures stable ids across multiple streaming chunks.

---

## Response Parsing Layer (`response-parse.ts`)

All response-side semantics live in `response-parse.ts`, which deliberately has **zero imports** (no SiYuan / adapter / store modules) so it can be compiled and unit-tested offline in node (`tests/gpt-protocol-*.ts`, network boundary mocked with fake `Response` objects). Upstream evidence for the shapes below: `.dev/changes/26-10-04T06-45_gpt-subtree-response-compat/reference/protocol-evidence.md`.

### SSE framing

A single `createSseParser()` is used by all three protocols. It buffers across arbitrary network chunk boundaries, handles `\n` and `\r\n` line endings (including a `\r`/`\n` pair split across chunks), concatenates multiple `data:` lines per event (SSE spec), skips `:` heartbeat comments, and flushes a final event that has no trailing blank line. Multi-byte UTF-8 sequences split across chunks are handled by the streaming `TextDecoderStream` before the parser.

### Usage normalization

Missing counts stay `undefined` — nothing is coerced to a fake `0`, and negative values are treated as unreported invalid data. `ICompletionResult.usage` is the shared `ICompletionUsage` type. Normalized output guarantees:

- `prompt_tokens_details.cached_tokens` and `prompt_tokens_details.cache_creation_tokens` are subsets of `prompt_tokens`;
- `completion_tokens_details.reasoning_tokens` is a subset of `completion_tokens`;
- `total_tokens` is inferred only when both normalized `prompt_tokens` and `completion_tokens` are known; a real supplied total is always kept as-is;
- a side component is never manufactured from the other side alone (Claude cache-only raw data does not become `prompt_tokens`; Gemini thoughts-only does not become `completion_tokens`);
- explicit zero counts are preserved (e.g. Gemini `thoughtsTokenCount: 0` → `reasoning_tokens: 0`, Claude `cache_read_input_tokens: 0` → `cached_tokens: 0`).

Per protocol:

| Protocol | prompt_tokens | completion_tokens | cache read | cache write | reasoning tokens | total |
|---|---|---|---|---|---|---|
| OpenAI | as supplied | as supplied | subset; also mapped from DeepSeek `prompt_cache_hit_tokens` when `cached_tokens` unreported, with actual miss kept as `prompt_tokens_details.uncached_tokens` | `prompt_tokens_details.cache_write_tokens` → `cache_creation_tokens` (alias filled only when creation unreported; raw key retained) | subset of completion | as supplied |
| Claude | `input_tokens` + reported caches (folded in); only when `input_tokens` known | `output_tokens` | `cache_read_input_tokens` (subset after folding; reported details retained even when input total is unknown) | `cache_creation_input_tokens` → `cache_creation_tokens` | `output_tokens_details.thinking_tokens` → `reasoning_tokens` | prompt + completion (both must be normalized) |
| Gemini | `promptTokenCount` + additive `toolUsePromptTokenCount` (folded; explicit key `prompt_tokens_details.tool_use_tokens`) | `candidatesTokenCount` + `thoughtsTokenCount` (thoughts folded in; API reports them separately) | `cachedContentTokenCount` (subset) | — | `thoughtsTokenCount` → `reasoning_tokens` | as supplied; inferred = prompt + completion only when both known |

Claude/Gemini RAW usage (additive cache semantics, separate thoughts count) is preserved under `providerMeta.claudeUsage` / `providerMeta.geminiUsage` for exact disambiguation.

### Reasoning normalization

- OpenAI-compatible: `reasoning_content` > `reasoning` > `reasoning_details` (first non-empty wins; OpenRouter sends redundant pairs). Structured `reasoning_details` items contribute only their `text`/`summary` string; `reasoning.encrypted` items and signature-only items are ignored — arbitrary objects are never JSON-stringified into display text.
- Leading think-tag partition: if the content starts with `<think>...</think>` (DeepSeek-style OpenAI-compatible APIs), that prefix's block moves to `reasoning_content`. Only the leading block is extracted (with hold-back of a partially-streamed closing tag while streaming; at stream end / nonstream parse the held literal bytes are released so unmatched text never vanishes); think tags appearing later in content (embedded examples) are left untouched.
- Claude: `thinking` blocks → reasoning; `redacted_thinking` blocks (opaque/encrypted `data`) are dropped and counted in `providerMeta.redactedThinkingBlocks`; signatures ignored.
- Gemini: parts with `thought === true` → reasoning; other `text` parts → content.

### Streaming integration contract (`streamMsg`)

```ts
streamMsg?: (msg: string, toolCalls?: IToolCallResponse[], snapshot?: TStreamSnapshot) => void;
// TStreamSnapshot = Pick<ICompletionResult, 'content' | 'reasoning_content' | 'usage'>
```

- **msg (arg 1, legacy)**: same combined display string as before — reasoning wrapped in `<think>...</think>`, then plain content. Backward compatible.
- **toolCalls (arg 2, legacy)**: tool calls merged so far (OpenAI path now emits them progressively instead of only at the end).
- **snapshot (arg 3, NEW)**: separated plain `content`, plain `reasoning_content`, and the current normalized `usage`.

All three protocols emit on every meaningful event (each reasoning/text delta, tool-call event, usage event), so reasoning streams in before the body appears, and usage arrives on the final usage-bearing event (OpenAI's last chunk has empty `choices` and only `usage`). Emitted `toolCalls` are per-emit deep copies (the live accumulator keeps mutating `arguments`; snapshots must not be retroactively rewritten). Mid-stream read failures are caught inside the consumers: accumulated content / reasoning / usage are returned with `ok: false` and an error suffix, instead of rejecting the whole call.

### Claude Streaming (SSE State Machine)

Claude uses named SSE event types. The parser (`consumeClaudeStream`) maintains:
- `toolCallsById: Map<id, IToolCall>` — accumulates tool calls
- `toolIndexToId: Map<blockIndex, id>` — maps streaming block index to tool call id
- `thinkingIndexes: Set<blockIndex>` — tracks which blocks are thinking blocks

Key events handled:
- `message_start` → extract input token count
- `message_delta` → extract stop reason, output token count
- `content_block_start` — register new text/tool_use/thinking blocks
- `content_block_delta` — `text_delta` (accumulate text), `input_json_delta` (append to tool args), `thinking_delta` (accumulate thinking)

**Fix C**: Tool arg `arguments` initializes to `''` (not `JSON.stringify({})`). Delta events always append unconditionally. This is correct because `input_json_delta` fragments are raw JSON text pieces, not parsed objects.

### Gemini Streaming (SSE Snapshots)

Gemini sends SSE `data: {json}` blocks. Each chunk is a complete partial `IGeminiResponse`. The parser accumulates text and uses a replace-not-merge strategy for function call args — Gemini sends complete arg snapshots (not incremental JSON fragments like Claude).

---

## Known Limitations

| Feature | Claude | Gemini |
|---------|--------|--------|
| Remote image URLs | ❌ skipped | ❌ skipped (warn logged) |
| Audio/file content parts | ❌ not mapped | ❌ not mapped |
| PDF documents | ❌ not mapped | ❌ not mapped |
| JSON mode / structured output | ❌ no explicit mapping | ❌ no explicit mapping |
| Prompt caching (`cache_control`) | ❌ no entry point | N/A |
| `anthropic-beta` header | hardcoded `2023-06-01` | N/A |
| Gemini native features (codeExecution, etc.) | N/A | ❌ no entry point |
| Third-party Gemini proxy endpoint detection | N/A | ⚠️ URL replacement may misfire |

---

## Extension Points

**Adding new option mappings**: Add to `buildClaudePayload()` or `buildGeminiPayload()`. Both functions have a `knownKeys` set — any options NOT in `knownKeys` are transparent-forwarded to the payload, so provider-specific options can be passed as-is.

**New Claude beta features**: Requires updating `buildProtocolHeaders()` to inject the appropriate `anthropic-beta` header. Consider making this configurable per-provider.

**Gemini multimodal uploads**: For large files, Gemini prefers the Files API (`fileData.fileUri`). The current `inlineData` approach only works for small base64 images. A future improvement could add `fileData` support for `.pdf` and large images.
