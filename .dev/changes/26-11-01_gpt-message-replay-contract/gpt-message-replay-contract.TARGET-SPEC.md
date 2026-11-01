# GPT Message Replay Contract

## Problem

The GPT subsystem already has an internal message format (`IMessage`) and versioned payloads (`IMessagePayload`). `content` is the editable assistant body. Claude and Gemini adapters also store and replay complete native assistant blocks/parts in `extra`. When same-source replay data exists, the adapters send it instead of rebuilding from the current `content`, so an edit can be silently ignored. The full native copy also duplicates body text and makes protocol behavior depend on the producer and history shape.

This change defines the boundary between stored internal messages and provider-specific replay data. It does not replace the existing canonical message model.

## User Goals and Expected Behavior

- Editing assistant `content` changes the body sent in subsequent requests. No stale replay payload may override edited content.
- Reasoning and fields without a plugin edit UI are immutable through supported plugin workflows. Direct JSON edits are outside scope.
- Each answer version remains self-contained. Editing or rerunning the current version must not mutate older versions.
- A conversation may switch providers/models or mix answers from different providers. Provider-specific replay data is used only when compatible with its recorded source; otherwise the adapter converts the internal message without sending foreign native fields.
- Existing histories remain readable. Avoid a breaking storage change. If a breaking change becomes necessary, stop and propose an explicit versioned compatibility/migration approach before implementation.
- New replay data stores only provider-specific information that cannot be reconstructed from canonical message fields. It must not store a second authoritative copy of visible body text or normalized tool-call arguments.
- When replay data is absent, stale, incompatible, or not safely applicable, conversion from the internal message must not silently use old text. Any loss of native-only metadata must follow the documented fallback rules.

## Scope

In scope:
- Claude, Gemini, and OpenAI-compatible assistant replay metadata and request conversion.
- Existing message edit paths, tool-chain intermediate assistant messages, source compatibility, version isolation, and legacy full `extra` records.
- Tests for storage compatibility and emitted request bodies.

Out of scope:
- Privacy masking or removal of privacy features.
- New editing controls for reasoning, tool calls, or protocol metadata.
- Broad chat-history schema migration or rewriting existing histories.
- Provider features unrelated to replay correctness.

## Architecture and Quality Constraints

- `IMessage` and `IMessagePayload` remain the canonical internal message and per-version storage contracts unless implementation evidence proves they cannot satisfy this target; any proposed replacement requires review before coding.
- `content` is the sole owner of editable visible body text. `tool_calls` is the normalized owner of tool names and arguments. Replay metadata cannot override either.
- `reasoning_content` remains the normalized, immutable reasoning field under current UI behavior. Provider-native signatures, encrypted/redacted blocks, IDs, ordering, and opaque fields may live in replay metadata when required for compatible replay.
- Replay metadata is version-local and source-bound. A provider/model mismatch uses ordinary canonical conversion, not cross-provider replay.
- The reader must support existing histories with no `extra` and histories with the current full native `extra`. Do not batch-migrate or rewrite old histories.
- Editing content in an old-format message must prevent its old full `extra` from replacing that edited text. Older versions remain unchanged.
- Unknown native blocks/parts must not be silently corrupted. Preserve as opaque data when safe, or use a documented fallback that does not claim exact replay.
- Do not claim provider acceptance based only on mock endpoints. Mark real-provider checks separately.

## Acceptance

1. Editing a final assistant body produces a request with the edited body and no stale body text, for Claude and Gemini.
2. Editing an intermediate assistant message in a standard tool turn has the same result; tool calls/results remain associated correctly.
3. An untouched same-source message can preserve supported native replay fields and ordering.
4. Legacy messages without `extra` remain convertible. Legacy full `extra` remains readable and replayable when untouched; after editing, stale replay cannot win.
5. Switching protocol/provider/model never sends incompatible native replay data.
6. Rerun/version operations preserve prior version payloads and associate replay metadata with the exact answer version that produced it.
7. Gemini replay handles stream-fragmented text, empty signature-only parts, signatures on different part kinds, server function-call IDs, and no-ID calls without inventing wire IDs.
8. Claude replay handles thinking, redacted thinking, multiple text blocks, ordering, tool calls, and opaque future blocks according to the selected fallback policy.
9. The tests exercise production parsers/adapters and assert wire request bodies. Any behavior that depends on provider acceptance is verified against the real API or explicitly left as an unresolved risk.

Agent owns automated tests, type checks, builds, and code review. Real-provider validation requires provider access and is reported separately; it must not be represented as passing without evidence.
