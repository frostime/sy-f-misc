# Method

## Adopted Route

Schema `3.5` marks the removal. Migration captures privacy values from both old global settings and current session settings before running historical migrations. It no longer converts/moves legacy privacy settings; after the other historical migrations, it restores each captured value at its original location and adds `removedFeatures.privacyMask: true`.

The migration returns `privacyMaskRemovalNotice` when the original config had `enablePrivacyMask === true`, the original legacy config had non-empty `privacyKeywords`, or the old migration result indicates the feature was enabled. `applyStoredSettingsToRuntime()` shows an acknowledgement-only dialog. Advancing the schema makes this notice one-time for the stored settings file.

Runtime defaults retain deprecated fields so `deepMerge` and `asStorage()` do not discard existing values. Those fields are not read by any request or context path. New snapshots always carry the removed-feature marker.

The deletion removes the current mask service and HTML page, the endpoint mask/recovery flow and privacy system prompt, the legacy keyword processing in context providers, and the settings controls. The old issue file remains as historical context and is marked superseded.

## Notice Copy

Title: `隐私屏蔽功能已移除`

Body: `出于可维护性的考虑，本版本已移除隐私屏蔽功能。此后发送给模型的消息及上下文不再经过本插件的隐私替换。如果你对隐私问题感到担忧，请采取从源头上更有效的方式，例如设置隐私笔记本，避免在笔记中用明文记录敏感信息。原有隐私配置已保留供参考，但不再生效。`

The notice does not include configured rule values.

## Verification

- Migration tests cover enabled current settings, non-empty legacy keywords, disabled/empty settings, repeated migration, and pre-2.1 values at original locations.
- Full GPT tests, type-check, and both build targets are required.
- Production source search must find no masking/recovery functions or page references. Historical migrations and deprecated storage fields are expected to retain privacy names.
- The host dialog is not exercised in-app here; its wiring is checked by type-check/build and the migration decision is unit-tested.
