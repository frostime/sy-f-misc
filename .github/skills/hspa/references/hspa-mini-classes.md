# `hspa-mini.css` Class Reference

Lightweight CSS framework for HSPA pages. Load via:

```html
<link rel="stylesheet" href="/plugins/sy-f-misc/styles/hspa-mini.css">
```


You can visit this css file at `public/styles/hspa-mini.css`.

---

## Semantic Variables

When loaded, `hspa-mini.css` defines these semantic variables on `:root`, mapped from HSPA's injected theme variables:

**Colors:**

| Variable | Maps to | Purpose |
|---|---|---|
| `--c-bg` | `--theme-background` | Page background |
| `--c-fg` | `--theme-on-background` | Main text |
| `--c-fg-muted` | `--theme-on-surface-light` | Secondary text |
| `--c-accent` | `--theme-primary` | Accent / interactive |
| `--c-accent-light` | `--theme-primary-light` | Lighter accent |
| `--c-accent-bg` | `--theme-primary-lightest` | Accent background |
| `--c-on-accent` | `--theme-on-primary` | Text on accent |
| `--c-surface` | `--theme-surface` | Card / panel bg |
| `--c-surface-hover` | `--theme-surface-light` | Hover states |
| `--c-border` | `--theme-surface-lighter` | Borders, dividers |

**Functional colors** (auto-switch for dark mode):

| Variable | Light | Dark |
|---|---|---|
| `--c-success` | `#34a853` | `#4caf50` |
| `--c-error` | `#d93025` | `#f28b82` |
| `--c-warning` | `#f9ab00` | `#fdd663` |
| `--c-info` | `#4285f4` | `#8ab4f8` |

Each functional color also has a pre-computed `*-bg` (12% opacity) and `*-hover` (8% opacity) variant, e.g. `--c-error-bg`, `--c-error-hover`. These avoid `color-mix()` for better Electron/older browser compatibility.

**Font Sizes:** `--fs` (base), `--fs-xs` (×0.78), `--fs-sm` (×0.88), `--fs-lg` (×1.2), `--fs-xl` (×1.5)

**Spacing Scale:** `--sp-1` (4px), `--sp-2` (8px), `--sp-3` (12px), `--sp-4` (16px), `--sp-5` (20px), `--sp-6` (24px), `--sp-8` (32px)

> Note: `--sp-7` (28px) is intentionally skipped — 32px is the more common jump point in UI design.

**Radius:** `--radius-sm` (3px), `--radius` (6px), `--radius-lg` (10px), `--radius-full` (pill)

**Shadows:** `--shadow-sm`, `--shadow`, `--shadow-lg` (auto-adjust for dark mode)

---

## Reset & Base

`hspa-mini.css` applies a minimal reset:

- `box-sizing: border-box` on all elements
- `body`: margin/padding 0, uses `var(--font-family)` and `var(--fs)`, themed bg/fg, line-height 1.5
- `pre, code`: uses `var(--font-family-code)`
- `a`: accent color, underline on hover
- `img`: `display: block; max-width: 100%`
- Scrollbar: thin style on both WebKit and Firefox

**SVG is not globally reset.** Inline SVGs remain `display: inline` by default. Use the `.icon` class for icon-sized SVGs.

---

## Page Structure

Use `<body class="page">` for full-height layouts with header/body/footer.

```html
<body class="page">
    <div class="page-header">
        <h2>Title</h2>
        <button class="btn btn-primary">Action</button>
    </div>
    <div class="page-body">
        <!-- Scrollable content -->
    </div>
    <div class="page-footer">
        <button class="btn">Cancel</button>
        <button class="btn btn-primary">Confirm</button>
    </div>
</body>
```

For a footer with left info + right buttons:

```html
<div class="page-footer page-footer--between">
    <span class="text-sm text-muted">3 items</span>
    <button class="btn btn-primary">Done</button>
</div>
```

| Class | Description |
|---|---|
| `.page` | `height: 100vh; flex column; overflow hidden` |
| `.page-header` | Top bar: border-bottom, flex-between, padding |
| `.page-body` | Flex-1 scrollable area with padding |
| `.page-footer` | Bottom bar: border-top, flex-end, gap |
| `.page-footer--between` | Modifier: changes footer to space-between. **Must combine with `.page-footer`** |

---

## Flex Layout

```html
<div class="flex-between gap-4">
    <span class="flex-1 text-truncate">Long text...</span>
    <button class="btn flex-none">Action</button>
</div>
```

| Class | CSS |
|---|---|
| `.flex` | `display: flex` |
| `.flex-col` | `display: flex; flex-direction: column` |
| `.flex-row` | `display: flex; flex-direction: row` |
| `.flex-wrap` | `display: flex; flex-wrap: wrap` |
| `.flex-1` | `flex: 1; min-width: 0` |
| `.flex-none` | `flex: none` |
| `.flex-shrink-0` | `flex-shrink: 0` |
| `.flex-center` | Flex + center both axes |
| `.flex-between` | Flex + items-center + space-between |
| `.items-start/center/end/stretch` | align-items |
| `.justify-start/center/end/between` | justify-content |

