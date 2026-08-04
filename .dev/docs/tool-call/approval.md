---
name: 权限模型与审批系统
description: ExecutionPolicy / ResultApprovalPolicy 权限模型、ApprovalUIAdapter 两种审批 UI
updated: 2026-02-22
scope:
  - /src/func/gpt/tools/types.ts
  - /src/func/gpt/tools/executor.ts
  - /src/func/gpt/tools/approval-ui.tsx
deprecated: false
---

# 权限模型与审批系统

---

## 权限模型

### 当前版本：ToolPermissionV2（`types.ts`）

```typescript
type ToolPermissionV2 = {
    executionPolicy?:    ExecutionPolicy;      // 执行前行为
    resultApprovalPolicy?: ResultApprovalPolicy; // 结果行为
};

type ExecutionPolicy =
    | 'auto'        // 自动批准，不询问
    | 'ask-once'    // 首次询问，记住决策（基于 toolName + args hash）
    | 'ask-always'; // 每次都询问

type ResultApprovalPolicy =
    | 'never'     // 不审批（默认）
    | 'on-error'  // 仅执行出错时审批
    | 'always';   // 总是审批
```

**定义 Tool 时写法（推荐）**：

```typescript
const myTool: Tool = {
    definition: { ... },
    permission: {
        executionPolicy: 'ask-always',  // 高危操作
        resultApprovalPolicy: 'never',
    },
    execute: async (args) => { ... }
};
```

### 旧版本向后兼容（`ToolPermission`，已废弃）

```typescript
// 旧格式映射关系
permissionLevel: 'public'    → executionPolicy: 'auto'
permissionLevel: 'moderate'  → executionPolicy: 'ask-once'
permissionLevel: 'sensitive' → executionPolicy: 'ask-always'
requireExecutionApproval: false → executionPolicy: 'auto'
requireResultApproval: true  → resultApprovalPolicy: 'always'
```

转换逻辑在 `executor.ts:getEffectivePermissionConfig()` 中实现。

### 用户覆盖机制

`toolsManager().toolPermissionOverrides[toolName]` 可在运行时覆盖工具的权限配置。
优先级：`override > tool.permission`（`getEffectivePermissionConfig()` 中按此顺序检查）。

---

## executor 中的审批检查

### checkExecutionApproval()（私有方法）

```
policy = getEffectivePermissionConfig(name).executionPolicy

'auto'     → 直接 { approved: true }
'ask-once' → generateApprovalKey(name, args) 检查 approvalRecords
             命中 → 返回缓存记录
             未命中 → 调用 executionApprovalCallback()，记录到 approvalRecords
'ask-always' → 每次调用 executionApprovalCallback()
```

`generateApprovalKey(name, args)`：argsJSON ≤ 100 字符直接拼接；否则 hash 缩短（32bit 整数 → base36）。

### checkResultApproval()（私有方法）

```
policy = getEffectivePermissionConfig(name).resultApprovalPolicy

'never'    → { approved: true }
'on-error' → SUCCESS → { approved: true }；ERROR → 调用 resultApprovalCallback()
'always'   → 调用 resultApprovalCallback()
```

---

## ApprovalUIAdapter 接口（`types.ts`）

```typescript
interface ApprovalUIAdapter {
    showToolExecutionApproval(
        toolName: string,
        toolDescription: string,
        args: Record<string, any>,
        toolDefinition?: IToolDefinition & ToolPermission
    ): Promise<{ approved: boolean; persistDecision?: boolean; rejectReason?: string }>;

    showToolResultApproval(
        toolName: string,
        args: Record<string, any>,
        result: ToolExecuteResult
    ): Promise<{ approved: boolean; rejectReason?: string }>;
}
```

---

## 两种 ApprovalUIAdapter 实现（`approval-ui.tsx`）

### DefaultUIAdapter

弹出 SiYuan `solidDialog` 对话框，阻塞等待用户点击批准/拒绝。
用于**非 Chat 场景**或回退场景。

特性：
- 展示工具名、描述、参数列表
- 安全审查模式（`toolCallSafetyReview()`）：高危工具会额外展示警告
- 可选"记住本次选择"复选框（对应 `persistDecision`）

### InlineApprovalAdapter

**用于 ChatSession**（`use-chat-session.ts`）的内联审批模式。

核心机制：**Promise + 外部 resolve**

```typescript
class InlineApprovalAdapter {
    constructor(
        private pendingApprovals: IStoreRef<PendingApproval[]>,
        private newID: () => string
    ) {}

    showToolExecutionApproval(name, desc, args, def): Promise<Decision> {
        return new Promise(resolve => {
            const item: PendingApproval = {
                id: newID(),
                type: 'execution',
                toolName: name,
                args, ...
                resolve  // ← 保存 resolve 引用
            };
            pendingApprovals.update(arr => [...arr, item]);
            // 函数返回；UI 将渲染 pendingApprovals 列表
            // 用户点击批准/拒绝 → UI 调用 item.resolve({approved, rejectReason})
        });
    }
}
```

**PendingApproval 结构**（`types.ts`）：

```typescript
interface PendingApproval {
    id: string;
    type: 'execution' | 'result';
    toolName: string;
    toolDescription?: string;
    toolDefinition?: IToolDefinition & ToolPermission;
    args: Record<string, any>;
    result?: ToolExecuteResult;   // type='result' 时存在
    createdAt: number;
    resolve: (decision: { approved: boolean; rejectReason?: string }) => void;
}
```

ChatSession UI 监听 `pendingApprovals`，当有待审批项时渲染审批卡片；用户操作后调用 `item.resolve()` 解除阻塞，执行继续进行。

---

## 数据流汇总

```
ToolExecutor.execute()
  ├── checkExecutionApproval() → executionApprovalCallback()
  │     └── ApprovalUIAdapter.showToolExecutionApproval()
  │           ├── [DefaultUIAdapter] solidDialog → 阻塞弹窗
  │           └── [InlineApprovalAdapter] 推入 pendingApprovals → 等待 UI resolve
  │
  └── checkResultApproval() → resultApprovalCallback()
        └── ApprovalUIAdapter.showToolResultApproval()
              同上两种实现
```
