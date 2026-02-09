---
name: hspa
description: Develop plugin UI by writing single HTML pages loaded in iframes within sy-f-misc. Use this skill when the user asks to build UI using HSPA, "HTML Page", or needs an iframe-based interface for a plugin feature. Also trigger when the user mentions openIframeTab, openIframeDialog, or pluginSdk.
metadata:
    version: 2.2.0
    author: frostime
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

### Constraint

**Do NOT use native browser dialogs**:
- ❌ `window.alert()` — use `pluginSdk.showMessage()` instead
- ❌ `window.confirm()` — use `pluginSdk.confirm()` instead
- ❌ `window.prompt()` — use `pluginSdk.inputDialog()` instead

Native browser dialogs block the UI thread and provide poor user experience within the iframe context. Always use the SDK's UI methods which integrate with SiYuan's theme and provide better UX.

---

## Styling

### Default

**Read `references/styling-guide.md` for complete CSS variable list and architecture.**

Key points:
- CSS variables are auto-injected into `:root` **without** the `b3-` prefix (`--font-size`, not `--b3-font-size`)
- Always set `data-theme-mode` attribute during init for dark mode CSS selectors
- Use semantic CSS variables derived from injected theme colors
- If defining custom colors, provide both light and dark variants

### Optional: `hspa-mini.css`

A lightweight CSS framework built on HSPA's injected theme variables. Provides layout utilities, page structure, cards, buttons, forms, badges, tables, and more — eliminating the need to write boilerplate CSS for every page.

```html
<link rel="stylesheet" href="/plugins/sy-f-misc/styles/hspa-mini.css">
```

- **File**: `public/styles/hspa-mini.css`
- **Runtime**: `/plugins/sy-f-misc/styles/hspa-mini.css`

When `hspa-mini.css` is loaded, you get pre-defined semantic variables (`--c-bg`, `--c-fg`, `--c-accent`, `--fs-sm`, `--sp-4`, etc.) and utility classes.

**Read `references/hspa-mini-classes.md` for the full class reference and examples.**

---

## JS Framework Integration

| Complexity | Stack | Script | Example |
|---|---|---|---|
| Low | Vanilla JS | — | `references/hspa-vanilla-example.html` |
| Medium (recommended) | Alpine.js | `/plugins/sy-f-misc/scripts/alpine.min.js` | `references/hspa-alpine-example.html` |
| High | Vue 3 | `/plugins/sy-f-misc/scripts/vue.global.min.js` | `references/hspa-vue-example.html` |

**NEVER use CDN** — always use the local scripts above.

### Vanilla JS

Best for simple pages with minimal interactivity. Directly manipulate the DOM after SDK initialization.

```javascript
window.addEventListener('pluginSdkReady', async () => {
    const sdk = window.pluginSdk;
    document.documentElement.setAttribute('data-theme-mode', sdk.themeMode);

    const data = await sdk.getItems();
    const list = document.getElementById('list');
    list.innerHTML = data.map(item =>
        `<div class="card">${escapeHtml(item.name)}</div>`
    ).join('');
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

See **`references/hspa-vanilla-example.html`** for a complete working page.

### Alpine.js (Recommended)

Alpine.js provides declarative reactivity in HTML — ideal for HSPA's single-file pattern. It's the **recommended** choice for medium-complexity pages.

**HSPA-specific essentials:**

```html
<style>[x-cloak] { display: none !important; }</style>  <!-- Prevent FOUC -->

<div x-data="app()" x-init="init()" x-cloak>
    <template x-for="item in items" :key="item.id">
        <div x-text="item.name"></div>
    </template>
</div>

<script>
function app() {
    return {
        items: [],
        _initialized: false,   // Guard against duplicate init

        async init() {
            if (this._initialized) return;
            this._initialized = true;

            await new Promise(r => {
                if (window.pluginSdk) return r();
                window.addEventListener('pluginSdkReady', r, { once: true });
            });
            document.documentElement.setAttribute('data-theme-mode', window.pluginSdk.themeMode);
            this.items = await window.pluginSdk.getItems();
        },

        async saveAll() {
            // KEY: Use Alpine.raw() to strip Proxy before passing data to SDK
            await window.pluginSdk.saveItems(Alpine.raw(this.items));
            window.pluginSdk.showMessage('保存成功', 'info');
        }
    };
}
</script>
<!-- Alpine.js MUST be the last script -->
<script src="/plugins/sy-f-misc/scripts/alpine.min.js" defer></script>
```

**Key rules:**
| Rule | Why |
|---|---|
| `[x-cloak] { display: none !important; }` in `<head>` | Prevents flash of `{{ }}` templates |
| `_initialized` guard in `init()` | SDK may be injected multiple times |
| `Alpine.raw(data)` when sending to SDK | Strips Proxy wrapper for serialization |
| Alpine `<script>` placed last | Data function must be defined before Alpine parses DOM |
| `x-for` / `x-if` must be on `<template>` | Alpine requirement |

See **`references/quick-alpinejs.md`** for the complete Alpine.js guide with reactivity patterns, all directives, and common pitfalls.

See **`references/hspa-alpine-example.html`** for a complete working page.

### Vue 3

Best for highly complex pages with deep component hierarchies.

```html
<script src="/plugins/sy-f-misc/scripts/vue.global.min.js"></script>
<div id="app">
    <div v-for="item in items" :key="item.id">{{ item.name }}</div>
</div>
<script>
window.addEventListener('pluginSdkReady', async () => {
    const { createApp, ref } = Vue;
    document.documentElement.setAttribute('data-theme-mode', window.pluginSdk.themeMode);
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

See **`references/hspa-vue-example.html`** for a complete working page.

---

## Capability Boundaries & Dependencies

**Read `references/siyuan-context.md` for file system structure, block types, and path conventions.**

HSPA is suitable for standalone tools, kernel-API-driven features, and complex web UIs. It is **not** suitable for Protyle editor interaction, SiYuan event bus listeners, or main UI DOM manipulation. Identify and decline requests that exceed these boundaries.

For external JS/CSS dependencies: avoid if possible, inform the user when needed, prefer China-accessible mirrors, and test reachability with a fallback error message.

---

## References

| File | When to read |
|---|---|
| `references/preset-sdk-api.md` | Need full API signatures and type definitions |
| `references/styling-guide.md` | Building the CSS architecture or theming (default) |
| `references/hspa-mini-classes.md` | Using `hspa-mini.css` — full class reference |
| `references/siyuan-context.md` | Working with SiYuan file system, blocks, or kernel APIs |
| `references/quick-alpinejs.md` | Alpine.js patterns, directives, and HSPA-specific pitfalls |
| `references/hspa-vanilla-example.html` | Complete vanilla JS page template |
| `references/hspa-alpine-example.html` | Complete Alpine.js page template |
| `references/hspa-vue-example.html` | Complete Vue 3 page template |
| `/src/func/html-pages/html-page.md` | User-facing HSPA SDK (not for internal pages) |
| `/src/func/html-pages/core.ts` | Implementation details |
