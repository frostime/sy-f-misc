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
