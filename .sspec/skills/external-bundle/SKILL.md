---
name: external-bundle
description: "Add, use, or migrate a module to the external bundle system in sy-f-misc. Trigger when: user asks to reduce bundle size, move a module to external, use dynamic import for a large module, or asks about @external imports."
metadata:
    version: 1.0.0
    author: frostime
    reference: .sspec/spec-docs/external-bundle.md
---

## What This Skill Covers

The `external bundle` system lets you split large/infrequently-used modules out of the main `index.js` bundle. They are compiled to separate `.js` files under `external/` and loaded at runtime via dynamic `import()`.

**Full architecture details** → [spec-doc](/.sspec/spec-docs/external-bundle.md)

---

## When to Use External Modules

Use external bundle for a module when **all** of the following are true:

- Size > ~5 KB (use `pnpm run build` + check bundle stats, or estimate from file size)
- Not on the startup critical path (not imported top-level in `index.ts` chain)
- Feature is triggered by user action, not automatically on plugin load
- Module is self-contained (doesn't depend heavily on other `src/` internals)

---

## Step-by-Step Workflow

### A. Create a New External Module

1. **Create the source file** in `src/external/`:

   ```typescript
   // src/external/my-module.ts
   export function myFunction(input: string): string {
       return input.trim();
   }
   export default class MyClass { /* ... */ }
   ```

   For a directory module:
   ```
   src/external/my-lib/
     index.ts    ← entry point
     helpers.ts  ← internal (bundled into my-lib.js)
   ```

2. **Register in `vite.config.ts`**:

   ```typescript
   // ============ 配置区域 ============
   const EXTERNAL_MODULES = ["sandbox", "text-edit-engine", "my-module"];
   // =================================
   ```

3. **Import dynamically in business code**:

   ```typescript
   // In an async function
   const mod = await import('@external/my-module');
   const result = mod.myFunction('hello');
   const instance = new mod.default();
   ```

4. **Verify build**: Run `pnpm dev` or `pnpm build`, confirm:
   - `dev/external/my-module.js` (or `dist/external/`) is generated
   - No warnings about unregistered modules in console

---

### B. Migrate Existing Module to External

1. **Move the file**:
   ```
   src/libs/heavy-module.ts  →  src/external/heavy-module.ts
   ```

2. **Register** in `vite.config.ts` `EXTERNAL_MODULES` array.

3. **Update all import sites** — replace static imports with dynamic:

   ```typescript
   // Before (static)
   import HeavyModule from '@/libs/heavy-module';

   // After (dynamic) — must be inside async function
   const { default: HeavyModule } = await import('@external/heavy-module');
   ```

4. **Remove old file** from `src/libs/` if no longer needed there.

5. **For TypeScript types** — use `import type` at the top (safe, no runtime effect):
   ```typescript
   import type { MyType } from '@external/heavy-module';
   ```

---

### C. Use an Existing External Module

```typescript
// Pattern 1: default export class
const SandboxModule = await import('@external/sandbox');
const JavaScriptSandBox = SandboxModule.default;
const instance = new JavaScriptSandBox();
await instance.init();

// Pattern 2: named exports
const { doSomething, MyClass } = await import('@external/my-module');

// Pattern 3: store module for reuse (avoid repeated imports)
let _sandboxMod: typeof import('@external/sandbox') | null = null;
async function getSandbox() {
    _sandboxMod ??= await import('@external/sandbox');
    return _sandboxMod;
}
```

---

## Checklist Before Finishing

- [ ] Module file exists in `src/external/`
- [ ] Module name added to `EXTERNAL_MODULES` in `vite.config.ts`
- [ ] All import sites use `await import('@external/...')` (no static imports)
- [ ] `import type` is used for type-only access if needed
- [ ] Build runs without warnings about unregistered modules
- [ ] Output file appears in `dev/external/` or `dist/external/`
- [ ] Old file removed from its original location (if migrating)

---

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| `import X from '@external/foo'` (static) | Plugin removes it, runtime crash | Use `await import(...)` |
| Module not in `EXTERNAL_MODULES` | Build warning, runtime 404 | Add to config array |
| Calling `import('@external/foo')` at top level | CJS bundle error with top-level await | Move into async function |
| External module imports from `@/` (main src) | Compile error or missing reference | Copy utility or extract to npm package |
| Forgot to save `vite.config.ts` after adding module | Module not built | Confirm the config change |

---

## Key Files

| File | Role |
|------|------|
| `vite.config.ts` | `EXTERNAL_MODULES` list + plugin setup |
| `vite-plugin-external-modules.ts` | Plugin implementation (scan, build, transform) |
| `src/external/` | Source directory for all external modules |
| `dev/external/` / `dist/external/` | Build output |
````
