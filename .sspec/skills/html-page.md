---
skill: html-page
description: A way to develop UI for plugin by writing single html page in sy-f-misc.
---

## When to Use HTML Pages

To reduce bundle size of `index.js` and leverage standard web technologies (like CodeMirror, D3.js, etc.) without SolidJS overhead, single HTML pages are often more appropriate for complex, isolated UI features.

## TLDR (Workflow)

1.  **Create HTML**: Place your `.html` file anywhere in `src/` (e.g., `src/func/my-feature/page.html`).
2.  **Define SDK**: Decide what data or callbacks you need to pass from the plugin to the page via `customSdk`.
3.  **Open Page**: Use `openIframeTab` or `openIframeDialog` in your TypeScript code.
4.  **Access API**: In the HTML page, use `window.pluginSdk` to access SiYuan APIs and your `customSdk`.

## Core Concepts

### 1. File Paths & Build
- **Source**: `src/**/filename.html`
- **Output**: All HTML files are flattened into the `pages/` directory in the build output.
- **Runtime URL**: `/plugins/sy-f-misc/pages/filename.html`
- **Constraint**: Filenames MUST be unique across the entire `src/` directory.

### 2. Opening the Page
Import from `@/func/html-pages/core`:

```typescript
import { openIframeTab, openIframeDialog } from "@/func/html-pages/core";

const config = {
    type: 'url',
    source: '/plugins/sy-f-misc/pages/my-page.html',
    inject: {
        presetSdk: true,  // Injects window.pluginSdk
        siyuanCss: true,  // Injects SiYuan theme variables
        customSdk: {      // Your custom data/methods
            getData: () => myData,
            onSave: (val) => handleSave(val)
        }
    }
};

// Open as a Tab
openIframeTab({
    tabId: 'unique-id',
    title: 'My Page',
    iframeConfig: config
});

// Open as a Dialog
openIframeDialog({
    title: 'My Dialog',
    iframeConfig: config,
    width: '800px',
    height: '600px'
});
```

### 3. Using the SDK in HTML
The `window.pluginSdk` provides:
- **SiYuan API**: `request`, `querySQL`, `getBlockByID`, `openBlock`, etc.
- **Styling**: `styleVar` containing SiYuan theme colors and fonts.
- **Custom**: Anything you passed in `customSdk`.

**Initialization:**
Always wait for the `pluginSdkReady` event before accessing the SDK.

```javascript
window.addEventListener('pluginSdkReady', async () => {
    console.log('SDK is ready');
    const sdk = window.pluginSdk;

    init();
});
```

**Styling:**
SiYuan theme variables are injected into `:root` (without the `b3-` prefix).
```css
body {
    background-color: var(--theme-background);
    color: var(--theme-on-background);
    font-family: var(--font-family);
}
```

## Documentation Reference

For a complete list of available APIs in `window.pluginSdk`, refer to:
- [src/func/html-pages/html-page.md](src/func/html-pages/html-page.md) - **Primary API Reference**
- [src/func/html-pages/core.ts](src/func/html-pages/core.ts) - Implementation details

> [!note]
>
> About `src/func/html-pages/html-page.md`
>
> This markdown file is user-oriented and provides a custom SDK for HTML SPAs (Single Page Applications), including functions such as `loadConfig`, `saveConfig`, `loadAsset`, and `saveAsset`. It serves as a guide for users to develop their own DIY micro HSPAs.
>
> These SDK functions are not available when developing within `sy-f-misc`. We should define our own specific custom SDK and ignore these user-oriented HSPA conventions.

## Best Practices
- **Styling**: Always use injected CSS variables (e.g., `--theme-primary`, `--font-family`) for a native look. See [[## 🎨 UI 设计建议]] in src/func/html-pages/html-page.md for details.
- **Cleanup**: If your page needs to perform cleanup when closed, use the `onDestroy` callback in `IIframePageConfig`.
- **Communication**: Use `window.pluginSdk` for all interactions with the main plugin process.

