## FAQ NOTE

- 思源插件开发
  - 思源 API; 依赖 siyuan-plugin-kits
  - solidjs; 开发组件时请用 solid-signal-ref
- 打包 @vite.config.ts
- 版本 -> package.json + plugin.json
- 多功能复合插件。插件入口 @src/index.ts, 各类子功能 @src/func/
- 灵活运用 spec-docs, bash(rg, fd, asq file-tree, slsp) 等快速定位任务相关代码


<!-- SSPEC:START -->
# sspec Router

SSPEC_SCHEMA::7.0

`sspec` is a spec-driven development workflow. Use it for non-trivial code changes that benefit from upfront clarification, design alignment, and structured execution — especially when the outcome should be predictable before implementation begins.

## Full Rule Trigger

Read `.sspec/SSPEC.rule.md` when:
- user mentions sspec, spec, change, request, spec-doc, align, or argue;
- task references `.sspec/requests/*`, `.sspec/changes/*`, or `.sspec/spec-docs/*`;
- user asks to create/update project context, request, change, spec-doc, memory, or workflow state;
- user asks to clarify/design/plan/implement/review using sspec;
- task is a non-trivial code change (multi-file, cross-module, or architectural).

Pure code edits with no sspec workflow intent may be done directly.

## Project Context

Read `.sspec/project.md` before project-specific work on cold start.
Use its Key Paths, Conventions, and Spec-Docs Index for orientation.
Read spec-docs only when the current task matches their index entry.

## Skills

After reading `.sspec/SSPEC.rule.md`, load matching `.sspec/skills/<name>/SKILL.md` before that phase/task.
<!-- SSPEC:END -->
