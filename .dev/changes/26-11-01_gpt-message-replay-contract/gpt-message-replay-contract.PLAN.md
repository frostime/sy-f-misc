# GPT Message Replay Contract Plan

Target contract: [TARGET-SPEC](gpt-message-replay-contract.TARGET-SPEC.md). Technical route and open provider questions: [METHOD](gpt-message-replay-contract.METHOD.md).

## Mainline

1. **Resolve provider-dependent replay rules** << CURRENT: verify Claude continuation/thinking behavior and Gemini signature behavior. Exit when outcomes are recorded and the safe edit/replay fallback is explicit. If live API access is unavailable, mark the exact questions unresolved and choose a conservative implementation boundary for user review.
2. **Implement canonical-body replay**: add narrow replay metadata, preserve legacy reads, update edit invalidation and adapter conversion. Exit when acceptance cases 1-8 pass in focused tests, with no unrelated changes.
3. **Independent review and verification**: review the diff against TARGET-SPEC, run GPT tests, type check and build, inspect version/legacy behavior. Report real-provider evidence separately from mocked results. User confirmation is needed before any target change or breaking migration.

## Current Phase

- Objective: establish the provider facts needed to avoid reusing invalid signatures or dropping required continuation state.
- Scope: Claude tool continuation with/without thinking; Gemini continuation with/without signatures on text/functionCall/empty parts; streaming signature placement.
- Do not implement broad message-model changes until the fallback policy is explicit. Read-only code/doc investigation can proceed in parallel with preparing minimal test requests.
- Exit gate: METHOD records evidence, unresolved cases, and deterministic behavior after content edit. No provider secrets or raw credentials in artifacts.
- Now: design documents created on `refactor/gpt-message-replay-contract`; implementation not started.

## Issues

### I1 · Provider replay requirements after body edits

- Status / readiness: needs-spike.
- Causal context: Claude replay may depend on thinking blocks; Gemini signatures can attach to text, calls, or empty parts. A correct storage template depends on which native fields may be omitted after editing.
- Resolution: run minimal live requests or cite authoritative protocol rules, and record status/observable behavior. If unavailable, preserve the uncertainty and define conservative fallback; do not imply verified acceptance.

### I2 · Canonical body can be overridden by legacy replay data

- Status / readiness: ready after I1 policy.
- Causal context: legacy `extra.data.content` / `extra.data.parts` contain body copies and current adapters replay them before consulting `content`.
- Resolution: edited messages send edited `content`; untouched legacy records retain current replay compatibility; old versions remain byte-for-byte unchanged.

### I3 · New replay metadata must preserve native structure without owning canonical fields

- Status / readiness: ready after I1 and representation decision.
- Causal context: Claude requires ordered blocks; Gemini requires ordered parts, native call IDs, signatures, and empty signed parts; streaming text may be fragmented.
- Resolution: new records contain no second authoritative body/tool arguments; adapters rebuild from canonical fields plus native-only replay metadata, or use the specified deterministic fallback.

### I4 · Provider/model switching and version isolation

- Status / readiness: ready.
- Causal context: one conversation can contain answers from multiple providers and reruns create alternative payload versions. Replay metadata must not leak across source or version boundaries.
- Resolution: only compatible source data replays; mismatch uses canonical conversion; edits/reruns leave non-current versions unchanged.

### I5 · Legacy format remains readable

- Status / readiness: ready.
- Causal context: persisted histories may have no replay data or the current full-native `extra` shape.
- Resolution: read both legacy forms without batch migration; editing a legacy replay-bearing message prevents stale text from being sent; new writes use the agreed narrow shape.
