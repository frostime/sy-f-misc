# Project Context

**Name**: sy-f-misc
**Description**: A SiYuan Note plugin project.
**Repo**: https://github.com/frostime/sy-f-misc

A comprehensive personal toolbox plugin for SiYuan Note, providing a collection of powerful utilities and integrations.

## Tech Stack

- **Language**: typescript
- **Key Dependencies**:
  - SiYuan Plugin API
  - solidjs
  - @frostime/solid-signal-ref
  - @frostime/siyuan-plugin-kits
- **Build Tool**:
  - vite
  - pnpm
- **Test Framework**: No, siyuan plugin can not easily been tested, we should use `pnpm run dev` and debug/test it within SiYuan app.

### Build

See `vite.config.ts`. plugin will be compiled to single index.js, and distributed to `dev/` or `dist/`.

- Code from `src/` will be compiled by Vite into a single bundled `<dist>/index.js` file
- CSS file will be bundled to `<dist>/index.css`
- `plugin.json` will be copied to dist dir, as the manifest file of plugin.
- Static files
  - `/README*.md,preview.png,icon.png` file are copied to `<dist>/`
  - All `src/**/*.html` files are copied to `<dist>/pages/`
  - All `src/**/*.md` files are copied to `<dist>/docs/`
- All from `/public/` will be copied to `<dist>/`

## Conventions/Constraints

### Code Style & Principles

**Oracle Rule**

- **Follow SOLID Principles**: Single responsibility, open-closed, Liskov substitution, interface segregation, dependency inversion
- **Follow YAGNI Rule**: "You Aren't Gonna Need It" - code elegantly, avoid over-engineering

**Prefered Rule**

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

## External References

- **[SiYuan Plugin API](https://github.com/siyuan-note/petal)**: Official plugin development framework
- **[SiYuan Kernel API](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)**: Backend HTTP API documentation
- **[SiYuan Database Schema](https://raw.githubusercontent.com/siyuan-community/siyuan-developer-docs/refs/heads/main/docs/zh-Hans/reference/database/table.md)**: SQLite database structure reference
- **[SolidJS](https://www.solidjs.com/)**: Reactive UI framework (v1.9+)
- **[@frostime/solid-signal-ref](https://www.npmjs.com/package/@frostime/solid-signal-ref)**: Enhanced SolidJS signal management
- **[@frostime/siyuan-plugin-kits](https://www.npmjs.com/package/@frostime/siyuan-plugin-kits)**: SiYuan plugin utilities
