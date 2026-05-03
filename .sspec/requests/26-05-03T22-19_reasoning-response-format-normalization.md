---
name: reasoning-response-format-normalization
created: 2026-05-03T22:19:02
status: OPEN
attach-change: null
tldr: Normalize OpenAI-compatible reasoning response extraction by classifying string-based vs structured formats; keep Claude/Gemini protocol-native parsers separate.
---

<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this!
-->

# Request: reasoning-response-format-normalization

## Background
`src/func/gpt/openai/adapter.ts` currently extracts assistant reasoning text in `adaptResponseMessage()` by checking only two flat fields:

- `message.reasoning_content`
- `message.reasoning`

That heuristic worked for early OpenAI-compatible reasoning backends, but the project now spans multiple provider protocols and multiple reasoning payload shapes.

Current code reality:

- `claude-complete.ts` already parses Claude thinking blocks directly from the Claude-native response shape.
- `gemini-complete.ts` already builds Gemini thinking requests independently; Gemini response-side thought-summary parsing is still protocol-native work, not adapter work.
- The generic OpenAI-compatible path is still the place where flat-field heuristics matter most.

## Problem
The current reasoning extraction logic is too narrow for the OpenAI-compatible path and too ambiguous as a long-term model:

1. It assumes reasoning output is always a flat string field on `message`.
2. It conflates multiple response families:
   - legacy string fields (`reasoning_content`, `reasoning`)
   - structured reasoning (`reasoning_details`)
   - protocol-native blocks/parts (Claude thinking blocks, Gemini thought summaries)
3. It does not distinguish **parsing strategy** from **provider protocol**.
4. It invites future ad-hoc branches if each new backend adds one more field name.

This is not a blanket bug across all provider files. It is specifically a design gap in the generic OpenAI-compatible normalization layer, plus a potential future gap if structured reasoning outputs are added without classification.

## Current Implementation Status
- **Claude**: response-side reasoning is already handled in `claude-complete.ts` via `content[].type === 'thinking'` and `thinking_delta`.
- **Gemini**: request-side thinking is already handled in `gemini-complete.ts`; response-side thought-summary parsing is protocol-native and should stay there if/when expanded.
- **Adapter**: the generic `adaptResponseMessage()` path is still the main place where OpenAI-compatible reasoning formats are flattened.

## Initial Direction
Normalize only what belongs in the generic OpenAI-compatible layer.

Suggested scope:

1. Keep Claude/Gemini protocol-native parsing in their dedicated files.
2. Treat the adapter as the normalization layer for **OpenAI-compatible** reasoning payloads only.
3. Classify OpenAI-compatible reasoning into at least two buckets:
   - **String-based**: `reasoning_content`, `reasoning`
   - **Structured**: `reasoning_details`
4. If structured formats are supported, either preserve them separately or flatten them with explicit documented lossiness.
5. Do not move Claude/Gemini response parsing into `adapter.ts` unless a separate provider-specific need appears later.

The likely result is a small reasoning-normalization abstraction for the OpenAI-compatible path, instead of more one-off field checks inside `adaptResponseMessage()`.

## Research Findings
### DeepSeek
- Official chat-completions output exposes `reasoning_content` at the same level as `content`.
- Streaming uses `delta.reasoning_content`.
- DeepSeek explicitly warns not to send `reasoning_content` back as-is in subsequent request messages.
- Sources:
  - https://api-docs.deepseek.com/guides/reasoning_model
  - https://api-docs.deepseek.com/guides/thinking_mode

### OpenRouter
- Documents both flat `message.reasoning` and structured `message.reasoning_details`.
- Also allows `reasoning_content` as an alias of `reasoning` in its ecosystem.
- Streaming can expose `delta.reasoning_details`.
- Source:
  - https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

### Gemini
- Official thinking output is part-based, not a flat `reasoning_content` field.
- Thought summaries are exposed through `content.parts[]` with `part.thought === true` when enabled.
- Source:
  - https://ai.google.dev/gemini-api/docs/thinking

### Claude
- Official thinking output is block-based (`content[]` items of type `thinking`).
- Current project already handles this in `claude-complete.ts`.
- Sources:
  - https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
  - https://platform.claude.com/docs/en/build-with-claude/effort

### xAI / Grok
- Public docs emphasize Responses-style reasoning summaries / encrypted reasoning content.
- A stable flat `message.reasoning_content` contract comparable to DeepSeek is not established in the docs reviewed.
- Source:
  - https://docs.x.ai/developers/model-capabilities/text/reasoning

### OpenAI
- Chat Completions docs expose reasoning controls such as `reasoning_effort`, but do not establish a stable plain-text reasoning trace field for chat completion messages.
- Rich reasoning retention is increasingly associated with the Responses API.
- Source:
  - https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/

## Success Criteria
- The generic OpenAI-compatible path no longer relies only on `reasoning_content` / `reasoning` heuristics.
- OpenAI-compatible reasoning payloads are explicitly classified as string-based or structured.
- Claude and Gemini remain protocol-native parsers, not forced into the generic adapter layer.
- Structured reasoning, if supported, is either preserved or flattened with documented lossiness.
- Future providers do not require blindly adding another field-name `if` branch.

## Relational Context
- `src/func/gpt/openai/adapter.ts`
- `src/func/gpt/openai/complete.ts`
- `src/func/gpt/openai/claude-complete.ts`
- `src/func/gpt/openai/gemini-complete.ts`
- `src/func/gpt/openai/protocol-utils.ts`
- `src/func/gpt/types.ts`
- Existing provider-compat work:
  - `.sspec/changes/26-05-03T01-54_chat-options/spec.md`
  - `.sspec/changes/26-05-03T01-54_chat-options/revisions/001-provider-panel-cleanup.md`
  - `.sspec/changes/26-05-03T01-54_chat-options/revisions/003-provider-effort-matrix-ui.md`

Constraints / preferences:
- Prefer explicit format classification over field-name guesswork.
- Keep protocol-native parsers where semantics differ materially.
- Treat this as a future optimization / architecture direction, not an immediate micro-fix.

---

## @AGENT
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILL + `sspec change new --from <this>`.

Start from the research findings above; verify doc drift if implementation happens later.

---

<!-- ============================================================
     MICRO-CHANGE ZONE (optional)
     For tiny changes (≤3 files, ≤30min) that don't need a full change.
     Remove these sections if a change is created instead.
     ============================================================ -->

<!--
## Plan
Quick implementation plan (what files to touch, what to do)

## Done
What was actually done + any notes for future reference
-->
