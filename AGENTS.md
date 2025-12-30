本项目开发遵循 SSPEC 和 Vibe Coding 规范

日常以 Vibe Coding 为主，当激活 SSPEC 规范时，以 SSPEC 为主。

<!-- SSPEC:START -->
# sspec

SSPEC_SCHEMA::2.1

This project uses sspec for AI collaboration.

## 🚀 Quick Start

**User mentioned these keywords?** Read `@/.sspec/AGENTS.md` immediately:
- sspec
- "new feature" / "create change" / `@new`
- "change plans" / "pivot" / `@pivot`
- "end session" / "handover" / `@handover`
- "status" / "progress" / `@status`
- "go on changes" / `@context`

## 📍 Core Files

- `@/.sspec/AGENTS.md` — Complete workflow instructions
- `@/.sspec/knowledge/index.md` — Project context
- `@/.sspec/changes/<name>/spec.md` — Current change plan
- `@/.sspec/changes/<name>/handover.md` — Previous session state

## ⚡ Cross Session Principles

1. **Session start**: Read handover.md (where we left off)
2. **Task completed**: Update spec.md progress
3. **Session end**: Write handover.md (where to continue)

Full instructions: `@/.sspec/AGENTS.md`

<!-- Keep this block for `sspec update` to refresh -->
<!-- SSPEC:END -->

<!-- GIT:START -->

### Git Commit Conventions

**NOTE**: Agent is allowd to execute `git add`, and write commit message; but NOT ALLOW TO **git commit**; send request to user for commiting, and user will make code checking.

Commits should follow the format: `<emoji> <prefix> <short message>`

**Emoji Guide**:
- ✨ `:sparkles:` - feat: 引入新功能
- 🐛 `:bug:` - fix: 修复 Bug
- ♻️ `:recycle:` - refactor: 代码重构 (不影响功能与 Bug)
- 📝 `:memo:` - docs: 添加/更新文档
- 🎨 `:art:` - style: 改进代码结构/格式化 (不影响逻辑)
- ⚡ `:zap:` - perf: 提高性能/优化
- ✅ `:white_check_mark:` - test: 增加/修改测试
- 📦 `:package:` - chore: 构建过程、辅助工具、依赖变更
- 👷 `:construction_worker:` - ci: CI/CD 流程、自动化脚本修改
- 🚧 `:construction:` - wip: 正在进行中的工作 (WIP)
- 🚚 `:truck:` - move: 移动文件、重命名
- 🔥 `:fire:` - delete: 移除代码或文件
- ⏪ `:rewind:` - revert: 版本回滚
- 🔀 `:twisted_rightwards_arrows:` - merge: 分支合并

**Optional Emojis** (use when necessary):
- 🔧 `:wrench:` - config: 修改配置文件
- 🔖 `:bookmark:` - tag: 发布版本/打标签

**Example commits**:
```
✨ feat(chat): Add tree-based chat model
♻️ refactor(session): Remove adapter layer for direct TreeModel integration
🐛 fix(type): Resolve type mismatch in message payload
📝 docs(spec): Update OpenSpec change proposal
```
<!-- GIT:END -->

<!-- DEV-LOGS:BEGIN -->

If the Agent needs to write a markdown document as a log file,
place it in `/dev-logs/<yymmdd>-<title>.md`.

The User/Agent will read these logs and, after the project concludes, decide whether to delete them or move them to `/dev-logs/archive`.

<!-- DEV-LOGS:END -->

