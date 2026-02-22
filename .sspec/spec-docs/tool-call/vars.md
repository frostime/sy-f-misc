---
name: 变量系统与 Skill Rules
description: VariableSystem 容量队列、变量类型、$VAR_REF 语法、Skill Rules 机制
updated: 2026-02-22
scope:
  - /src/func/gpt/tools/vars/core.ts
  - /src/func/gpt/tools/vars/manager.ts
  - /src/func/gpt/tools/vars/index.ts
  - /src/func/gpt/tools/executor.ts
deprecated: false
---

# 变量系统与 Skill Rules

---

## VariableSystem（`vars/core.ts`）

### 数据结构

```typescript
interface Variable {
    name: string;
    value: string;          // 始终为字符串
    desc?: string;
    type: VarType;          // 见下表
    tags?: string[];
    keep?: boolean;         // true → 永不淘汰
    created: Date;
    updated: Date;
    lastVisited: Date;
    referenceCount?: number;
}

type VarType = 'RULE' | 'ToolCallResult' | 'ToolCallArgs' | 'MessageCache' | 'LLMAdd' | 'USER_ADD'
```

**变量类型说明**：

| 类型 | 创建者 | 说明 |
|------|--------|------|
| `RULE` | `ToolExecutor.registerSkillRules()` | Skill 规则文档，`keep=true` 不被淘汰 |
| `ToolCallResult` | `ToolExecutor.execute()` | 工具调用结果缓存 |
| `ToolCallArgs` | `ToolExecutor.execute()` | 工具调用参数缓存 |
| `MessageCache` | 消息系统 | 消息内容缓存 |
| `LLMAdd` | LLM/WriteVar 工具 | LLM 主动写入的变量 |
| `USER_ADD` | 用户/WriteVar 工具 | 用户主动写入的变量 |

### 容量管理

- `capacity = 1000`（默认）
- 超容时按 `lastVisited → updated → created → name` 顺序淘汰，**`keep=true` 的 RULE 变量不淘汰**
- 读取变量时更新 `lastVisited`（LRU 行为）

### 核心 API

```typescript
class VariableSystem {
    addVariable(name, value, type, desc?, tags?): void
    updateVariable(name, {value?, type?, desc?, tags?, keep?}): void
    getVariable(name): Variable | undefined
    listVariables(filter?: {type?, tag?, search?}): Variable[]
    removeVariables(names: string[]): void
}
```

---

## 变量工具（`vars/index.ts`）

以下工具**始终注入**到 `getEnabledToolDefinitions()` 的返回结果（只要有任何工具启用）：

| 工具名 | 参数 | 返回 |
|--------|------|------|
| `ReadVar` | `name, start?, length?` | 指定变量内容（支持分块读取） |
| `ListVars` | `filter?: {type?, tag?, search?}` | 所有变量元信息（名称、长度、描述、类型、tags） |

以下工具在 `vars` 工具组内，需启用才可用：

| 工具名 | 参数 | 返回 |
|--------|------|------|
| `WriteVar` | `name, value?, desc?, tags?` | 写入或更新变量 |
| `RemoveVars` | `names: string[]` | 删除变量（RULE 类型不可删） |

---

## $VAR_REF 语法（在 executor.ts 中解析）

**语法**：

```
$VAR_REF{{varName}}               # 引用完整值
$VAR_REF{{varName:start:length}}  # 切片（start 0-based，length 字符数）
```

**解析时机**：`ToolExecutor.execute()` 在调用 `tool.execute(args)` 之前，对整个 args 对象递归调用 `resolveVarReferences()`。

**递归解析规则**：
- 字符串：用 regex 替换 `$VAR_REF{{...}}`
- 数组：对每个元素独立递归（独立 `visited` Set 避免误判循环引用）
- 对象：对每个属性值独立递归

**错误情形**：
- 变量不存在 → throw `Variable '${name}' not found`
- 循环引用（A引用B，B引用A）→ throw `Circular variable reference detected`
- 对非字符串变量使用切片 → throw `Cannot slice non-string variable`

**变量值类型转换**：变量 value 始终是字符串，非字符串会在存入时被 JSON.stringify。读取后若需要结构化数据，由 LLM 自行 JSON.parse。

---

## Skill Rules 机制

### 注册流程

```
ToolGroup.declareSkillRules = {
    'RuleName': {
        desc: '一句话描述',
        prompt: '完整规则内容（Markdown）',
        when?: '何时使用',
        alwaysLoad?: false
    }
}
↓
registerToolGroup() → registerSkillRules()
   → varSystem.addVariable(
         'Rule/{groupName}/{RuleName}',
         rule.prompt,
         'RULE',
         `Skill rule for ${groupName}: ${rule.desc}`
     )
   → variable.keep = true   // 永不淘汰
```

### 内置 Skill Rules（ToolExecutor 构造时注册）

`AgentSkillRules`（scope: 'Agent'）：

| 规则名 | 变量名 | 描述 |
|--------|--------|------|
| `VarRef` | `Rule/Agent/VarRef` | $VAR_REF 完整用法文档 |
| `TODO` | `Rule/Agent/TODO` | 用变量系统构建 TODO 列表 |

### 在 systemPrompt 中的呈现

`generateSkillRuleIndex(groupName, rules)` 生成：

- `alwaysLoad: true` → 直接将 `rule.prompt` 内嵌到 systemPrompt
- `alwaysLoad: false`（默认）→ 生成表格：

```markdown
**On-Demand Documentation (Stored as Variables):**
| Var | Description | When to Use |
|-----|-------------|-------------|
| `Rule/groupName/RuleName` | desc | when |

*Access via: ReadVar({"name": "<VarName>"})*
```

LLM 需要某规则时，调用 `ReadVar({name: "Rule/Agent/VarRef"})` 获取完整文档。

---

## 变量命名规范

| 场景 | 命名格式 |
|------|---------|
| 工具调用结果 | `{toolName}_{nodeId}_result` |
| 工具调用参数 | `{toolName}_{nodeId}_args` |
| Skill Rule | `Rule/{groupName}/{ruleName}` |
| LLM/用户写入 | 任意（由 WriteVar 工具指定） |
| TODO 系统 | `TODO_{index}_{brief}` |