> `.flex-wrap` includes `display: flex`. All other alignment/justify classes (`.items-*`, `.justify-*`) are modifiers — they require a parent with `display: flex` already set.

---

## Grid

```html
<div class="grid grid-cols-3 gap-4">
    <div class="card">1</div>
    <div class="card">2</div>
    <div class="card">3</div>
</div>
```

| Class | CSS |
|---|---|
| `.grid` | `display: grid; gap: 16px` |
| `.grid-cols-2/3/4` | Equal columns |
| `.grid-auto-fill` | `repeat(auto-fill, minmax(200px, 1fr))` |

**Responsive:** `.grid-cols-2/3/4` automatically collapse to single column below 480px viewport width.

---

## Gap & Spacing

| Gap | Padding | Margin |
|---|---|---|
| `.gap-1` (4px) | `.p-0/1/2/3/4/6` | `.m-0`, `.m-auto`, `.mx-auto` |
| `.gap-2` (8px) | `.px-2/4`, `.py-2/4` | `.mt-2/4`, `.mb-2/4` |
| `.gap-3/4/6/8` | | |

---

## Card

Cards have **no hover effect by default** — use `.card-hover` to opt in for interactive cards.

```html
<!-- Static display card -->
<div class="card">
    <div class="card-header">
        <span class="text-bold">Title</span>
        <span class="badge badge-accent">New</span>
    </div>
    <div class="card-body">Content</div>
    <div class="card-footer">
        <span class="text-sm text-muted">2h ago</span>
        <button class="btn btn-sm">Edit</button>
    </div>
</div>

<!-- Clickable card with hover shadow -->
<div class="card card-hover" onclick="...">
    <span>Click me</span>
</div>
```

| Class | Description |
|---|---|
| `.card` | Surface bg, border, rounded, no hover effect |
| `.card-hover` | Adds hover shadow transition (opt-in) |
| `.card-header` | Flex between, margin-bottom |
| `.card-body` | Margin-bottom |
| `.card-footer` | Flex between, border-top |

---

## Buttons

All variant classes (`.btn-primary`, `.btn-danger`, etc.) **must be combined with `.btn`**.

```html
<div class="btn-group">
    <button class="btn">Default</button>
    <button class="btn btn-primary">Primary</button>
    <button class="btn btn-danger">Delete</button>
    <button class="btn btn-ghost">Ghost</button>
    <button class="btn btn-icon"><svg class="icon">...</svg></button>
</div>
```

| Class | Description |
|---|---|
| `.btn` | **Required base.** Surface bg, border, rounded, focus ring |
| `.btn-primary` | Accent bg, white text |
| `.btn-danger` | Red text, transparent bg |
| `.btn-success` | Green text, transparent bg |
| `.btn-ghost` | No border, no bg |
| `.btn-icon` | Square, no border, icon-only |
| `.btn-sm` | Smaller |
| `.btn-lg` | Larger |
| `.btn-group` | Inline-flex with gap |

**Accessibility:** All `.btn` elements have `:focus-visible` outline (2px accent ring). Disabled state uses `opacity: 0.5` and `pointer-events: none`.

---

## Form Controls

Form controls use **class selectors** (`.input`, `.select`, `.textarea`), not element selectors. This avoids unintended style leaks when third-party scripts inject form elements.

```html
<div class="form-group">
    <label class="form-label">Name</label>
    <input class="input" placeholder="Enter name...">
    <span class="form-hint">Publicly displayed</span>
</div>

<div class="form-row">
    <label class="form-label flex-none">Search:</label>
    <input class="input flex-1">
</div>

<div class="check-row">
    <input type="checkbox" id="opt1">
    <label for="opt1">Enable feature</label>
</div>
```

| Class | Description |
|---|---|
| `.input` | Full-width text input, themed |
| `.select` | Full-width select |
| `.textarea` | Full-width textarea, resizable |
| `.form-group` | Vertical: label + control + hint |
| `.form-label` | Small bold label |
| `.form-hint` | Extra small muted hint |
| `.form-row` | Horizontal: label + control |
| `.check-row` | Checkbox/radio + label, hover bg |

**Accessibility:** `.input`, `.select`, `.textarea` have `:focus-visible` outline for keyboard navigation.

---

## Badge & Tag

```html
<span class="badge">Default</span>
<span class="badge badge-accent">Active</span>
<span class="badge badge-success">Pass</span>
<span class="tag">v1.2.0</span>
```

| Class | Description |
|---|---|
| `.badge` | Pill, muted |
| `.badge-accent/success/error/warning/info` | Color variants |
| `.tag` | Rectangle, muted |

