# Project Specifications

此目录存放 **项目级技术规范** 的持久性文档。


## 项目规范文档

<!-- 以下内容仅为示例，实际规范类型由项目需求决定
| 类型 | 示例 | 用途 |
|------|------|------|
| 架构设计 | `architecture.md` | 系统架构、模块划分 |
| 开发规范 | `coding-standards.md` | 命名、代码风格 |
| API 规格 | `api/` | 接口定义、数据格式 |
| 技术决策 | `adr/` | Architecture Decision Records |
| 数据模型 | `data-model.md` | Schema、实体关系 |
-->

## SPEC DOC 规范

请参考 write-spec-doc SKILL.

## 文件规范

### 单文件规范

```markdown
---
name: API 规格
description: 定义所有 REST API 的请求/响应格式
updated: 2026-01-27
---

（正文内容）
```

**必需字段**：
- `name`: 规范名称
- `description`: 一句话描述
- `updated`: 最后更新日期

### 多文件规范（目录）

当规范内容较多时，使用目录组织：

```
spec-docs/
└── api/
    ├── index.md        # 入口，包含 frontmatter
    ├── authentication.md
    ├── users.md
    └── orders.md
```

**index.md 结构**：
```markdown
---
name: API 规格
description: 完整的 REST API 文档
updated: 2026-01-27
files:
  - authentication.md
  - users.md
  - orders.md
---

本目录包含完整的 API 文档。

- [认证](authentication.md)
- [用户](users.md)
- [订单](orders.md)

（正文内容）
```

## Agent 指南

- 实现新功能前，检查此目录是否有相关规范
- 需要项目级决策时，建议创建规范文档
- 更新规范时，**务必更新 frontmatter 的 updated 字段**
