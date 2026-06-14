---
name: gpt-chat-cache-issue
created: 2026-06-12 21:32:38
status: DOING
kind: directive
attach-change: .sspec/changes/26-06-12T22-35_gpt-cache-split/spec.md
tldr: ''
---
<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this! -->

# Request: gpt-chat-cache-issue

## Background
<!-- Current situation, background information -->
我们的 GPT 对话中，存储分为临时存储（缓存）和持久存储（json）两种

其中缓存会保存在一个 gpt-chat-cache.json 的文件中。

## Problem
<!-- What is not working or missing -->

由于每次对话完成如果有修改，就会更新 cache，所以在思源笔记开启了同步的情况下，会非常容易大量重复同步这个文件。

以我自己使用的例子，这个 json 文件在我的机器上有 68MB

而思源笔记每次同步会积累一个 history 快照，时间一长非常容易积累到十几个 GB 大小

## Initial Direction
<!-- Your rough idea or preferred direction — details are fine but not required.
This becomes the starting point for the change's spec.md Approach. -->

我的想法是安全拆分。比如放在

gpt-cache/ 中

但是如何安全拆分，如何把原本对一个文件的操作完美映射到对多个文件需要想清楚。

并且还要仔细考虑迁移问题。

## Success Criteria
<!-- Conditions that indicate the problem has been resolved and meets the user's intention -->

安全、对用户无感地解决这个问题。

## Relational Context
<!-- Constraints, preferences, related file links -->

This is summarized by subagent: {

  ### Primary Target
  - `src/func/gpt/persistence/local-storage.ts` — 35 lines, the cache read/write code
  
  ### Context to Read
  - `src/func/gpt/persistence/json-files.ts` — 已有 per-session 拆分模式可参考
  - `src/func/gpt/persistence/index.ts` — re-export 入口
  - `src/func/gpt/index.ts` — 调用 `persist.restoreCache()` + `persist.updateCacheFile()` 的位置
  
  ### Spec-Docs
  - `.sspec/spec-docs/gpt-module-architecture-overview.md` §7.4 — persistence 层概览
  - `.sspec/spec-docs/gpt-chat-module-cross-file-architecture.md` — 跨文件调用链
  
  ### External API
  - `plugin.saveBlob()` / `plugin.loadBlob()` — 定义在 `@frostime/siyuan-plugin-kits/dist/api.mjs` L361-389，最终调 `putFile` 写入 `/data/storage/petal/{plugin}/`
  ---

}

Bash 中支持 rg, fd, asq file-tree, slsp, sed 等等乱七八糟工具，根据需要使用

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL, and follow it.

NOTE: use wip branch method (refactor/) with this change.
