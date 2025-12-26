# Project Context

This is a SiYuan Note plugin project **sy-f-misc** (F's Toolbox).

## Overview

A comprehensive personal toolbox plugin for SiYuan Note, providing a collection of powerful utilities and integrations. The plugin is primarily designed for private usage but published as open-source under GPL-3.0-only license.

**Version**: 7.7.7  
**Author**: frostime  
**Repository**: https://github.com/frostime/sy-f-misc  
**Min SiYuan Version**: 3.1.20

## Basic Information

### Directory Structure

- `src/`: Contains all source code
  - `src/libs/`: Common libraries and utilities used across the plugin
    - `src/libs/components/`: Shared SolidJS components for UI
  - `src/func/`: Functional modules - each major feature is organized in its own folder
  - `src/api/`: SiYuan API integration and wrappers
  - `src/settings/`: Plugin settings and configuration management
  - `src/types/`: Global TypeScript type declarations (`*.d.ts`)
- `asset/style/`: CSS stylesheets for custom styling
- `public/`: Static assets accessible at runtime
  - `public/pages/`: HTML pages for iframe-based UI
  - `public/i18n/`: Internationalization files
  - `public/scripts/`: Runtime JavaScript scripts
- `dev/`: Development build output (with sourcemap and watch mode)
- `dist/`: Production build output (minified, optimized)
- `scripts/`: Build and deployment automation scripts
- `openspec/`: OpenSpec project documentation and change proposals

### Build Output

- Compiled by Vite into a single bundled `index.js` file
- All `src/**/*.html` files are copied to `pages/` directory
- All `src/**/*.md` files are copied to `docs/` directory
- Production builds are minified and optimized
- Development builds include inline sourcemaps

### Key Functional Modules

- **`src/func/gpt`**: A powerful LLM chat and agent system with:
  - Multi-turn conversation interface
  - Tool calling capabilities (web search, file system, SiYuan integration)
  - Custom Python script tools support
  - Conversation history management and sync
  - Model and prompt management
- **`src/func/html-pages`**: Custom HTML page rendering framework using iframes
- **`src/func/super-ref-db`**: SuperTag-like functionality combining backlinks with databases
- **`src/func/asset-file`**: Asset file management utilities
- **`src/func/websocket`**: WebSocket server for external command integration
- **`src/func/custom-css-file`**: Custom CSS file support

Note: Each functional module is typed by `src/func/types.d.ts`

## Tech Stack

### Core Framework & Language
- **TypeScript**: Primary development language with strict typing
- **SolidJS 1.9+**: Reactive UI framework for component development
- **Vite 6.4+**: Build tool and development server
- **Sass/SCSS**: CSS preprocessing with legacy JS API support

### SiYuan Integration
- **SiYuan Plugin API**: Plugin lifecycle, events, and core functionality
- **SiYuan Kernel API**: Backend API for note manipulation
- **SiYuan Types**: TypeScript definitions for SiYuan data structures
- **SiYuan CSS Variables**: Theme variables (prefixed with `--b3-`)
- **SiYuan CSS Classes**: UI components (prefixed with `b3-`)

### Key Libraries
- **@frostime/solid-signal-ref**: Enhanced signal management for SolidJS
  - Simplifies reactive state with ref-based API
  - https://www.npmjs.com/package/@frostime/solid-signal-ref
- **@frostime/siyuan-plugin-kits**: Utility toolkit for SiYuan plugin development

## Project Conventions

### Code Style & Principles
- **Follow SOLID Principles**: Single responsibility, open-closed, Liskov substitution, interface segregation, dependency inversion
- **Follow YAGNI Rule**: "You Aren't Gonna Need It" - code elegantly, avoid over-engineering
- **Minimize Changes**: Prevent excessive modifications; focus on targeted, effective changes
- **Preserve Documentation**: Maintain existing comments and documentation
- **Preserve Unrelated Code**: Keep code that's not directly related to current task

### SolidJS Best Practices
- Follow SolidJS reactive patterns and component lifecycle
- Use `@frostime/solid-signal-ref` for cleaner signal management
- Proper component composition and props handling
- Avoid breaking reactivity chains

### TypeScript Conventions
- Use strict typing where appropriate (strict: false in tsconfig but maintain quality)
- Global types defined in `src/types/*.d.ts`
- Module-specific types in respective module folders (e.g., `src/func/gpt/types.ts`)
- Check type declaration files when encountering undefined types

### Module Organization
- Each functional module lives in its own folder under `src/func/`
- Module structure defined by `src/func/types.d.ts`
- Shared components in `src/libs/components/`
- Shared utilities in `src/libs/`

### Import Conventions
- Use path aliases: `@/` for `src/`, `@gpt/` for `src/func/gpt/`
- **Avoid `await import()`** for internal modules (single bundle compilation)
- Only use dynamic imports for external JavaScript files
- Module resolution: bundler mode

## 思源笔记环境 (SiYuan Environment)

### Plugin Installation & Runtime
- 插件被编译之后，安装在思源笔记的 `<workspace>/data/plugins/sy-f-misc/` 目录下
- Plugin is installed to `<workspace>/data/plugins/sy-f-misc/` after compilation
- 思源会直接加载打包的 `index.js`，因此要**避免使用 `await import()` 导入插件内模块**
- SiYuan directly loads the bundled `index.js`, so **avoid `await import()` for internal modules**

### Platform Differences
- **Desktop (Electron)**:
  - 可以通过 `window.require` 获取 `electron`, `fs`, `path` 等 Node.js 包
  - Has access to Node.js APIs via `window.require`
- **Docker/Browser**:
  - 无法使用 Node.js APIs
  - Limited to web APIs only
  - Need fallbacks for platform-specific features

### SiYuan Theme System
- 思源笔记内置 CSS 变量以 `--b3-` 前缀开头
- Built-in CSS variables: `--b3-theme-primary`, `--b3-theme-background`, etc.
- 思源笔记内置 CSS class 以 `b3-` 前缀开头
- Built-in CSS classes: `b3-label`, `b3-button`, `b3-dialog`, etc.
- 组件中可以直接使用这些变量和类来保持主题一致性
- Use these directly in components for theme consistency

### Static File Hosting
思源中以下路径被后端静态托管，可以直接用 `fetch` 访问:
The following paths are statically hosted by SiYuan backend:

- **`/data/assets/*`** → workspace `assets/*`
  - Example: `![image](assets/image-20240731195519-xgw9ya7.png)`
  - Direct access: `fetch('/data/assets/image-xxx.png')`
- **`/data/public/*`** → workspace `public/*`
- **`/plugins/sy-f-misc/*`** → plugin resources
  - HTML pages: `/plugins/sy-f-misc/pages/xxx.html`
  - Scripts: `/plugins/sy-f-misc/scripts/xxx.js`

## Important Constraints


## External Dependencies

### SiYuan Platform
- **[SiYuan Plugin API](https://github.com/siyuan-note/petal)**: Official plugin development framework
- **[SiYuan Kernel API](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)**: Backend HTTP API documentation
- **[SiYuan Database Schema](https://raw.githubusercontent.com/siyuan-community/siyuan-developer-docs/refs/heads/main/docs/zh-Hans/reference/database/table.md)**: SQLite database structure reference
- **[siyuan](https://www.npmjs.com/package/siyuan)**: TypeScript type definitions for SiYuan

### Core Libraries
- **[SolidJS](https://www.solidjs.com/)**: Reactive UI framework (v1.9+)
- **[@frostime/solid-signal-ref](https://www.npmjs.com/package/@frostime/solid-signal-ref)**: Enhanced SolidJS signal management
- **[@frostime/siyuan-plugin-kits](https://www.npmjs.com/package/@frostime/siyuan-plugin-kits)**: SiYuan plugin utilities

## Diaplay Solid UI In SiYuan (Skill/HTML Pages)

The solidjs component can be display in SiYuan in thease ways:

1. Open in dialog: please use `solidDialog` API (src/libs/dialog.ts)
2. Open in tab: use `openCustomTab`, for example to refer to src\func\gpt\index.ts
3. Open in side area(dock): use plugin's `addDock` api, for example to refer to src\func\gpt\index.ts

## HTML Page Development (Skill/HTML Page)

### When to Use HTML Pages
To reduce bundle size, sometimes pure HTML pages are more appropriate than SolidJS components.

When creating HTML-based UI:

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

Use these methods to display HTML pages:

- **`openIframeTab(options)`**: Open as a tab in main area
- **`openIframeDialog(options)`**: Open as a modal dialog

For development convenience, you can inject `customSdk`.
