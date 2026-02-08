---
name: hspa
description: Develop plugin UI by writing single HTML pages loaded in iframes within sy-f-misc. Use this skill when the user asks to build UI using HSPA, "HTML Page", or needs an iframe-based interface for a plugin feature. Also trigger when the user mentions openIframeTab, openIframeDialog, or pluginSdk.
metadata:
    version: 2.0.0
    author: frsotime
---

## What is HSPA

HSPA (HTML Single Page Application) is an iframe-based UI pattern in `sy-f-misc`. Each page is a standalone `.html` file that communicates with the plugin through an injected `window.pluginSdk`. It reduces bundle size and lets you use standard web technologies (CodeMirror, D3.js, etc.) without SolidJS overhead.

**Two usage contexts exist — this skill covers only the first:**

| Context | Who | `loadConfig`/`saveConfig`? | Scope |
|---|---|---|---|
| **Internal plugin page** (this skill) | Developer inside `sy-f-misc` | ❌ Must provide via `customSdk` | Plugin features |
| User DIY HSPA | End-user outside plugin | ✅ Built-in | Standalone micro-apps |

> The user-facing doc `src/func/html-pages/html-page.md` describes a superset SDK for standalone micro-apps. Functions like `loadConfig`, `saveConfig`, `loadAsset`, `saveAsset` are **not** automatically available in internal plugin pages.

---

## Workflow

1. **Create HTML** — Place `.html` in `src/` (e.g., `src/func/my-feature/page.html`)
2. **Design `customSdk`** — Decide what data/callbacks the page needs from the plugin
3. **Open page** — Call `openIframeTab` or `openIframeDialog` from TypeScript
4. **Use SDK** — In the HTML, wait for `pluginSdkReady`, then access `window.pluginSdk`

---

## Build & Path Convention

| Item | Value |
|---|---|
| Source | `src/**/filename.html` (anywhere under `src/`) |
| Build output | All `.html` flattened into `pages/` |
| Runtime URL | `/plugins/sy-f-misc/pages/filename.html` |
| **Constraint** | **Filenames must be globally unique** across `src/` |

---

## Opening the Page (TypeScript Side)

Import from `@/func/html-pages/core`:

```typescript
import { openIframeTab, openIframeDialog } from "@/func/html-pages/core";
```

### `openIframeTab`

```typescript
openIframeTab({
    tabId: 'unique-tab-id',
    title: 'My Page',
    icon: 'iconHTML5',           // optional
    position: 'right',          // optional: 'right' | 'bottom'
    iframeConfig: {
        type: 'url',
        source: '/plugins/sy-f-misc/pages/my-page.html',
        inject: {
            presetSdk: true,     // default true
            siyuanCss: true,     // default true
            customSdk: {         // flat-merged into window.pluginSdk
                getItems: () => store.items,
                onSave: (val) => handleSave(val),
            }
        },
        onDestroy: () => { /* cleanup */ },
    },
});
```

Returns proxy with: `cleanup()`, `dispatchEvent(name, detail?)`, `iframeRef`, `isAlive()`.

### `openIframeDialog`

```typescript
openIframeDialog({
    title: 'My Dialog',
    iframeConfig: { /* same as above */ },
    width: '800px',
    height: '600px',
});
```

Returns merged proxy: dialog (`close`, `container`) + iframe (`dispatchEvent`, `isAlive`).

### `IIframePageConfig`

```typescript
interface IIframePageConfig {
    type: 'url' | 'html-text';
    source: string;
    iframeStyle?: { zoom?: number; [key: string]: any };
    inject?: {
        presetSdk?: boolean;       // default true
        siyuanCss?: boolean;       // default true
        customSdk?: Record<string, any>;  // flat-merged into pluginSdk
    };
    onLoadEvents?: Record<string, any>;
    onLoad?: (iframe: HTMLIFrameElement) => void;
    onDestroy?: () => void;
}
```

---

## ⚠️ Critical: How `customSdk` Merges

`customSdk` is **flat-merged** into `window.pluginSdk`, not nested:

```typescript
// core.ts internals:
const finalSdk = { ...presetSdk, ...(inject.customSdk || {}) };
iframe.contentWindow.pluginSdk = finalSdk;
```

So if your TypeScript defines:
```typescript
customSdk: {
    getRecords: async () => records,
    onConfirm: (selected) => handleConfirm(selected),
}
```

In HTML, access them **directly on `pluginSdk`**:
```javascript
// ✅ Correct
const records = await window.pluginSdk.getRecords();
window.pluginSdk.onConfirm(selectedItems);

// ❌ Wrong — customSdk is NOT a nested object
const records = await window.pluginSdk.customSdk.getRecords();
```

`customSdk` can also **override** preset methods if needed.

---

## HTML Page Side

### Initialization

Always wait for `pluginSdkReady`:

