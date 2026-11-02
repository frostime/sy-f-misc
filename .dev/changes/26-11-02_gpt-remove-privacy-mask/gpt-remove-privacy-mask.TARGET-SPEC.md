# GPT Privacy Mask Removal

## User Goal

Remove the GPT privacy masking feature because maintaining its incomplete coverage is not worthwhile. Keep existing user configuration for reference, clearly mark that it no longer takes effect, and notify users whose saved settings show that the feature was enabled.

The notice should explain that privacy masking has been removed for maintainability. If the user is concerned about privacy, recommend preventing sensitive information from being recorded in plaintext at its source, for example by using a private notebook.

## Expected Behavior

- Remove both the current message masking/recovery flow and the legacy keyword masking flow for context-provider data.
- Remove the privacy settings UI and standalone configuration page.
- Preserve existing privacy settings and values in stored configuration. Do not silently change an enabled flag to false or delete configured rules.
- Mark preserved privacy settings as removed/unsupported so their presence cannot be mistaken for an active feature.
- During the one-time settings schema migration, notify users if the prior config had `enablePrivacyMask === true` or non-empty legacy `privacyKeywords`. Do not show the notice to users without either condition.
- The notice must not reveal stored rules or sensitive terms. It must state that masking no longer runs and suggest source-level practices such as using a private notebook and not recording sensitive information in plaintext.
- Do not rewrite existing chat histories.

## Acceptance

1. No production send path masks/recover messages or contexts, and no privacy instruction is added to model prompts.
2. No privacy settings UI or privacy configuration page remains.
3. An upgraded configuration preserves all legacy/current privacy values through load and save, and contains a durable removed-feature marker.
4. Migration signals a notice for previously enabled current settings or non-empty legacy keywords, but not for disabled/empty settings. The schema bump ensures the notice is not repeated on later loads.
5. Tests verify the migration decision and preserved values. GPT tests, type-check, and both build targets pass without new diagnostics.

## Constraints

- Existing configuration data is retained; do not batch-rewrite chat history.
- The migration is additive and must not invalidate older settings formats.
- No real provider calls are needed.
