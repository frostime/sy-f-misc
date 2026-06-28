---
name: refactor-zotero
created: 2026-06-28 18:08:22
status: DOING
kind: directive
attach-change: .sspec/changes/26-06-28T18-26_refactor-zotero/spec.md
tldr: ''
---
<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this! -->

# Request: refactor-zotero

阅读 .sspec\requests\references\2026-06-28_handover.md

然后和我讨论重构 zotero 方案

---

我的总体需求:

- zotero 模块不在需要一来 debug bridge
- 默认支持 v9 以上，低版本不保证支持
- 增加说明、 安装文档（help doc button）
- 旧版再做 migration 的时候弹出提示，说明需要做迁移
  - 基本准备：打开 zotero debug
  - 安装插件
- 其他: 可能需要考虑增加插件 update 功能

乱七八糟的总之需要讨论清楚


---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL and cooperate with user.
