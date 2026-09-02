# Zotero Module SPEC

Scope:
- SiYuan plugin module: `src/func/zotero/`
- Zotero bridge extension: `src/external/zotero-bridge/`

This SPEC defines behavior and release contracts that future changes must preserve. It is not an implementation walkthrough.

## User-visible behavior

The module provides three observable behaviors:

1. Paste normalization
   - When the clipboard text matches Zotero annotation-link text, the paste processor rewrites it to a simpler SiYuan Markdown link.
   - Non-matching paste content must be left untouched.

2. Selected-item citation insertion
   - The slash command for Zotero citation reads the currently selected Zotero item list through the bridge extension.
   - One selected item inserts one Markdown link.
   - Multiple selected items insert a Markdown bullet list.
   - Empty or unavailable selection inserts nothing after clearing the slash command trigger.

3. Selected-item note import
   - The slash command for note import first reads selected Zotero item keys through the bridge extension.
   - For each selected item, notes are read through Zotero Local API.
   - Imported note HTML is converted to Markdown before insertion.
   - Zotero citation spans, annotation spans, annotation images, math spans, and PDF links must keep their current conversion semantics.

## Zotero integration boundary

The SiYuan plugin must not execute arbitrary JavaScript inside Zotero.

Current integration split:

| Need | Source | Endpoint |
|---|---|---|
| Zotero process / Local API availability | Zotero built-in server | `http://127.0.0.1:23119/api/` |
| Zotero connector ping fallback | Zotero built-in connector endpoint | `http://127.0.0.1:23119/connector/ping` |
| Current Zotero UI selection | sy-f-misc Zotero bridge extension | `http://127.0.0.1:23119/f-zotero-ext/api/v1/selected` |
| Bridge health | sy-f-misc Zotero bridge extension | `http://127.0.0.1:23119/f-zotero-ext/api/v1/status` |
| Item child notes | Zotero Local API | `http://127.0.0.1:23119/api/users/0/items/{itemKey}/children` |

The bridge extension is intentionally limited to Zotero UI state that Zotero Local API does not expose.

## Bridge API contract

Bridge extension ID:

```text
f-zotero-ext@frostime.github.io
```

Endpoint prefix:

```text
/f-zotero-ext/api/v1
```

`GET /status` must return JSON with at least:

```json
{
  "ok": true,
  "plugin": "f-zotero-ext@frostime.github.io",
  "version": "0.1.0",
  "zotero": "<zotero-version>"
}
```

`GET /selected` success response must return JSON with at least:

```json
{
  "ok": true,
  "count": 1,
  "items": [
    {
      "key": "ITEMKEY",
      "itemType": "journalArticle",
      "title": "Title",
      "creators": [],
      "date": "",
      "url": "",
      "DOI": ""
    }
  ]
}
```

Failure responses must keep `ok: false` and an `error` string. The SiYuan side treats a missing/false `ok` as bridge failure.

## Configuration and migration

Persistent state is split deliberately:

| Data | Storage | Sync semantics |
|---|---|---|
| Deprecated `zoteroPassword` / migration prompt state | `custom-module.config.json` under `Zotero` | normal module config |
| `zoteroDir` | `zoteroDir.config.json`, keyed by SiYuan device ID | device-local path map |

Rules:

- `zoteroDir` must not be written to `custom-module.config.json`.
- `declareModuleConfig.dump()` must remain explicit and must exclude `zoteroDir`.
- Legacy `Misc.zoteroPassword` may be read only for migration and user guidance.
- The current transport must not depend on `zoteroPassword`.
- Migration guidance should be shown only when legacy config indicates that the user likely upgraded from the old Better BibTeX debug-bridge flow.

## Bridge package contents

The XPI must contain only the Zotero extension runtime files needed by Zotero:

```text
manifest.json
bootstrap.js
content/
```

The distributed XPI filename is stable:

```text
f-zotero-ext@frostime.github.io.xpi
```

The plugin distribution package must include the bridge XPI at:

```text
external/zotero-bridge/f-zotero-ext@frostime.github.io.xpi
```

Documentation may also point users to the GitHub Release asset with the same filename.

## Release and auto-update contract

Zotero automatic updates depend on three artifacts being consistent:

1. `src/external/zotero-bridge/manifest.json`
   - `applications.zotero.id` must equal `f-zotero-ext@frostime.github.io`.
   - `applications.zotero.update_url` must point to a reachable JSON update manifest.
   - `version` is the installed bridge version Zotero compares.

2. `src/external/zotero-bridge/updates.json`
   - Must use Zotero's JSON update manifest shape: `addons[id].updates[]`.
   - The update entry version must match the XPI's `manifest.json.version` for that release.
   - `update_link` must point to the exact XPI file to install.
   - `update_hash` must be the SHA-256 of that exact XPI file, prefixed with `sha256:`.
   - `applications.zotero.strict_min_version` / `strict_max_version` must describe the tested Zotero compatibility for that XPI.

3. GitHub Release asset
   - The release must contain `f-zotero-ext@frostime.github.io.xpi`.
   - The asset bytes must match `updates.json.update_hash`.

Operational rule:

- A bridge release is valid only when all three artifacts above describe the same version and XPI bytes.
- Repacking the same source can change the XPI hash because zip metadata can affect bytes. Always calculate `update_hash` from the final uploaded XPI.
- A tag-push GitHub Action that only uploads `package.zip` is insufficient for bridge auto-update.
- If `update_url` points at the repository `main` branch, `updates.json` must be committed to `main` before users can receive the new bridge automatically.

## Compatibility rules

- Current bridge target is Zotero 9–10 as declared by `strict_min_version: "9.0"` and `strict_max_version: "10.0.*"`.
- Lowering `strict_min_version` or widening support to older Zotero major versions requires bridge runtime testing against those versions.
- Changing the bridge endpoint prefix or response shape is a breaking change for the SiYuan plugin module.
- Changing the bridge extension ID is a breaking update path for already installed bridge users.

## Failure semantics

- Zotero unreachable: show user-facing failure and return no data.
- Local API reachable but bridge unreachable: selected-item citation and note import cannot work, because current UI selection is unavailable.
- Bridge reachable but Local API unreachable: citation can read selected items, but note import cannot reliably read note children.
- Note child fetch failure for one item should not corrupt other selected items' note imports.
