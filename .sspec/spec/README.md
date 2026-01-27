# Project Specifications

此目录存放 **项目级技术规范**——与单个 change 无关的持久性文档。

> 以下内容仅为示例，实际规范类型由项目需求决定。

## 常见规范类型（示例）

| 类型 | 示例 | 用途 |
|------|------|------|
| 架构设计 | `architecture.md` | 系统架构、模块划分 |
| 开发规范 | `coding-standards.md` | 命名、代码风格 |
| API 规格 | `api/` | 接口定义、数据格式 |
| 技术决策 | `adr/` | Architecture Decision Records |
| 数据模型 | `data-model.md` | Schema、实体关系 |

## 文件规范

### 单文件规范

```markdown
---
name: API 规格
description: 定义所有 REST API 的请求/响应格式
updated: 2026-01-27
---

# API 规格

（正文内容）
```

**必需字段**：
- `name`: 规范名称
- `description`: 一句话描述
- `updated`: 最后更新日期

### 多文件规范（目录）

当规范内容较多时，使用目录组织：

```
spec/
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

# API 规格

本目录包含完整的 API 文档。

## 目录

- [认证](authentication.md)
- [用户](users.md)
- [订单](orders.md)
```

## 与 change/spec.md 的区别

| | change/spec.md | spec/ |
|---|----------------|-------|
| 范围 | 单次变更 | 整个项目 |
| 生命周期 | 临时（归档后移除） | 持久（持续演进） |
| 内容 | 问题、方案、任务 | 规范、标准、设计 |

## CLI 命令

```shell
sspec spec list              # 列出所有规范
sspec spec new <name>        # 创建新规范
sspec spec new <name> --dir  # 创建目录型规范
```

## Agent 指南

- 实现新功能前，检查此目录是否有相关规范
- 需要项目级决策时，建议创建规范文档
- 更新规范时，**务必更新 frontmatter 的 updated 字段**
