---
change: "extract-siyuan-hspa"
created: 2026-07-04T00:21:02
---

# Design: extract-siyuan-hspa

<!-- MUST maintain quality bar (non-negotiable):
Use semi-structured, formalized expression over flat prose.
Goal: maximize information density, minimize ambiguity, optimize reader comprehension.
In short: show, don't describe.

Fence nesting: when showing content that contains ```, outer fence MUST use more backticks. Always outer > inner.

Recommended tools (non-exhaustive):
- typed code block: interfaces, types, schemas, config, prompts...
- ASCII diagram: call chains, state machines, module trees, content outlines...
- table: before/after comparison, option tradeoffs, scope mapping...
- labeled items: multi-change annotation (Fix A / Feat B / Step 1...)
- pseudocode, decision trees, constraint lists

Anti-pattern:
  ❌ "We will add a function that accepts X and returns Y"
  ✅ `def process(x: Input) -> Output: ...`

  ❌ "The request first goes through module A, then is passed to B"
  ✅ request → A.validate() → B.process() → response
-->

<!-- SHOULD organize by the nature of the change. No fixed sections required.
Reference patterns by change type (pick what fits, not mandatory):

Feature/Bugfix  → interface signatures + behavioral flow + data model
Refactor        → before/after structural comparison + migration steps
Docs/Templates  → content outline + section hierarchy
Prompt/Rules    → before/after examples + decision logic
Config/Schema   → schema definition + migration path + compatibility strategy
-->

## Design Pressures

| Pressure | Design response |
|---|---|
| Reuse across SiYuan plugins | New standalone package, no dependency on `sy-f-misc` internals |
| Predictable public API | Small stable-core preset SDK; no page storage or business semantics |
| Low integration cost | Explicit `plugin: Plugin` parameter + URL helpers + Vite static-copy targets |
| Debuggability | No HTML transform, no hidden `hspa-client.js`, explicit CSS/Alpine links |
| Package portability | `siyuan` as peer dependency; `tsup` ESM build; assets/docs/examples/SKILL published |
| Preserve current plugin | No migration of existing `sy-f-misc/src/func/html-pages/*` |

Rejected axis: generic browser iframe framework. Reason: useful behavior depends on SiYuan `Plugin`, `Dialog`, `openTab`, kernel APIs, theme variables, and plugin asset paths.

## Target Package Layout

```text
../siyuan-hspa/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── src/
│   ├── index.ts              # public runtime exports
│   ├── runtime.ts            # createIframePage + SDK/style injection
│   ├── siyuan.ts             # openIframeTab/openIframeDialog/buildPresetSdk
│   ├── assets.ts             # pluginAssetUrl/hspaPageUrl helpers
│   ├── vite.ts               # hspaStaticCopyTargets
│   └── types.ts              # public types
├── assets/
│   └── hspa/
│       ├── styles/hspa-mini.css
│       └── scripts/alpine.min.js
├── docs/
│   ├── api.md
│   ├── html-authoring.md
│   ├── assets.md
│   └── skill.md              # points to ../skill/hspa/SKILL.md
├── examples/
│   ├── vanilla-page.html
│   ├── alpine-page.html
│   └── mock-plugin/
└── skill/
    └── hspa/SKILL.md

sy-f-misc/
└── packages/siyuan-hspa -> ../siyuan-hspa   # Windows junction
```

## Public API Contract

```ts
import type { Plugin } from 'siyuan';

type Scalar = string | number | boolean | null;
type EventDetail = Scalar | Record<string, unknown> | Array<unknown>;

export interface IframePageConfig<Sdk extends Record<string, unknown> = Record<string, unknown>> {
  type: 'url' | 'html-text';
  source: string;
  iframeStyle?: Partial<CSSStyleDeclaration> & Record<string, unknown>;
  inject?: {
    presetSdk?: boolean;        // default true in SiYuan wrappers; false disables preset
    siyuanCss?: boolean;        // default true; injects theme CSS variables
    customSdk?: Sdk;            // flat-merged into window.pluginSdk
    customCss?: Record<string, string>;
  };
  onLoadEvents?: Record<string, EventDetail>;
  onLoad?: (iframe: HTMLIFrameElement) => void;
  onDestroy?: () => void;
}

export interface IframePageHandle {
  cleanup(): void;
  dispatchEvent(eventName: string, detail?: EventDetail): void;
  iframeRef: WeakRef<HTMLIFrameElement>;
  isAlive(): boolean;
}

export interface OpenIframeTabOptions<Sdk extends Record<string, unknown> = Record<string, unknown>> {
  tabId: string;
  title: string;
  icon?: string;
  position?: 'right' | 'bottom';
  iframeConfig: IframePageConfig<Sdk>;
  onTabDestroy?: () => void;
}

export interface OpenIframeDialogOptions<Sdk extends Record<string, unknown> = Record<string, unknown>> {
  title: string;
  iframeConfig: IframePageConfig<Sdk>;
  width?: string;
  height?: string;
  maxWidth?: string;
  maxHeight?: string;
}

export interface IframeDialogHandle extends IframePageHandle {
  close(): void;
  container: HTMLElement;
}

export function createIframePage(
  container: HTMLElement,
  config: IframePageConfig,
): IframePageHandle;

export function openIframeTab(
  plugin: Plugin,
  options: OpenIframeTabOptions,
): IframePageHandle;

export function openIframeDialog(
  plugin: Plugin,
  options: OpenIframeDialogOptions,
): IframeDialogHandle;

export function buildPresetSdk(plugin: Plugin, options?: PresetSdkOptions): HspaPresetSdk;

export function pluginAssetUrl(plugin: Plugin, path: string): string;
export function hspaPageUrl(plugin: Plugin, filename: string): string;
```

`@frostime/siyuan-hspa/vite`:

```ts
export interface HspaStaticCopyOptions {
  dest?: string; // default: 'hspa'
}

export function hspaStaticCopyTargets(options?: HspaStaticCopyOptions): Array<{
  src: string;
  dest: string;
}>;
```

## Runtime Flow

```text
Consumer plugin
  → openIframeTab(plugin, { iframeConfig })
  → plugin.addTab({ type, init }) + openTab({ app: plugin.app, custom })
  → init(container)
  → createIframePage(container, iframeConfig)
  → iframe loads same-origin url/srcdoc
  → injectSdk(iframe, plugin, config)
      → buildPresetSdk(plugin)
      → finalSdk = { ...presetSdk, ...customSdk }
      → iframe.contentWindow.pluginSdk = finalSdk
      → inject <style id="siyuan-injected-styles"> CSS vars
      → set iframe.documentElement[data-theme-mode]
      → dispatch pluginSdkReady
      → dispatch onLoadEvents
  → return IframePageHandle proxy
```

Dialog flow:

```text
openIframeDialog(plugin, options)
  → create container
  → createIframePage(container, withPresetPlugin(plugin, options.iframeConfig))
  → new Dialog({ content: container wrapper, destroyCallback })
  → destroyCallback → iframeHandle.cleanup()
  → return { close, container, cleanup, dispatchEvent, iframeRef, isAlive }
```

## Stable-Core Preset SDK

```ts
export interface HspaPresetSdk {
  request(endpoint: string, data?: unknown): Promise<{ ok: boolean; data: unknown; code?: number; msg?: string }>;
  querySQL(query: string): Promise<unknown[]>;
  getBlockByID(blockId: string): Promise<unknown | null>;
  getMarkdown(blockId: string): Promise<string>;
  lsNotebooks(): Array<{ id: string; name: string; closed: boolean }>;
  openBlock(blockId: string): void;

  confirm(title: string, text: string, confirmCallback?: () => void, cancelCallback?: () => void): void;
  showMessage(message: string, type?: 'info' | 'error', duration?: number): void;
  showDialog(options: {
    title: string;
    ele: HTMLElement | DocumentFragment;
    width?: string;
    height?: string;
    afterClose?: () => void;
  }): { close(): void; container: HTMLElement };

  themeMode: 'light' | 'dark';
  styleVar: Record<string, string>;
  lute: unknown;
}
```

Implementation mapping:

| SDK field | Source |
|---|---|
| `request` | `fetchSyncPost(endpoint, data)` from `siyuan` |
| `querySQL` | `request('/api/query/sql', { stmt: query })` |
| `getBlockByID` | `querySQL("select * from blocks where id = ...")` |
| `getMarkdown` | `/api/block/getBlockKramdown` result kramdown/markdown field, normalized to string |
| `lsNotebooks` | `window.siyuan.notebooks` if present, fallback to `/api/notebook/lsNotebooks` if needed during implementation |
| `openBlock` | `openTab({ app: plugin.app, doc: { id: blockId } })` |
| `confirm/showMessage/Dialog` | official `siyuan` exports |
| `themeMode/styleVar` | computed from current SiYuan DOM CSS variables |
| `lute` | `window.Lute?.New?.()` or available SiYuan global; implementation must verify current API |

Excluded from first public preset:

```text
loadConfig/saveConfig/loadAsset/saveAsset  # host business storage
queryDailyNote/queryChildDocs/queryParentDoc/queryBacklinks/createDailynote
loadBlob/saveBlob
inputDialog
```

Rationale: these either encode higher-level SiYuan behavior, need more endpoint verification, or imply host storage policy. They can be added later without breaking the stable core.

## HTML Authoring Contract

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="../hspa/styles/hspa-mini.css" />
  <style>[x-cloak] { display: none !important; }</style>
</head>
<body>
  <main class="page" x-data="app()" x-init="init()" x-cloak>
    <button class="btn primary" @click="ping">Ping</button>
  </main>

  <script>
    function app() {
      return {
        _initialized: false,
        async init() {
          if (this._initialized) return;
          this._initialized = true;
          await new Promise(resolve => {
            if (window.pluginSdk) return resolve();
            window.addEventListener('pluginSdkReady', resolve, { once: true });
          });
        },
        ping() {
          window.pluginSdk.showMessage('pong');
        }
      };
    }
  </script>
  <script src="../hspa/scripts/alpine.min.js" defer></script>
</body>
</html>
```

Rules:

| Rule | Owner | Enforcement |
|---|---|---|
| Same-origin plugin page or `srcdoc` for SDK injection | Developer | Runtime warns on inaccessible iframe document/window |
| Wait for `pluginSdkReady` before using SDK | Developer | Template/SKILL/docs |
| `customSdk` is flat-merged into `pluginSdk` | Package + Developer | API docs + examples |
| Explicit `<link>` for `hspa-mini.css` | Developer | Template/docs |
| Explicit Alpine script only when needed | Developer | Template/docs |
| No CDN for recommended assets | Developer | SKILL/docs |
| No native `alert/confirm/prompt` | Developer | SKILL/docs |
| `hspa-mini.css` class set is finite, not Tailwind | Developer | CSS reference/docs |
| No `hspa-client.js` | Package | Omitted from assets/API |
| No HTML transform | Package | Omitted from build/API |

## Asset Copy Contract

Host Vite config:

```ts
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { hspaStaticCopyTargets } from '@frostime/siyuan-hspa/vite';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        ...hspaStaticCopyTargets(),
      ],
    }),
  ],
});
```

Build result:

```text
node_modules/@frostime/siyuan-hspa/assets/hspa/*
  → dist/hspa/*
  → /plugins/<plugin-name>/hspa/*
```

HTML reference from `dist/pages/*.html`:

```html
<link rel="stylesheet" href="../hspa/styles/hspa-mini.css">
<script src="../hspa/scripts/alpine.min.js" defer></script>
```

## Mock Plugin Acceptance Shape

```text
examples/mock-plugin/
├── package.json
├── vite.config.ts
├── plugin.json
├── src/index.ts
└── src/pages/demo.html
```

Expected behavior:

```text
pnpm install && pnpm build
  → mock dist contains index.js, pages/demo.html, hspa/styles/hspa-mini.css, hspa/scripts/alpine.min.js

In SiYuan mock plugin:
  → command/menu opens HSPA tab or dialog
  → demo page receives pluginSdkReady
  → demo displays theme mode
  → demo button calls pluginSdk.showMessage('...')
  → demo calls pluginSdk.request('/api/system/currentTime', {})
  → host dispatches a custom event and page displays detail
```

## Package Metadata Contract

```json
{
  "name": "@frostime/siyuan-hspa",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./vite": {
      "types": "./dist/vite.d.ts",
      "import": "./dist/vite.js"
    },
    "./styles/hspa-mini.css": "./assets/hspa/styles/hspa-mini.css",
    "./scripts/alpine.min.js": "./assets/hspa/scripts/alpine.min.js"
  },
  "files": [
    "dist",
    "assets",
    "examples",
    "docs",
    "skill",
    "README.md"
  ],
  "peerDependencies": {
    "siyuan": ">=1.1.7"
  },
  "devDependencies": {
    "siyuan": "^1.1.7",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

## SKILL Contract

```text
skill/hspa/SKILL.md
├─ when to use @frostime/siyuan-hspa
├─ install + Vite asset copy setup
├─ openIframeTab/openIframeDialog examples
├─ HTML authoring rules
├─ preset SDK reference
├─ Alpine template rules
├─ hspa-mini.css warning: not Tailwind
├─ customSdk flat merge warning
└─ boundaries: UI iframe only; no Protyle/editor DOM control
```

`docs/skill.md` links to `../skill/hspa/SKILL.md` so GitHub browsing and agent loading both work.

## Non-Goals / YAGNI Cuts

```text
No sy-f-misc migration
No Vue vendor
No hspa-client.js
No HTML transform/build plugin
No page storage SDK
No generic browser framework abstraction
No npm publish execution during implementation
No mobile/old-SiYuan compatibility promise beyond current mainstream SiYuan + modern browser/Electron
```
