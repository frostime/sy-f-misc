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
| `protocol-utils.ts` | Shared helpers: header building, message normalization, SSE parsing utils |
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
| Thinking / reasoning | `reasoning_content: str` (OpenAI-style) | `{type:'thinking', thinking: str}` block | N/A |

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

**Gemini streaming**: Per-call counter (`toolCallCounter`) initialized to 0 inside `parseGeminiStream`. On first encounter of part index, assign `gemini_call_${counter++}`. On subsequent events for the same part index, reuse the same id. This ensures stable ids across multiple streaming chunks.

---

## Streaming Implementation Notes

### Claude Streaming (SSE State Machine)

Claude uses named SSE event types. The parser (`parseClaudeStream`) maintains:
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
