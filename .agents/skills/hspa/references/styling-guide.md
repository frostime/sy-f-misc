# HSPA Styling Guide

## How CSS Variables Are Injected

The plugin automatically prepends a `<style id="siyuan-injected-styles">` to `<head>`, containing:

```css
:root {
    --font-family: <value>;
    --font-size: <value>;
    --font-family-code: <value>;
    --theme-primary: <value>;
    --theme-background: <value>;
    /* ... all variables from styleVar */
}
body {
    font-family: var(--font-family, sans-serif);
    font-size: var(--font-size, 16px);
}
pre, code {
    font-family: var(--font-family-code, monospace);
}
```

⚠️ Injected CSS variables do **not** have the `b3-` prefix. Use `--font-size`, not `--b3-font-size`.

---

## Available CSS Variables

**Font:**

| Variable | Description |
|---|---|
| `--font-family` | Main font family (from body computed style) |
| `--font-size` | Base editor font size |
| `--font-family-code` | Code/monospace font |
| `--font-family-emoji` | Emoji font |

**Theme Colors:**

| Variable | Typical Use |
|---|---|
| `--theme-primary` | Accent / interactive elements |
| `--theme-primary-light` | Lighter accent |
| `--theme-primary-lightest` | Subtle accent background |
| `--theme-on-primary` | Text on primary-colored backgrounds |
| `--theme-background` | Page background |
| `--theme-on-background` | Main text color |
| `--theme-surface` | Card/panel background |
| `--theme-surface-light` | Hover states |
| `--theme-surface-lighter` | Borders, dividers |
| `--theme-on-surface` | Text on surfaces |
| `--theme-on-surface-light` | Secondary/muted text |

**Theme Mode:**

| Variable | Values |
|---|---|
| `--theme-mode` | `light` or `dark` |

All color variables auto-adapt to the current SiYuan theme. You generally don't need separate light/dark definitions when using these variables — they already contain the correct values.

---

## Dark Mode Handling

Set `data-theme-mode` on `<html>` (or `<body>`) during init:

```javascript
document.documentElement.setAttribute('data-theme-mode', sdk.themeMode);
```

Use this attribute for CSS selectors when you need **custom** colors that differ between modes:

```css
/* Only needed for colors NOT derived from injected theme variables */
.btn-danger { color: #d93025; }

[data-theme-mode="dark"] .btn-danger {
    color: #f28b82;
}
```

If all your colors are derived from injected `--theme-*` variables, you don't need `[data-theme-mode]` overrides at all.

---

## Recommended CSS Architecture

Build semantic variables on top of the injected theme variables:

```css
:root {
    /* 1. Font sizes — based on injected --font-size */
    --fs-normal: var(--font-size, 14px);
    --fs-large: calc(var(--fs-normal) * 1.2);
    --fs-medium: calc(var(--fs-normal) * 0.93);
    --fs-small: calc(var(--fs-normal) * 0.9);

    /* 2. Colors — mapped from injected theme colors */
    --bg-primary: var(--theme-background, #ffffff);
    --text-primary: var(--theme-on-background, #333333);
    --text-secondary: var(--theme-on-surface-light, #666666);
    --accent-color: var(--theme-primary, #d23f31);
    --accent-bg: var(--theme-primary-lightest, #ffe8e6);
    --border-color: var(--theme-surface-lighter, #e0e0e0);
    --hover-bg: var(--theme-surface-light, #f5f5f5);
    --selected-bg: var(--theme-primary-lightest, #ffe8e6);

    /* 3. Functional colors — need dark mode overrides */
    --success: #34a853;
    --error: #ea4335;
    --warning: #fbbc04;
}

[data-theme-mode="dark"] {
    --success: #4caf50;
    --error: #f44336;
    /* Only override custom colors, not theme-derived ones */
}
```

### Rules

1. **Font**: Always use `var(--font-family)` and `var(--font-family-code)` — never hardcode font names.
2. **Font size**: Derive all sizes from `--font-size` using `calc()`. Avoid magic numbers.
3. **Colors**: Map `--theme-*` variables to semantic names. Provide fallback values.
4. **Custom colors**: When using colors not from the theme (like success/error), always provide dark mode variants via `[data-theme-mode="dark"]`.
5. **Borders and dividers**: Use `--theme-surface-lighter` for borders, `--theme-surface-light` for hover backgrounds.

---

## Complete HTML Template

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Title</title>
    <style>
        :root {
            --fs-normal: var(--font-size, 14px);
            --fs-large: calc(var(--fs-normal) * 1.2);
            --fs-small: calc(var(--fs-normal) * 0.9);

            --bg-primary: var(--theme-background, #fff);
            --text-primary: var(--theme-on-background, #333);
            --text-secondary: var(--theme-on-surface-light, #666);
            --accent: var(--theme-primary, #d23f31);
            --border: var(--theme-surface-lighter, #e0e0e0);
            --hover-bg: var(--theme-surface-light, #f5f5f5);
        }

        [data-theme-mode="dark"] {
            /* Override only custom functional colors here */
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        #app {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb {
            background: var(--border);
            border-radius: 4px;
        }
        ::-webkit-scrollbar-track { background: transparent; }
    </style>
</head>
<body>
    <div id="app"><!-- Content --></div>

    <script>
    window.addEventListener('pluginSdkReady', async () => {
        const sdk = window.pluginSdk;

        // 1. Set theme mode for CSS selectors
        document.documentElement.setAttribute('data-theme-mode', sdk.themeMode);

        // 2. Init
        init(sdk);
    });

    function init(sdk) {
        // Your logic here
    }
    </script>
</body>
</html>
```

### Common Layout Patterns

**Dialog pages** (used in `openIframeDialog`): full height, flex column with header + scrollable content + footer.

```css
body { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.header { padding: 16px; border-bottom: 1px solid var(--border); }
.content { flex: 1; overflow-y: auto; padding: 16px; }
.footer { padding: 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
```

**Tab pages** (used in `openIframeTab`): similar, but iframe is already full-size in the tab container.

### Button Styles

```css
.btn {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background-color: var(--theme-surface);
    color: var(--text-primary);
    cursor: pointer;
    font-size: var(--fs-small);
    font-family: var(--font-family);
    transition: all 0.2s;
}
.btn:hover { background-color: var(--hover-bg); }
.btn:active { opacity: 0.6; }

.btn-primary {
    background-color: var(--accent);
    color: white;
    border-color: var(--accent);
}
```