```javascript
window.addEventListener('pluginSdkReady', async () => {
    const sdk = window.pluginSdk;

    // Set theme mode for CSS selectors
    document.documentElement.setAttribute('data-theme-mode', sdk.themeMode);

    // Your init logic
    init(sdk);
});
```

### Preset SDK Quick Reference

When `presetSdk: true` (default), `window.pluginSdk` includes SiYuan data APIs, file system APIs, UI APIs, and theme utilities.

**Read `references/preset-sdk-api.md` for the full API table.** Key methods:

| Method | Purpose |
|---|---|
| `request(endpoint, data)` | Call any SiYuan kernel API |
| `querySQL(sql)` | Execute SQL (default LIMIT 32) |
| `getBlockByID(id)` | Get block by ID |
| `openBlock(id)` | Navigate to block in SiYuan |
| `showMessage(msg, type?, duration?)` | Toast notification |
| `lute.Md2HTML(md)` / `lute.HTML2Md(html)` | Markdown ↔ HTML conversion |

### Runtime Events (Plugin → Page)

Two approaches for plugin-to-page communication after load:

1. **`onLoadEvents`** — auto-dispatched on load:
   ```typescript
   onLoadEvents: { 'init-data': { items: myItems } }
   ```
2. **`dispatchEvent`** — runtime communication:
   ```typescript
   const tab = openIframeTab({ ... });
   tab.dispatchEvent('refresh', { newData: updated });
   ```

Listen in HTML:
```javascript
window.addEventListener('init-data', (e) => console.log(e.detail.items));
```

---

## Styling

**Read `references/styling-guide.md` for complete CSS variable list and architecture.**

Key points:
- CSS variables are auto-injected into `:root` **without** the `b3-` prefix (`--font-size`, not `--b3-font-size`)
- Always set `data-theme-mode` attribute during init for dark mode CSS selectors
- Use semantic CSS variables derived from injected theme colors
- If defining custom colors, provide both light and dark variants

---

## JS Framework Integration

| Complexity | Stack | Script |
|---|---|---|
| Low (recommended) | Vanilla JS | — |
| Medium | Alpine.js | `/plugins/sy-f-misc/scripts/alpine.min.js` |
| High | Vue 3 | `/plugins/sy-f-misc/scripts/vue.global.min.js` |

**NEVER use CDN** — always use the local scripts above.

### Vanilla JS

```javascript
window.addEventListener('pluginSdkReady', async () => {
    const sdk = window.pluginSdk;
    const data = await sdk.getItems();  // customSdk method, accessed directly
    document.getElementById('app').innerHTML = `<h1>${data.length} items</h1>`;
});
```

### Alpine.js

```html
<script src="/plugins/sy-f-misc/scripts/alpine.min.js" defer></script>
<!-- ... -->
<div x-data="appData()" x-init="init()">
    <template x-for="item in items" :key="item.id">
        <div x-text="item.name"></div>
    </template>
</div>
<script>
function appData() {
    return {
        items: [],
        async init() {
            await new Promise(r => {
                if (window.pluginSdk) return r();
                window.addEventListener('pluginSdkReady', r, { once: true });
            });
            this.items = await window.pluginSdk.getItems();
        }
    };
}
</script>
```

### Vue 3

```html
<script src="/plugins/sy-f-misc/scripts/vue.global.min.js"></script>
<!-- ... -->
<div id="app">
    <div v-for="item in items" :key="item.id">{{ item.name }}</div>
</div>
<script>
window.addEventListener('pluginSdkReady', async () => {
    const { createApp, ref } = Vue;
    createApp({
        setup() {
            const items = ref([]);
            window.pluginSdk.getItems().then(d => items.value = d);
            return { items };
        }
    }).mount('#app');
});
</script>
```

---

## Capability Boundaries & Dependencies

**Read `references/siyuan-context.md` for file system structure, block types, and path conventions.**

HSPA is suitable for standalone tools, kernel-API-driven features, and complex web UIs. It is **not** suitable for Protyle editor interaction, SiYuan event bus listeners, or main UI DOM manipulation. Identify and decline requests that exceed these boundaries.

For external JS/CSS dependencies: avoid if possible, inform the user when needed, prefer China-accessible mirrors, and test reachability with a fallback error message.

---

## References

| File | When to read |
|---|---|
| `references/preset-sdk-api.md` (This Skill Dir) | Need full API signatures and type definitions |
| `references/styling-guide.md` (This Skill Dir)  | Building the CSS architecture or theming |
| `references/siyuan-context.md` (This Skill Dir)  | Working with SiYuan file system, blocks, or kernel APIs |
| `/src/func/html-pages/html-page.md` (Workspace Path)  | User-facing HSPA SDK (not for internal pages) |
| `/src/func/html-pages/core.ts` (Workspace Path)  | Implementation details |
