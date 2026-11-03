# Plan

## Mainline

1. **Migration contract and preservation** — done. Schema 3.5 preserves old values, adds a removal marker, and returns a one-time notice decision. Focused migration tests cover current and legacy configurations.
2. **Remove both masking implementations and their UI/static page** — done. Production send/context paths and settings UI are removed.
3. **Verify the full change** — done. Full GPT tests and both builds pass; type-check has only the four pre-existing `docfile-tools.ts` diagnostics; source search finds no active masking code.

## Current Phase

Verification is complete. Preserve unrelated working-tree edits, including existing package/plugin version changes.

**Now:** ready for review/commit.

## Issues

### I1 · Historical privacy configuration must survive feature removal

- Status / readiness: done.
- Causal context: Current settings are merged with defaults and written back as a full snapshot. Removing fields from runtime config would otherwise discard user values.
- Resolution: deprecated fields remain in runtime config snapshots. Schema 3.5 preserves values at their original storage locations and adds `removedFeatures.privacyMask`; tests cover current and pre-2.1 records.

### I2 · Previously enabled users need a one-time notice

- Status / readiness: done.
- Causal context: Removing masking changes what leaves the plugin. Users who enabled the feature must not assume it still protects messages.
- Resolution: schema migration returns a notice decision for enabled current or legacy settings; application displays a value-free notice once because schema advances.

### I3 · Two independent masking paths must be removed

- Status / readiness: done.
- Causal context: The current GPT endpoint masks message requests, while context-provider code still masks context items using legacy keywords.
- Resolution: both runtime paths, settings UI, static page, and privacy-specific types/service were removed. Architecture docs now state the feature is removed.
