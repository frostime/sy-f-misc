---
title: .dev/docs 路由
description: 按任务路由到开发文档：改哪个区域前应先读哪份
updated: 2026-10-31
---

# 开发文档路由

顶层目录下的文档是**跨模块**知识（架构地图、共享合同、系统级红线）；单模块内部约束放最近的 `<module>.SPEC.md` 或代码注释，不写进这里。工具子系统有自己的导航：[tool-call/index.md](./tool-call/index.md)。

## 按任务路由

| 任务 / 问题 | 先读 |
|---|---|
| 理解 GPT 模块全貌：入口、配置系统、模型生命周期、会话生命周期 | [gpt-module-architecture-overview.md](./gpt-module-architecture-overview.md) |
| 改 GPT 跨文件链路（参数合并、上下文构建、协议分发、迁移），或被拼写/命名坑过 | [gpt-chat-module-cross-file-architecture.md](./gpt-chat-module-cross-file-architecture.md) — 与 overview 是分层关系，链路细节以本文为准 |
| 碰 GPT 工具调用：executor、toolchain、审批、read-rule、自定义脚本 | [tool-call/index.md](./tool-call/index.md)（进入后再按其导航分流） |
| 碰 GPT 聊天历史存储：localStorage、gpt-cache/、JSON 归档、导出 | [gpt-chat-history-persistence.md](./gpt-chat-history-persistence.md) |
| 新增/修改 src/func/ 功能模块：IFuncModule 声明、设置面板、持久化接线 | [func-module-architecture.md](./func-module-architecture.md)；设置同步细节见 `src/settings/SETTINGS-LIFECYCLE.SPEC.md` |
| 把大模块拆出主 bundle / 使用 `@external` 动态导入 | [external-bundle.md](./external-bundle.md) |
| 发布或修改 Zotero Bridge（XPI、updates.json、独立 Release） | [zotero-bridge-development.md](./zotero-bridge-development.md)；行为合同在 `src/func/zotero/SPEC.md` |
| 需要思源平台的 DOM/CSS 变量、类名约定 | [siyuan-dom-reference.md](./siyuan-dom-reference.md)（上游变量值以主题文件为准） |

## 存放规则

- 想写到 `src/**` 目录里的自由 `.md` → 只允许 `<module>/<module>.SPEC.md`，其余进本目录。
- 过时但保留参考的文档放 [archive/](./archive/)，frontmatter 里写 `deprecated: true` 与替代路径。
- 文档与代码冲突时：代码描述过时 → 更新文档；代码违反文档约束 → 停下来向用户报告，不要静默改约束。