---

## List

```html
<div class="list list-divided">
    <div class="list-item">Item 1</div>
    <div class="list-item selected">Item 2</div>
    <div class="list-item">Item 3</div>
</div>
```

| Class | Description |
|---|---|
| `.list` | Flex column container |
| `.list-item` | Flex row, hover bg, cursor pointer |
| `.list-item.selected/.active` | Accent bg |
| `.list-divided` | Borders between items |

---

## Table

```html
<table class="table table-striped">
    <thead><tr><th>Name</th><th>Status</th></tr></thead>
    <tbody><tr><td>A</td><td><span class="badge badge-success">OK</span></td></tr></tbody>
</table>
```

| Class | Description |
|---|---|
| `.table` | Full-width, collapse, hover rows |
| `.table-striped` | Alternating row bg |

---

## Typography

| Class | Effect |
|---|---|
| `.text-xs/sm/base/lg/xl` | Font size |
| `.text-muted` | Muted color |
| `.text-accent/success/error/warning` | Functional colors |
| `.text-bold` | Weight 600 |
| `.text-center/right` | Alignment |
| `.text-nowrap` | No wrapping |
| `.text-break` | Word break |
| `.text-mono` | Code font |
| `.text-truncate` | Ellipsis overflow |

---

## Other Components

```html
<!-- Empty state -->
<div class="empty-state">
    <svg class="empty-icon" viewBox="0 0 24 24">...</svg>
    <div>No items found</div>
</div>

<!-- Code block -->
<div class="code-block">const x = 42;</div>

<!-- Divider -->
<hr class="divider">

<!-- Icon in text — must use .icon class explicitly -->
<span class="flex items-center gap-1">
    <svg class="icon icon-sm">...</svg>
    Label
</span>
```

| Class | Description |
|---|---|
| `.empty-state` | Centered flex column, muted, min-height 200px |
| `.code-block` | Monospace, surface bg, border, scrollable (max 300px) |
| `.divider` | Horizontal rule with theme border |
| `.icon` | `display: inline-block`, 1em square SVG. **Required** — bare `<svg>` elements have no framework styles |
| `.icon-sm` (14px) / `.icon-md` (18px) / `.icon-lg` (24px) | Size variants |

---

## Utility Classes

| Class | Effect |
|---|---|
| `.w-full` / `.h-full` / `.h-screen` | Size |
| `.max-w-sm/md/lg/xl` | Max-width (480/680/960/1200px) |
| `.hidden` / `.block` / `.inline` | Display |
| `.scroll-y` | Vertical scroll only |
| `.overflow-hidden/auto` | Overflow |
| `.border` / `.border-b` / `.border-t` | Borders |
| `.rounded` / `.rounded-lg` / `.rounded-full` | Radius |
| `.shadow-sm/shadow/shadow-lg` | Shadows |
| `.cursor-pointer` / `.select-none` / `.opacity-50` | Misc |
| `.sr-only` | Screen reader only |

---

## Complete Example

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Record Viewer</title>
    <link rel="stylesheet" href="/plugins/sy-f-misc/styles/hspa-mini.css">
    <style>
        /* Only page-specific overrides */
        .record-content { max-height: 150px; }
    </style>
</head>
<body class="page">
    <div class="page-header">
        <div class="flex items-center gap-2">
            <span class="text-bold">Records</span>
            <span class="badge" id="count">0</span>
        </div>
        <button class="btn btn-danger btn-sm" id="clearBtn">Clear All</button>
    </div>

    <div class="page-body flex-col gap-3" id="list">
        <!-- Cards injected by JS -->
    </div>

    <div class="page-footer page-footer--between">
        <span class="text-sm text-muted">Showing all records</span>
        <button class="btn btn-primary" id="doneBtn">Done</button>
    </div>

    <script>
    window.addEventListener('pluginSdkReady', async () => {
        document.documentElement.setAttribute('data-theme-mode', window.pluginSdk.themeMode);
        const records = await window.pluginSdk.getRecords();
        render(records);
    });

    function render(records) {
        document.getElementById('count').textContent = records.length;
        const list = document.getElementById('list');
        if (!records.length) {
            list.innerHTML = '<div class="empty-state"><div>No records</div></div>';
            return;
        }
        list.innerHTML = records.map(r => `
            <div class="card">
                <div class="card-header">
                    <span class="text-bold text-sm">${r.title}</span>
                    <span class="tag">${r.type}</span>
                </div>
                <div class="code-block record-content">${esc(r.content)}</div>
                <div class="card-footer">
                    <span class="text-xs text-muted">${new Date(r.time).toLocaleString()}</span>
                    <button class="btn btn-sm">Copy</button>
                </div>
            </div>
        `).join('');
    }

    function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    </script>
</body>
</html>
```
