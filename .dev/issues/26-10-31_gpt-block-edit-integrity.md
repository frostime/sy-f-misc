---
title: applyBlockDiff：同块多项编辑被静默覆盖，且执行部分失败时丢失明细
status: open
created: 2026-10-31
baseline: bf704fb
---

## 涉及模块与问题概述

本缺陷存在于插件内置的批量块编辑工具 `applyBlockDiff`（路径：`src/func/gpt/tools/siyuan/diff-edit/`）。

当模型使用该工具批量修改思源笔记时，存在两个严重影响编辑完整性的问题：
1. **静默丢操作**：对同一个块提交多项编辑时，前面的编辑会被后面的覆盖，没有报错却漏改内容。
2. **明细被吞**：批量操作部分成功、部分失败时，模型只收到一句通用的 `Tool execution failed`，看不到哪些块已经写入成功，容易引发重复写入。

---

## 缺陷 1：同一 blockId 的多项编辑被静默覆盖

### 表现与后果
当模型在一次工具调用中对同一个块提交多项编辑（例如对同一个块连续追加两个段落 `INSERT_AFTER`）时，校验直接通过，但在执行阶段只有最后一项操作生效，前置操作全部静默丢失。

### 原因定位
在 `src/func/gpt/tools/siyuan/diff-edit/core.ts` 的 `validateAllHunks()` 中：
- 代码使用 `Map<string, Edit>` 收集待执行的编辑项，以 `blockId` 作为 Key。
- 当同一个 `blockId` 出现多次时，后一次 `map.set()` 直接覆盖了前一次。系统既没有将重复目标判定为冲突拒绝，也没有保留全部编辑。

### 最小复现
输入两个指向同一有效块的 `INSERT_AFTER` 编辑及其对应 hunks：
- 校验结果：`valid: true`（校验通过）
- 最终待执行列表：只剩第 2 个编辑项，第 1 个被丢弃。

---

## 缺陷 2：部分成功时，模型收不到操作明细

### 表现与后果
当提交的编辑在执行阶段有一部分成功、一部分失败时，模型收到的反馈不是逐项明细，而是一句笼统的 `Tool execution failed`。

模型和用户会误以为“整批操作都没执行”，如果模型据此重新发起整批编辑，会导致已经成功的插入或追加被二次写入，造成笔记内容重复。

### 原因定位
1. **工具层**（`src/func/gpt/tools/siyuan/diff-edit/index.ts`）：
   部分失败时，工具返回 `status: 'ERROR'`，具体每一步的成功/失败记录存在 `data.operations` 里，但没有生成详细的 `error` 文本。
2. **执行器层**（`src/func/gpt/tools/executor.ts`）：
   `ToolExecutor.execute()` 处理非 `SUCCESS` 状态时，直接走兜底逻辑生成给模型的文本：
   `finalText = result.error || 'Tool execution failed'`
   由于没有把 `data.operations` 格式化进去，已成功的操作细节完全被抹去。

---

## 期望行为

1. **对于同一块的多项编辑**：
   校验阶段若不支持同块多次编辑，应明确报错并拒绝执行，做到“要么都按预期改，要么全不写入”，不能静默丢操作；若支持，需有明确的顺序与合并定义。
2. **对于部分失败的场景**：
   返回给模型的工具文本必须包含清晰的逐项明细（每个操作的目标块 ID、成功与否、产生的新块 ID、具体失败原因），让模型明确知道哪些已经写入，避免盲目重试。

---

## 关键代码入口

- `src/func/gpt/tools/siyuan/diff-edit/core.ts`：`validateAllHunks` 的目标收集逻辑与 `executeEdits` 循环。
- `src/func/gpt/tools/siyuan/diff-edit/index.ts`：批量执行的结果汇总。
- `src/func/gpt/tools/executor.ts`：`ToolExecutor.execute()` 中非 SUCCESS 结果的 `finalText` 组装。
