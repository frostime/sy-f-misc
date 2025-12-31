# HTML Page Development (Skill/HTML Page)

HTML-Page is a way to develop UI for plugin by writing single html page.

## When to Use HTML Pages

To reduce bundle size of index.js , sometimes pure HTML pages are more appropriate than SolidJS components.

## When creating HTML-based UI

1. **阅读文档 / Read documentation**:
   - `src/func/html-pages/html-page.md` - HTML page feature overview
   - `src/func/html-pages/core.md` - Core implementation details

2. **编写 HTML 页面 / Write HTML page**:
   - Place in same directory as the feature module
   - Example: `src/func/my-feature/my-page.html`

3. **引用路径 / Reference path**:
   - Build output: All `src/**/*.html` → `pages/xxx.html`
   - Runtime URL: `/plugins/sy-f-misc/pages/xxx.html`
   - See `vite.config.ts` for build configuration

## Use these methods to display HTML pages

- **`openIframeTab(options)`**: Open as a tab in main area
- **`openIframeDialog(options)`**: Open as a modal dialog

For development convenience, you can inject `customSdk`.
