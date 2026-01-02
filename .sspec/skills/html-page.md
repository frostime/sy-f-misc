---
skill: html-page
description: A way to develop UI for plugin by writing single html page in sy-f-misc.
---

## When to Use HTML Pages

To reduce bundle size of index.js , sometimes pure HTML pages are more appropriate than SolidJS components.

## TLDR

1. User request an UI.
2. Define the core data flow api.
3. Develop HTML Page, in which use `window.pluginSdk.xxx` to visit vital API.
4. Write `openIframeTab/openIframeDialog` and inject important api into `customSdk`

## When creating HTML-based UI

> [!warning]
> You **MUST READ** the complete document before you write the page!
1. **阅读文档 / Read documentation**:
   - `src/func/html-pages/html-page.md` - HTML page feature overview
   - `src/func/html-pages/core.md` - Core implementation details

2. **编写 HTML 页面 / Write HTML page**:
   - Place in same directory as the feature module

3. **引用路径 / Reference path**:
   - Build output: All `src/**/*.html` → `pages/xxx.html`
   - Runtime URL: `/plugins/sy-f-misc/pages/xxx.html`
   - See `vite.config.ts` for build configuration

**Example**
- src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html
- src/func/gpt/chat/ChatSession/world-tree/index.ts

> [!warning]
> Event injected through `customSdk`, the handler should be still visited from `window.pluginSdk` within HTML page, do not make mistake!

## Use these methods to display HTML pages

- **`openIframeTab(options)`**: Open as a tab in main area
- **`openIframeDialog(options)`**: Open as a modal dialog

For development convenience, you can inject `customSdk`.
