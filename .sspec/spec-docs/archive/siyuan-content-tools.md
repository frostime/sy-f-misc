---
name: siyuan-content-tools
description: 思源笔记内容获取和编辑工具系统架构说明
updated: 2026-05-04
scope:
  - /src/func/gpt/tools/siyuan/content-tools.ts
  - /src/func/gpt/tools/siyuan/diff-edit/**
deprecated: true
replacement: "设计决策已下沉到代码注释；跨文件架构见 diff-edit/index.ts 头部注释"
---

> ⚠️ **DEPRECATED**: 本 spec-doc 已废弃。

**废弃原因**：原文档 29.9K 中 90% 内容重复代码本身（完整 TypeScript 实现、参数定义、输出格式），违反 spec-doc 定义（"code alone cannot adequately convey"）。

**替代方案**：
- 6 个设计决策的 "why" 已下沉到对应代码文件的注释中
- diff-edit 跨文件架构（3 层流水线）说明在 `diff-edit/index.ts` 头部
- 单文件自包含的工具（getBlockInfo / getBlockContent / appendContent / createNewDoc）直接阅读源码即可理解

**原覆盖范围**：
- `getBlockInfo` — 块元信息查询
- `getBlockContent` — 块内容获取（含 slice 切片机制）
- `appendContent` — 内容追加
- `createNewDoc` — 文档创建
- `applyBlockDiff` — SEARCH/REPLACE 编辑（跨 4 文件：validator → parser → core → index）
