Project summary: read `.dev/project.md`
Development document: read `.dev/docs/`

=== FAQ NOTE ===

- 思源插件开发
  - 思源 API; 依赖 `siyuan-plugin-kits`
  - solidjs; 开发组件时请用 `solid-signal-ref`
- 打包 `vite.config.ts`
- 版本 -> `package.json` + `plugin.json`
- 多功能复合插件。插件入口 @src/index.ts, 各类子功能 @src/func/
