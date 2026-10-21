# Verification

## Automated results

- `pnpm test:html-pages-webview`: 9/9 passed.
  - Unsupported browser/disabled WebView host displays a message, never creates an iframe fallback.
  - Mobile Tab requests show an unsupported message without calling desktop Tab APIs.
  - Recreated views and edited entry URLs select the same persisted page partition; different entries select different partitions.
  - Partition is assigned before navigation. Guest preferences explicitly enable isolation/sandbox/web security and disable Node; no preload or plugin SDK is supplied.
  - Main-frame load errors are visible; cancelled redirects/subresource failures are ignored.
  - Navigation/zoom preserve the selected partition.
  - Split Tab instances clean up independently and share only their saved partition.
  - Dialogs share the page partition and close during module unload.
  - Closing/unloading removes guests and host/guest listeners; repeated cleanup is safe.
- `pnpm build:publish`: passed; creates `dist/` and `package.zip` (ignored build output).
- `git diff --check`: passed.
- `pnpm type-check`: fails with five existing diagnostics in `src/func/docfile-tools.ts` (four) and `src/func/gpt/model/storage.ts` (one). An in-memory baseline compiler run using source from pre-change commit `9f61a46` reproduces the same five diagnostics. No diagnostics in changed/new source or tests.

These tests replace the Electron/DOM/SiYuan UI boundaries. They verify configuration and lifecycle contracts, not actual browser storage on disk or website authentication.

## Review

A read-only implementation review identified shared cleanup ownership between split Tab instances. WebView Tab registration now tracks each instance separately through a WeakMap; a regression test covers the failure. It also closes open WebView Dialog shells when the module is unloaded.

The current upstream SiYuan `Plugin.addDock` calls `removePluginDock` before replacement; the registration signature now includes source/type/renderer so editing the website or container rebuilds its Dock. Actual layout behavior remains an in-app acceptance item.

## In-app acceptance — pending

Do not mark login persistence verified until these steps pass in the target SiYuan version.

1. Install the build and enable HTML Pages. Existing URL entries now default to WebView unless explicitly configured as iframe. Existing iframe/system-browser login credentials are not imported.
2. Add/open `https://www.dida365.com` and complete the preferred login flow.
3. Close and reopen the page. Check login and normal WebApp operations.
4. Quit SiYuan normally, restart it, and reopen the same page. Check login again. Site-expired credentials are not a persistence failure.
5. Open the same page as Tab, Dialog and Dock. Verify shared login. Change title/entry URL and reopen; verify the same account remains available.
6. Add another entry for the same website. Verify it has an independent login profile.
7. Drag/split Tab panes, resize the layout and hide/show Dock. Verify guest rendering and that the drag cover is released when the operation ends, including outside-window mouse release.
8. Exercise password/SMS and third-party login separately. Popups remain subject to SiYuan's host policy and provider restrictions.
9. Open on a browser/mobile/remote-kernel client. Verify unsupported messaging, without automatic iframe fallback. Explicit iframe mode remains available.
10. Open an existing HSPA page. Verify its original iframe SDK still works. Toggle HTML Pages off with WebViews open; verify guests/listeners are released and Dialogs close.
11. Delete a URL entry. Confirm the warning explains retained local website data; re-adding creates a new independent profile.
