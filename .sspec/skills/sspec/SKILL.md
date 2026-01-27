---
skill: sspec
version: 2.1.0
description: |
  SSPEC 工作流深度参考：文档编写指南、状态规则、边缘案例。
  当 AGENTS.md 的快速参考不够用时查阅——特别是编写高质量 spec/tasks/handover，
  或处理状态歧义、阻塞场景时。
---

# SSPEC Skill

**何时查阅此 SKILL**：
- 不确定 spec.md / tasks.md / handover.md 该怎么写
- 状态转换有歧义（如"部分阻塞"）
- 处理 AGENTS.md 未覆盖的异常情况

日常工作流用 AGENTS.md 足够。此 SKILL 是深度参考。

---

## 文档编写指南

### spec.md — 规格说明书

**核心原则**：写给下一个 Agent（或未来的自己），让 TA 能 **快速理解问题和方案**。

#### Section A: Problem Statement（问题陈述）

回答：**为什么要做这件事？**

```markdown
## A. Proposal and Problem Statement

### Current Situation
<!-- 现状：描述当前的痛点或不足 -->
用户反馈认证流程太慢，平均耗时 5 秒，导致转化率下降 12%。

### User Request / Requirement
<!-- 需求：用户希望达成什么？ -->
将认证时间降至 <1 秒，提升用户体验。
```

**质量标准**：
- ✅ 包含可量化的问题描述
- ✅ 说明为什么现在要解决
- ❌ 避免："需要重构一下"（没有 why）

#### Section B: Proposed Solution（方案设计）

回答：**怎么解决？为什么选这个方案？**

```markdown
## B. Proposed Solution

### Framework of Idea
<!-- 核心思路 -->
采用 JWT + Redis 缓存方案，将 token 验证从 DB 查询改为内存查询。

### Key Changes
<!-- 关键变更 -->
1. 引入 Redis 作为 session 缓存
2. 修改 auth middleware 使用缓存优先策略
3. 添加 token 刷新机制防止频繁重新登录
```

**质量标准**：
- ✅ 说明方案的核心思路
- ✅ 列出关键的设计决策
- ❌ 避免：直接跳到实现细节

#### Section C: Implementation Strategy（实施策略）

**关键要求**：细化到 **文件级别**。

```markdown
## C. Implementation Strategy

### Phase 1: 基础设施
- `src/cache/redis.py` — 新建，Redis 连接池
- `src/config/settings.py` — 修改，添加 Redis 配置项
- `requirements.txt` — 修改，添加 redis 依赖

### Phase 2: 认证逻辑
- `src/auth/middleware.py` — 修改，缓存优先验证
- `src/auth/jwt.py` — 修改，token 刷新逻辑
- `tests/test_auth.py` — 修改，增加缓存测试

### Risk & Dependencies
- 需要 DevOps 配置 Redis 实例（外部依赖）
- 需处理缓存失效时的降级策略
```

**质量标准**：
- ✅ 列出要新建/修改的文件
- ✅ 每个文件说明变更内容
- ✅ 标注外部依赖和风险
- ❌ 避免："修改相关文件"（不具体）

#### Section D: Blockers & Feedback

记录阻塞项和用户反馈：

```markdown
## D. Blockers & Feedback

### Blocker (2026-01-27)
**阻塞**：等待 DevOps 提供 Redis 连接信息
**影响**：无法进行集成测试
**需要**：Redis host, port, password

### Feedback (2026-01-28)
用户反馈：token 刷新频率太高，改为每 5 分钟一次
```

---

### tasks.md — 任务清单

**核心原则**：每个任务 **可独立执行、可验证、<2小时完成**。

#### 任务粒度

```markdown
# 粒度对比

❌ 太大：
- [ ] 实现认证系统

✅ 合适：
- [ ] 创建 Redis 连接池 `src/cache/redis.py`
      验证：单元测试通过，能连接本地 Redis
- [ ] 修改 auth middleware 使用缓存
      验证：请求响应时间 <100ms
```

#### 任务组织

按 **实现阶段** 组织，每个阶段有明确验证点：

```markdown
### Phase 1: Infrastructure ✅

- [x] 添加 redis 依赖到 requirements.txt
- [x] 创建 `src/cache/redis.py` 连接池

**验证**：`pytest tests/test_cache.py` 通过

### Phase 2: Auth Logic 🚧

- [x] 修改 `src/auth/middleware.py` 缓存优先
- [ ] 添加 token 刷新逻辑
- [ ] 处理缓存失效降级

**验证**：认证响应时间 <100ms
```

#### 进度追踪

```markdown
## Progress Tracking

**Overall**: 60% (3/5 tasks)

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: Infrastructure | 100% | ✅ Done |
| Phase 2: Auth Logic | 33% | 🚧 In Progress |

**Recent Updates**:
- 2026-01-27: Phase 1 完成，Redis 连接池可用
- 2026-01-28: middleware 修改完成，待 token 刷新
```

---

### handover.md — 交接文档

**核心原则**：30 秒内让下一个 Agent 进入工作状态。

#### 必备内容

```markdown
## Session 2 - 2026-01-28 14:30

### Background
实现 JWT + Redis 认证缓存（change: auth-speedup）。
目标：认证响应 <1秒。

### Accomplished
- ✅ Phase 1 完成：Redis 连接池可用
- ✅ middleware 修改完成，缓存优先策略生效
- 🧪 本地测试：响应时间从 5s → 80ms

### Current Status
**DOING** — 60% complete (3/5 tasks)

### Next Steps
1. **立即**：实现 token 刷新 `src/auth/jwt.py:refresh_token()`
2. **之后**：添加缓存失效降级逻辑
3. **最后**：集成测试（需 DevOps 配置 Redis）

### Conventions
- Redis key 格式：`auth:session:{user_id}`
- Token 过期时间：access=15min, refresh=7d
- 错误码：AUTH_001=invalid, AUTH_002=expired
```

