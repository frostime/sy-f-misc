---
title: 工具执行报错时直接绕过结果审批机制（on-error / always）
status: not-planned
created: 2026-10-31
baseline: bf704fb
---

## 当前状态

not-planned。本轮不处理结果审批功能。协议请求错误状态的传递仍在协议适配器与工具链内处理。

## 涉及模块与问题概述

本缺陷存在于工具执行器 `ToolExecutor`（路径：`src/func/gpt/tools/executor.ts`）的结果审批流程中。

系统支持对工具的执行结果设置审批策略（`resultApprovalPolicy`）：
- `never`：直接将结果发给模型，无需审批；
- `on-error`：只有工具报错时才弹窗审批；
- `always`：无论成功还是失败，结果发给模型前都必须由用户确认。

**问题在于**：当工具执行出错（返回 `status: 'ERROR'`）或抛出异常时，错误信息完全绕过了结果审批逻辑，未弹出任何确认界面，直接发给了外部大模型。

---

## 缺陷表现与安全影响

- 用户可能允许工具自动执行（`executionPolicy: auto`），但出于安全或隐私考虑，配置了 `resultApprovalPolicy: always`（或 `on-error`），希望拦截报错内容——比如命令行工具报错可能暴露敏感路径、内部堆栈或系统环境信息。
- 当前实现下，只要工具报错，这些未经验证的错误信息就会直接进入发往模型的提示词（Tool Message）中，导致预期的结果审批完全形同虚设。

---

## 原因定位

在 `src/func/gpt/tools/executor.ts` 的 `ToolExecutor.execute()` 方法中：

1. **非 SUCCESS 状态提前 return**：
   在工具执行完毕后，代码先检查状态是否为 SUCCESS。如果是 ERROR：
   ```ts
   result.finalText = result.error || 'Tool execution failed';
   return result; // <--- 提前返回，跳过了后续逻辑
   ```
   而审批检查函数 `checkResultApproval()` 的调用被放在了后面（成功数据的格式化之后），因此错误结果根本没有机会进入审批分支。
2. **异常捕获分支遗漏审批**：
   `try ... catch` 捕获到工具执行异常时，也是直接构建错误对象并返回，没有接入 `checkResultApproval()`。

---

## 最小复现

注册测试工具，设置策略为 `executionPolicy: auto, resultApprovalPolicy: always`，工具返回：
`status: 'ERROR', error: 'TEST_PRIVATE_ERROR'`

运行结果：
- 结果审批回调被调用次数：`0`（未触发审批）。
- 最终发给模型的 `finalText`：包含 `'TEST_PRIVATE_ERROR'`。

---

## 期望行为

无论工具是正常返回还是抛出异常，都应严格遵循结果审批策略：

| 有效结果策略 | 成功返回 | 错误返回 / 抛出异常 |
|---|---|---|
| `never` | 直接发送给模型 | 直接发送给模型 |
| `on-error` | 直接发送给模型 | **先弹窗审批，用户同意后才发送** |
| `always` | **先弹窗审批** | **先弹窗审批，用户同意后才发送** |

当用户在审批弹窗中点击“拒绝”时：
- 模型收到的 Tool Message 应替换为拒发说明（如“用户已拒绝发送该工具结果”），严禁携带原本的错误详情。

---

## 关键代码入口

- `src/func/gpt/tools/executor.ts`：`ToolExecutor.execute()`、`checkResultApproval()`。
- `src/func/gpt/tools/toolchain.ts`：处理审批被拒绝时的 Tool Message 组装分支。
- `src/func/gpt/tools/approval-ui.tsx`：审批弹窗与确认交互。
