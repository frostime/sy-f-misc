---
name: 只读规则（read-rule）
description: 工具组规则文档的声明、索引、按需读取与权限边界；不涉及变量系统
updated: 2026-10-30
scope:
  - /src/func/gpt/tools/read-rule.ts
  - /src/func/gpt/tools/executor.ts
  - /src/func/gpt/tools/types.ts
deprecated: false
---

# 只读规则（read-rule）

规则文档是**工具自带的静态说明**，不是会话状态。它们直接来自 `ToolGroup.declareSkillRules`，由 `ToolExecutor` 在生成 system prompt 时渲染索引，由内部工具 `read-rule` 按需返回正文。

当前没有变量系统、没有 `ReadVar` 别名、没有会话级“已加载规则”标志或规则缓存。需要读规则就再调用一次 `read-rule`，结果作为普通 `role:'tool'` 消息进入当前回答版本。

---

## 声明（`types.ts`）

```typescript
ToolGroup.declareSkillRules = {
    '<ruleName>': {
        desc: string;          // 索引表格中的一行描述
        prompt: string;        // 完整正文（Markdown）
        when?: string;         // 何时读取，缺省为 'As needed'
        alwaysLoad?: boolean;  // true → 正文内联进 system prompt
    }
}
```

完整标识由 `formatRuleName(groupName, ruleName)`（`tools/read-rule.ts`）拼成 `Rule/<groupName>/<ruleName>`。规则名中的 group 段就是 `ToolGroup.name` 的原文，不做 slug 化。

正文应写模型猜不到的领域约定、枚举、自定义语法；工具的参数与模式写在工具 schema 里，不要重复成教程。

---

## 索引生成（`executor.ts` → `generateSkillRuleIndex()`）

对每个**已启用且至少有一个启用工具**的工具组，`toolRules()` 拼接：

1. `rulePrompt`（字符串或接收已启用工具名的函数）——可以为空；
2. 该组的规则索引。

`rulePrompt` 为空、只有 `declareSkillRules` 时，组仍会输出 `<tool-group-rule>` 块，但只含规则索引。因此“只有规则没有提示词”的组不需要额外占位文本。

索引渲染规则：

- `alwaysLoad: true` → 标题 + 正文**内联**，模型无需读取；
- 其余 → Markdown 表格 `| Rule | Description | When to Use |`，每行给出 `Rule/<group>/<ruleName>`，表尾提示 `read-rule({"name": "<Rule>"})`。

---

## 工具定义注入（`getEnabledToolDefinitions()`）

`read-rule` 在 `ToolExecutor` 构造时注册为**内部辅助工具**，不属于任何业务工具组，也不出现在工具组管理列表中。它的定义只在满足下面全部条件时加入本次请求的工具列表：

```
存在已启用工具组 G，且：
  G 有至少一个已启用工具
  且 G 的 declareSkillRules 中至少有一条 rule.alwaysLoad 为假
```

全部规则都是 `alwaysLoad` 时不需要 `read-rule`。反之，只要有一个已启用、含启用工具且声明了按需规则的组，就会注入 `read-rule` 定义。

---

## 读取（`read-rule.ts`）

| 方面 | 行为 |
|------|------|
| 参数 | `name`：完整标识，如 `Rule/siyuan-tools/sql-blocks-table` |
| 查找范围 | `groupRegistry` 中**所有已注册组**，包括未启用的组 |
| 命中 | `SUCCESS`，`data` 为规则正文 |
| 未命中 | `NOT_FOUND`，`error: Rule not found: <name>` |
| 空/非字符串参数 | `ERROR: Rule name must be a non-empty string.` |
| 权限 | `executionPolicy: 'auto'`，`resultApprovalPolicy: 'never'`：读取静态文档不弹审批 |
| 截断 | `SKIP_EXTERNAL_TRUNCATE: true`，正文完整返回，不受 `limit` 影响 |

“未启用组也可读”与现有执行语义一致：`ToolExecutor.execute()` 同样按名称在 `registry` 中查找，不校验组/工具的启用状态；启用状态只决定哪些定义提供给模型。因此规则索引未列出的旧标识，模型只要知道名字也能读到。

`read-rule` 的正文是插件内的静态字符串，不读文件、不读历史工具结果、不写任何状态。

---

## 与历史数据的关系

- 此前运行期由变量系统提供的 `Rule/...` 已随该系统一起移除，无持久化数据需要迁移；正文仍在 `declareSkillRules` 中，可用同一 `Rule/<group>/<ruleName>` 标识通过 `read-rule` 获取（前提是该组仍注册且仍声明该规则）。
- 规则标识沿用原有命名，没有提供 `ReadVar` 读取规则的兼容别名。
- `read-rule` 的结果随回答版本一起持久化，切分支后可见内容由既有消息回放决定（见 [integration.md](./integration.md)），不重新执行历史工具。