#### 质量对比

| 维度 | ❌ 差 | ✅ 好 |
|------|-------|-------|
| 背景 | "做认证" | "JWT+Redis 缓存，目标 <1s 响应" |
| 进度 | "做了些东西" | "Phase 1 完成，60% 进度" |
| 下一步 | "继续做" | "实现 jwt.py:refresh_token()" |
| 约定 | 无 | key 格式、过期时间、错误码 |

---

## spec/ 目录

`.sspec/spec/` 用于存放 **项目级技术规范**，与单个 change 无关的长期文档。

### 适合放入的内容

| 类型 | 示例 |
|------|------|
| 架构设计 | `architecture.md` — 系统架构、模块划分 |
| 开发规范 | `coding-standards.md` — 命名规范、代码风格 |
| API 规格 | `api-spec.md` — 接口定义、数据格式 |
| 技术决策 | `adr/` — Architecture Decision Records |
| 部署流程 | `deployment.md` — CI/CD、环境配置 |

### 与 change 的区别

- **change/spec.md**：单次变更的问题和方案（临时）
- **spec/**：项目级规范和设计（持久）

### 引用方式

在 change 的 spec.md 中引用：

```markdown
## B. Proposed Solution

遵循 [API 规格](../../spec/api-spec.md) 中定义的认证接口格式。
```

---

## Change 附属文件

除了核心三件套（spec.md, tasks.md, handover.md），change 目录下可以存放辅助文件：

### 目录结构

```
.sspec/changes/<name>/
├── spec.md           # 必需：规格说明
├── tasks.md          # 必需：任务清单
├── handover.md       # 必需：会话交接
├── reference/        # 可选：参考资料
│   ├── design.md     # 详细设计文档
│   ├── api-draft.md  # API 草案
│   └── research.md   # 调研笔记
└── scripts/          # 可选：辅助脚本
    ├── migrate.py    # 迁移脚本
    └── test-data.sql # 测试数据
```

### 使用场景

| 目录 | 用途 | 示例 |
|------|------|------|
| `reference/` | 详细设计、调研、草案 | 架构图、API 设计、技术选型分析 |
| `scripts/` | 一次性脚本、测试数据 | 数据迁移、环境配置、mock 数据 |

### 在 spec.md 中引用

```markdown
## B. Proposed Solution

详细设计见 [design.md](reference/design.md)。

### Key Changes
1. 数据迁移使用 [migrate.py](scripts/migrate.py)
```

### 归档行为

当执行 `sspec change archive <name>` 时，整个 change 目录（包括 reference/ 和 scripts/）一起归档。

---

## 状态规则速查

### 状态定义

| Status | 含义 | 进入条件 | 退出条件 |
|--------|------|----------|----------|
| **PLANNING** | 定义范围和方案 | 新建 change / 重大转向 | 用户批准计划 |
| **DOING** | 实施中 | 计划批准 / 阻塞解除 | 任务完成 / 遇阻 / 转向 |
| **BLOCKED** | 等待外部 | 缺少信息/资源/审批 | 阻塞解除 / 转向 |
| **REVIEW** | 完成待验收 | 所有任务完成 | 用户接受 / 要求修改 |
| **DONE** | 完成归档 | 用户接受 | `sspec change archive` |

### 禁止的转换

| 禁止 | 原因 |
|------|------|
| PLANNING → DONE | 未实施不能完成 |
| DOING → DONE | 必须经过 REVIEW |
| BLOCKED → DONE | 阻塞未解决 |

---

## 边缘案例

### 部分阻塞

**情况**：部分任务阻塞，其他可继续。

**处理**：
1. **拆分 change**：阻塞部分独立为新 change
2. **重排任务**：非关键路径的阻塞任务移到末尾
3. **记录并继续**：在 spec.md D 节记录，用 workaround 继续

### REVIEW 跨多个会话

**情况**：用户需要几天验证。

**处理**：
- 状态保持 REVIEW
- handover 记录："等待用户验证，自 <日期>"
- 可同时处理其他 change

### 用户中途反对

**情况**：用户说"这不是我要的"。

**处理**：
1. 立即停止实施
2. 用 `@argue` 澄清范围
3. 更新 spec.md/tasks.md
4. 获得明确批准后再继续

### 多个 change 同时 DOING

**问题**：上下文切换导致错误。

**处理**：
1. 切换前先 `@handover` 当前 change
2. 用 `@change <other>` 显式切换
3. 避免同时 DOING 多个

---

## 反模式

| 反模式 | 后果 | 正确做法 |
|--------|------|----------|
| 跳过 handover | 下个会话浪费 30 分钟理解上下文 | 每次都写，即使简短 |
| 不测试就标完成 | 虚假进度，后续 bug | "完成" = 实现 + 验证 |
| spec 不写到文件级 | 实施时不知道改哪里 | Section C 列出具体文件 |
| DOING 时遇阻不转 BLOCKED | 浪费时间绕弯 | 及时转 BLOCKED 并记录 |
| DOING → DONE 跳过 REVIEW | 缺少用户验证 | 始终经过 REVIEW |
