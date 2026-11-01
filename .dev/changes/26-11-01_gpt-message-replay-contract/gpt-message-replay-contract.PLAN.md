# GPT Message Replay Contract Plan

Target contract: [TARGET-SPEC](gpt-message-replay-contract.TARGET-SPEC.md). Technical route and open provider questions: [METHOD](gpt-message-replay-contract.METHOD.md).

## Mainline

1. **Resolve provider-dependent replay rules** — closed via the conservative exit: no live provider access, no key use. The unresolved questions and the conservative behavior are recorded in METHOD §Provider 验收状态. Nothing is reported as live-verified.
2. **Implement canonical-body replay** — done. Narrow replay metadata, legacy reads, edit invalidation and adapter conversion are implemented; acceptance 1-8 are covered by `tests/gpt-protocol-replay.test.ts`.
3. **Independent review and verification** << CURRENT: the implementer has run the suites below; S301 still owes the independent diff review against TARGET-SPEC. Real-provider evidence does not exist and must not be claimed.

## Current Phase

- Objective: hand the implemented contract to independent review.
- Scope: diff review against TARGET-SPEC (ownership, legacy read, edit invalidation, version isolation, provider mismatch, Gemini signature handling), plus re-running the checks below.
- Exit gate: reviewer finds no target violation; any real-provider question stays marked unverified.

### Verification (2026-11-01, no live provider calls)

| Check | Result |
|---|---|
| `pnpm run test:gpt` | 197/197 通过：chat 40、protocol 72、archive 58、apikey 5、tools 33 |
| `pnpm run type-check` | 仅 5 个既有基线诊断（docfile-tools ×4、model/storage.ts ×1），无新增 |
| `pnpm run build:publish` / `build:private` | 均通过 |
| 真实 Provider | **未执行**。无 key、无额度授权；相关结论一律标为未验证 |

新增契约回归（`tests/gpt-protocol-replay.test.ts`，使用生产 parser/adapter，只替换网络与宿主边界）：

1. 窄记录不含正文本副本，原样回放时与原生 blocks 等价。
2. 编辑窄记录正文后：wire 使用编辑后正文，不再出现旧正文、thinking 或签名。
3. 未编辑的 legacy 全量记录仍原样回放；编辑后旧副本不再覆盖正文。
4. Claude 多个 text 块 → 不写 replay（canonical 边界无法还原）。
5. Gemini 窄记录保留签名-only part，且不复制 `args`；回放与原生 parts 等价。
6. Gemini 流式正文分片在有 thought part 时合并为单个 text slot，且 replay 不含正文。
7. Gemini 正文分片带签名 → 不写 replay（不搬运签名）。
8. Gemini part 出现未知字段 → 回落 canonical。
9. 编辑工具轮中间消息后：wire 使用编辑后正文，`tool_use_id` 与两条 `tool_result` 仍正确关联。
10. reasoning 文本只存在于 `reasoning_content`，新 replay 不含可重建的思考文本（Claude / Gemini 各一条）。
11. Gemini 混合 native-id / no-id 多调用：每个 canonical 调用至多消费一次，wire 无重复 part，`functionResponse.id` 只回到原本拥有它的调用。
12. 窄 replay 的中间消息在持久化后仍保留 `reasoning_content`（否则无法重建），编辑后该字段不被改写。
13. 无签名的 thinking / thought 仍写窄 replay 并原样回放（Claude 与 Gemini 各一条），`extra` 不含 reasoning 文本；编辑后仍不向 wire 发送 reasoning。

## Issues

### I1 · Provider replay requirements after body edits

- Status / readiness: closed-conservative（未做 live spike；无 key 与额度授权）。
- Causal context: Claude replay may depend on thinking blocks; Gemini signatures can attach to text, calls, or empty parts. A correct storage template depends on which native fields may be omitted after editing.
- Resolution: run minimal live requests or cite authoritative protocol rules, and record status/observable behavior. If unavailable, preserve the uncertainty and define conservative fallback; do not imply verified acceptance.

### I2 · Canonical body can be overridden by legacy replay data

- Status / readiness: done（编辑入口删除 replay；legacy 未编辑记录仍原样回放）。
- Causal context: legacy `extra.data.content` / `extra.data.parts` contain body copies and current adapters replay them before consulting `content`.
- Resolution: edited messages send edited `content`; untouched legacy records retain current replay compatibility; old versions remain byte-for-byte unchanged.

### I3 · New replay metadata must preserve native structure without owning canonical fields

- Status / readiness: done（`v: 2` 窄记录 + 保守裁剪；见 METHOD 写侧裁剪表）。
- Causal context: Claude requires ordered blocks; Gemini requires ordered parts, native call IDs, signatures, and empty signed parts; streaming text may be fragmented.
- Resolution: new records contain no second authoritative body/tool arguments; adapters rebuild from canonical fields plus native-only replay metadata, or use the specified deterministic fallback.

### I4 · Provider/model switching and version isolation

- Status / readiness: done（来源三重匹配不变；编辑只写当前版本 payload）。
- Causal context: one conversation can contain answers from multiple providers and reruns create alternative payload versions. Replay metadata must not leak across source or version boundaries.
- Resolution: only compatible source data replays; mismatch uses canonical conversion; edits/reruns leave non-current versions unchanged.

### I5 · Legacy format remains readable

- Status / readiness: done（读侧同时接受无 extra、legacy 全量、窄记录三种形态，无迁移）。
- Causal context: persisted histories may have no replay data or the current full-native `extra` shape.
- Resolution: read both legacy forms without batch migration; editing a legacy replay-bearing message prevents stale text from being sent; new writes use the agreed narrow shape.
