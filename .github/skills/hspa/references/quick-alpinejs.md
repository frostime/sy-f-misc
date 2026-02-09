# Alpine.js Quick Reference for HSPA

Alpine is a lightweight reactive framework for composing behavior directly in HTML. It's the **recommended** choice for HSPA pages.

---

## HSPA Integration Checklist

Every Alpine.js HSPA page must have these five elements:

### 1. Anti-FOUC CSS (in `<head>`)

```html
<style>[x-cloak] { display: none !important; }</style>
```

Without this, users see raw `{{ }}` templates before Alpine initializes.

### 2. Root Element

```html
<div x-data="app()" x-init="init()" x-cloak>
    <!-- all content -->
</div>
```

### 3. Script Load Order

```html
<!-- Data factory function FIRST -->
<script>function app() { return { ... }; }</script>

<!-- Alpine.js LAST -->
<script src="/plugins/sy-f-misc/scripts/alpine.min.js" defer></script>
```

Alpine scans the DOM for `x-data` on load. If the factory function isn't defined yet, it fails silently.

### 4. SDK Init Pattern

```javascript
async init() {
    if (this._initialized) return;      // Guard against re-injection
    this._initialized = true;
    await new Promise(r => {
        if (window.pluginSdk) return r();
        window.addEventListener('pluginSdkReady', r, { once: true });
    });
    document.documentElement.setAttribute('data-theme-mode', window.pluginSdk.themeMode);
    await this.loadData();
}
```

### 5. Proxy Unwrapping

Alpine wraps all reactive data in `Proxy`. SDK functions can't serialize Proxies. **Always unwrap:**

```javascript
await window.pluginSdk.saveItems(Alpine.raw(this.items));  // ✅
await window.pluginSdk.saveItems(this.items);              // ❌ Proxy serialization error
```

---

## Reactivity Patterns

### Simple Computed → Getter

Alpine auto-tracks getter dependencies:

```javascript
get count() { return this.items.length; },
get isEmpty() { return this.items.length === 0; },
```

### Complex Filtering → Manual Trigger + Cache

Alpine doesn't deep-track nested object mutations reliably. For multi-field filtering:

```javascript
filteredItems: [],
applyFilters() {
    let result = this.items;
    if (this.query) result = result.filter(i => i.name.includes(this.query));
    if (this.type) result = result.filter(i => i.type === this.type);
    this.filteredItems = result;
}
```
```html
<input class="input" x-model="query" @input="applyFilters()">
```

### Side Effects → `x-effect`

Auto-runs when dependencies change. Good for scrolling, DOM sync, etc.

```html
<div x-effect="if (selectedId) $refs.container.querySelector(`[data-id='${selectedId}']`)?.scrollIntoView()"></div>
```

⚠️ Don't use for heavy DOM ops on every keystroke.

---

## Key Directives

| Directive | Purpose | Example |
|---|---|---|
| `x-data` | Declare component + data | `<div x-data="app()">` |
| `x-bind` / `:` | Dynamic attributes | `:class="active ? 'on' : ''"` |
| `x-on` / `@` | Event listeners | `@click="toggle()"` |
| `x-text` | Set text content | `<span x-text="count"></span>` |
| `x-html` | Set innerHTML (use sparingly) | `<div x-html="rendered"></div>` |
| `x-model` | Two-way binding | `<input x-model="query">` |
| `x-show` | Toggle visibility (display:none) | `<div x-show="open">` |
| `x-if` | Conditional render (must be on `<template>`) | `<template x-if="show"><div>...</div></template>` |
| `x-for` | Loop (must be on `<template>`) | `<template x-for="item in items" :key="item.id">` |
| `x-ref` | Name an element for `$refs` | `<div x-ref="container">` |
| `x-init` | Run code on init | `<div x-init="loadData()">` |
| `x-effect` | Reactive side effects | `<div x-effect="console.log(count)">` |
| `x-cloak` | Hide until Alpine ready | `<div x-cloak>` |
| `x-transition` | Animate show/hide | `<div x-show="open" x-transition>` |

### Event Modifiers

`@click.prevent`, `@click.stop`, `@click.outside`, `@keydown.enter`, `@click.once`

---

## Key Properties

| Property | Purpose | Example |
|---|---|---|
| `$refs` | Access ref'd elements | `$refs.input.focus()` |
| `$el` | Current DOM element | `$el.classList.toggle('on')` |
| `$dispatch` | Emit custom event | `$dispatch('selected', { id })` |
| `$watch` | Watch data changes | `$watch('query', v => filter())` |
| `$nextTick` | Wait for DOM update | `$nextTick(() => $refs.list.scrollTop = 0)` |

---

## Common HSPA Pitfalls

| Problem | Fix |
|---|---|
| FOUC — raw templates flash | Add `[x-cloak]` CSS + `x-cloak` attribute |
| Init runs twice | `_initialized` guard flag |
| SDK data serialization error | `Alpine.raw()` before passing to SDK |
| Getter not updating for nested data | Use manual trigger + cache |
| Alpine not finding data function | Define `<script>` before Alpine's `<script>` |
| `x-for` / `x-if` not working | Must be on `<template>` elements |
| `x-show` vs `x-if` confusion | `x-show` for frequent toggles; `x-if` for expensive/conditional content |
| `@click.outside` fires immediately | Use `x-show` instead of `x-if` for overlays with `@click.outside` |

---

## Complete Template

See `references/hspa-alpine-example.html` for a copy-paste starting point.
