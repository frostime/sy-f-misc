# SiYuan v3.7 AI configuration compatibility — LAND

## Change narrative

Keep `model_resolution.ts` as the single owner of translating SiYuan's active AI configuration into the plugin's existing `IRuntimeLLM`. Add an explicit version boundary matching the pattern already used in `src/func/post-doc/core.ts`: SiYuan versions before 3.7.0 read `ai.openAI`; versions from 3.7.0 onward resolve only the active editing model through `ai.editing.modelId` and enabled providers/models.

The resolved SiYuan model continues to use the plugin's existing OpenAI-compatible request path. This change does not import SiYuan providers into the plugin provider store, interpret SiYuan's `protocol` field, or alter fallback behavior for plugin-defined models.

When the currently selected model is specifically `siyuan` but no active SiYuan model can be resolved, the two chat entry points expose an unavailable-model state and do not issue a request. This is a targeted exception before their existing behavior; it does not remove or reorder fallback behavior for any other missing model.

## Repository shape

```text
.dev/changes/26-08-04T18-21_siyuan-ai-v370-compat/
└── siyuan-ai-v370-compat.LAND.md
    create, review artifact
    Records the compatibility boundary and prevents scope drift.

src/func/gpt/model/
└── model_resolution.ts
    modify, roughly +30–45/-5–10 lines, local extension
    Owns version-gated reading, active editing-model lookup, OpenAI runtime mapping,
    and whether “思源内置模型” is available for model lists.

src/func/gpt/chat/
└── main.tsx
    modify, roughly +10–20/-0–5 lines, minor targeted behavior change
    Stops only the `siyuan`-selected/missing case before the existing fallback chain,
    displays the unavailable state, and prevents sending with the existing placeholder runtime.

src/func/gpt/chat-in-doc/
└── floating-chat.tsx
    modify, roughly +10–20/-0–5 lines, minor targeted behavior change
    Applies the same request guard and visible unavailable state to the document-chat entry point;
    all other document-chat behavior remains intact.
```

No new production module, provider abstraction, configuration migration, or global type declaration is planned. SiYuan configuration compatibility types remain local to the resolver because they are only consumed there.

## Cross-file contracts

1. `model_resolution.ts` is the sole authority for whether the special model ID `siyuan` is resolvable. Callers must not inspect `window.siyuan.config.ai` themselves.
2. `useModel('siyuan', 'null')` returns `null` for an absent or inactive SiYuan model. The default throwing mode reports a meaningful configuration error instead of leaking a property-access `TypeError`.
3. `listAvialableModels()` includes `siyuan` if and only if the resolver can currently produce its runtime model. Plugin-defined model listing is unchanged.
4. For SiYuan >= 3.7.0, resolution accepts only the model selected by `editing.modelId` under an enabled provider and enabled model. The request mapping is `baseURL + /chat/completions`, `model.name`, and `provider.apiKey`, with OpenAI protocol semantics.
5. For SiYuan < 3.7.0, the existing `ai.openAI` mapping is retained. The version split follows `siyuanVersion().compare('3.7.0')`, as in `src/func/post-doc/core.ts`.
6. UI request guards apply only when the selected ID is `siyuan` and contract 2 returns `null`. Missing plugin-defined models continue through the pre-existing fallback chain unchanged.

## Explicit non-goals

- Unifying SiYuan providers with the plugin's `llmProviders` store.
- Supporting native Claude or Gemini request formats from SiYuan's `protocol` field.
- Copying SiYuan editing parameters such as temperature or history limits.
- Changing fallback order or failure behavior for plugin-defined models.
- Adding migration or persistence changes for `defaultModelId` or chat histories.
- Refactoring the existing placeholder runtime or making `IRuntimeLLM` nullable throughout chat code.

## Verification intent

The change must preserve these observable cases:

| Case | Expected behavior |
|---|---|
| SiYuan < 3.7.0 with valid `ai.openAI` | “思源内置模型” remains listed and resolves as before |
| SiYuan >= 3.7.0 with an active editing model | The option is listed and requests use the selected provider/model via OpenAI-compatible chat completions |
| SiYuan >= 3.7.0 without `editing.modelId` | The option is absent; an existing `siyuan` selection shows “未配置模型” and cannot send |
| Editing model or its provider is disabled/missing | Same unavailable behavior; no automatic fallback from the `siyuan` selection |
| A plugin-defined selected model is missing | Existing fallback behavior remains unchanged |
| A valid plugin-defined model is selected | Resolution and requests are unchanged |

Static verification: run `pnpm type-check` and the publish build. Runtime verification should cover both main chat and document chat because each owns its own send path.

## Drift triggers

Stop for review if implementation requires any of the following:

- modifying `complete.ts`, provider persistence, or shared GPT types;
- changing fallback logic for IDs other than `siyuan`;
- creating a general SiYuan-provider adapter layer;
- touching additional chat entry points beyond a direct request guard;
- materially exceeding the local-extension magnitudes above.
