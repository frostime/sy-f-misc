# HTMLPage WebView

## Agreed scope

- URL pages can use an Electron WebView on supported desktop clients. Unsupported clients show a message instead of silently falling back to iframe.
- Keep HTML/HSPA pages and the shared `core.ts` iframe/SDK APIs unchanged.
- Keep WebView implementation separate from iframe code. Support Tab, Dialog and Dock.
- Use a stable, plugin-namespaced `persist:` partition derived from the saved page ID. Navigation, title/URL changes, reopening and surface changes must not select a new partition.
- Closing/unloading destroys views and listeners, never stored sessions. Browser credentials are not exported to plugin configuration or synced.
- Remote websites receive no Node integration, preload or plugin SDK.

## Implementation decisions

- URL pages default to WebView, including existing URL entries. An explicit iframe option remains available for compatibility; it is not an automatic fallback.
- WebView tabs use page IDs rather than URLs so separate entries for one website can have independent accounts.
- Basic back/forward/reload/home controls, visible load errors, and a drag/resize cover belong to the WebView module.
- Navigation uses a low-opacity, bottom-left floating button instead of a full-width toolbar. Click to expand; pointer leave (500 ms), Escape, focus leaving the controls, or window blur collapses it. Loading is tooltip-only; failures show a floating message. The guest retains the full surface height.
- No OAuth popup overrides, account-data export, persistent page-runtime snapshots, proxy configuration or arbitrary script injection.
- Page deletion removes the HTMLPage entry, not Electron's persisted browsing data; disclose this separately from HTML file deletion.

## Verification

Automated checks cover unsupported environments, URL restrictions, partition reuse and isolation, safe guest configuration, loading/error behavior and resource teardown. Type-check and production build are checked separately.

Real website login, persistence across SiYuan restarts, third-party login popups and Tab/Dock drag behavior require in-app acceptance testing. Source inspection or mocked guest APIs cannot establish those outcomes.
