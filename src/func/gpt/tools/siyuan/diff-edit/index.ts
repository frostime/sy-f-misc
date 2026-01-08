/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-08 17:58:38
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/index.ts
 * @LastEditTime : 2026-01-08 22:11:05
 * @Description  : applyBlockDiff Tool（严格模式）
 */

import type { BlockEdit, ValidationResult } from './types';
import {
    parseBlockDiff,
    formatEdit,
    formatValidationError
} from './parser';
import {
    validateAllHunks,
    executeEdits,
    createSiyuanAPI
} from './core';
import { Tool, ToolExecuteStatus, ToolPermissionLevel } from '@gpt/tools/types';
import { request } from '@/api';

// ============ 思源 API request 函数 ============

let _request: (url: string, data: any) => Promise<any> = request;

export const DIFF_SKILL_NAME = 'block-diff-edit';

// ============ Tool 定义 ============

export const applyBlockDiffTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'applyBlockDiff',
            description: `应用 Block Diff 编辑到思源笔记文档。

**⚠️ 严格注意**
- 所有编辑在执行前会进行强制内容匹配校验
- 任何一个 hunk 校验失败，整个 diff 都会被拒绝
- 必须先用 getBlockContent(showId=true) 获取准确的块内容

**Diff 格式**

\`\`\`diff
@@<blockId>@@
  保留不变的上下文行（空格开头）
- 要删除的行
+ 要添加的行
\`\`\`

**操作类型**

| diff 内容 | 操作 |
|-----------|------|
| 有 - 和 + | UPDATE（更新） |
| 只有 - | DELETE（删除） |
| 只有 + | INSERT_AFTER（插入） |
| @@DELETE:id@@ | 删除整个块（无需内容） |

**特殊位置**

| 语法 | 作用 |
|------|------|
| @@BEFORE:id@@ | 在块前插入 |
| @@AFTER:id@@ | 在块后插入 |
| @@PREPEND:id@@ | 在容器开头插入 |
| @@APPEND:id@@ | 在容器末尾追加 |
| @@DELETE:id@@ | 删除整个块 |

**示例**

更新内容：
\`\`\`diff
@@20260108164554-m5ar6vb@@
- Hello World
+ 你好，世界
\`\`\`

带上下文的更新：
\`\`\`diff
@@20260108164554-m5ar6vb@@
  第一行保持不变
- 要修改的第二行
+ 修改后的第二行
  第三行保持不变
\`\`\`

删除整个块：
\`\`\`diff
@@DELETE:20260108164554-m5ar6vb@@
\`\`\`

IMPORTANT: 必须先阅读 ${DIFF_SKILL_NAME} 规则才能使用此工具。
IMPORTANT: 仅追加内容请使用 appendContent/createDoc，不要使用本工具。`,
            parameters: {
                type: 'object',
                properties: {
                    diff: {
                        type: 'string',
                        description: '符合 Block Diff 格式的编辑内容'
                    },
                    dryRun: {
                        type: 'boolean',
                        description: '仅解析和校验，不执行（用于预览）。默认 false'
                    },
                    strictMatch: {
                        type: 'boolean',
                        description: '严格匹配模式（默认 true）。false 时忽略空白差异'
                    }
                },
                required: ['diff']
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    execute: async (args: {
        diff: string;
        dryRun?: boolean;
        strictMatch?: boolean;
    }) => {
        const { diff, dryRun = false, strictMatch = true } = args;

        // ========== 第一步：解析 diff ==========
        let parseResult: {
            hunks: any[];
            edits: BlockEdit[];
            warnings: string[];
        };

        try {
            parseResult = parseBlockDiff(diff);
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `❌ Diff 解析失败\n\n${error instanceof Error ? error.message : String(error)}\n\n` +
                    `请检查：\n` +
                    `1. 块 ID 格式是否正确（yyyyMMddHHmmss-xxxxxxx）\n` +
                    `2. hunk 头部格式是否为 @@blockId@@ 或 @@COMMAND:blockId@@\n` +
                    `3. 每行是否有正确的前缀（空格/+/-）`
            };
        }

        const { hunks, edits, warnings } = parseResult;

        if (edits.length === 0) {
            // 可能所有 hunk 都被跳过了
            if (warnings.length > 0) {
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        message: '没有有效的编辑操作',
                        warnings
                    }
                };
            }
            return {
                status: ToolExecuteStatus.ERROR,
                error: '未解析到有效的编辑操作，请检查 diff 格式'
            };
        }

        // ========== 第二步：强制内容校验 ==========
        const api = createSiyuanAPI(_request);
        let validationResult: ValidationResult;

        try {
            validationResult = await validateAllHunks(hunks, edits, api, strictMatch);
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `❌ 校验过程出错\n\n${error instanceof Error ? error.message : String(error)}`
            };
        }

        // 如果有校验错误，拒绝整个操作
        if (!validationResult.valid) {
            const errorMessages = validationResult.errors
                .map(e => formatValidationError(e))
                .join('\n\n');

            return {
                status: ToolExecuteStatus.ERROR,
                error: `❌ 内容校验失败，拒绝执行编辑\n\n` +
                    `共 ${validationResult.errors.length} 个错误:\n\n${errorMessages}\n\n` +
                    `请确保：\n` +
                    `1. 使用 getBlockContent(showId=true) 获取最新内容\n` +
                    `2. diff 中的 context 行和 - 行与实际内容完全一致\n` +
                    `3. 块 ID 正确且块存在`
            };
        }

        // 收集警告
        const allWarnings = [...warnings, ...validationResult.warnings];

        // ========== 第三步：干运行模式 ==========
        if (dryRun) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    message: `✅ 校验通过，以下 ${validationResult.edits.length} 个操作未执行（干运行模式）`,
                    operations: validationResult.edits.map(e => formatEdit(e)),
                    warnings: allWarnings.length > 0 ? allWarnings : undefined
                }
            };
        }

        // ========== 第四步：执行编辑 ==========
        const results = await executeEdits(validationResult.edits, api);

        // ========== 第五步：汇总结果 ==========
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        if (failCount === 0) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    message: `✅ 成功执行 ${successCount} 个操作`,
                    operations: results.map(r => ({
                        operation: formatEdit(r.edit),
                        success: r.success,
                        newBlockId: r.newBlockId
                    })),
                    warnings: allWarnings.length > 0 ? allWarnings : undefined
                }
            };
        } else if (successCount === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `❌ 全部 ${failCount} 个操作执行失败`,
                details: results.map(r => ({
                    operation: formatEdit(r.edit),
                    success: r.success,
                    error: r.error
                }))
            };
        } else {
            return {
                status: ToolExecuteStatus.ERROR,
                data: {
                    message: `⚠️ 部分成功: ${successCount} 成功, ${failCount} 失败`,
                    operations: results.map(r => ({
                        operation: formatEdit(r.edit),
                        success: r.success,
                        error: r.error,
                        newBlockId: r.newBlockId
                    })),
                    warnings: allWarnings.length > 0 ? allWarnings : undefined
                }
            };
        }
    }
};

// block-diff-edit 技能文档（严格模式）
// 替换 skill-doc.ts 中 FEATURES['block-diff-edit'] 的 prompt 部分

const BLOCK_DIFF_EDIT_SKILL = `
# Block Diff 编辑规范（严格模式）

## ⚠️ 重要守则

### 0. 首先问自己：需要用 applyDiff 吗？

**编辑出错的责任完全在于你！**

| 场景 | 推荐方案 |
|------|----------|
| 仅涉及内容增加 | → appendContent / createNewDoc |
| 极端复杂变更（移动块、重构文档） | → 让用户自己来 |
| 跨文档编辑、大范围编辑 | → 让用户自己来 |
| 中等复杂、小范围更新 | → applyDiff ✅ |
| 复杂嵌套结构（如列表） | → append 到原块后让用户整理 |

### 1. 编辑出错需要回滚时

告知用户：
1. 右上角文档菜单可查看文件历史恢复版本
2. 插件顶栏"变量管理"可查看过去工具调用，可能检索到旧版本

自行处理：
1. 在过去的记录中找到第一个 getBlockContent 的记录
2. Read 对应的 Result Var
3. 恢复内容
  如果文档为空 -> Append 进去
  如果文档有内容 -> 同级 create 一个新 doc 并告知用户整理

### 2. 规划指南

- **一次最多处理 3 个 hunk**
- 批量编辑 → 拆解为多个小任务逐步完成
- 只能用于**同邻域范围**内编辑

### 3. 精细化编辑策略

| 目标类型 | 策略 |
|----------|------|
| 叶子块 | 直接编辑 |
| 中小容器块小编辑 | 精细化编辑子块 |
| 中小容器块大改动（结构不变） | 替换整个容器 |
| 大容器极大改动 | 让用户自己来 |

---

## 核心理念

Block Diff 是**严格模式**的编辑方式：
- 所有编辑在执行前会进行**强制内容匹配校验**
- 任何一个 hunk 校验失败，**整个 diff 都会被拒绝**
- 必须先用 \`getBlockContent(showId=true)\` 获取准确内容

---

## Diff 语法规范

### 基本格式

\`\`\`diff
@@<blockId>@@
  保留不变的上下文行（空格开头）
- 要删除的行（减号开头）
+ 要添加的行（加号开头）
\`\`\`

### 行类型说明

| 前缀 | 含义 | 校验规则 |
|------|------|----------|
| \`空格\` | 上下文 C（保留不变） | 必须出现在原文中 |
| \`-\` | 删除内容 A | 必须与原文匹配 |
| \`+\` | 新增内容 B | 无需校验 |

### 校验规则（CRITICAL）

1. **上下文行 C** 必须出现在原文中
2. **删除行 A**（去掉 \`- \` 后）必须与原文匹配
3. **任何不匹配都会拒绝整个 diff**

### 操作类型推断

| diff 内容 | 操作类型 | 说明 |
|-----------|----------|------|
| 有 \`-\` 行和 \`+\` 行 | UPDATE | 更新块内容 |
| 只有 \`-\` 行 | DELETE | 删除该块 |
| 只有 \`+\` 行 | INSERT_AFTER | 在块后插入 |
| 只有上下文行 | ⚠️ 跳过 | 产生警告 |

### 特殊命令

| 语法 | 作用 |
|------|------|
| \`@@DELETE:blockId@@\` | 删除整个块（无需内容） |
| \`@@BEFORE:blockId@@\` | 在块前插入 |
| \`@@AFTER:blockId@@\` | 在块后插入 |
| \`@@PREPEND:docId@@\` | 在文档/容器开头插入 |
| \`@@APPEND:docId@@\` | 在文档/容器末尾追加 |

---

## 工作流程

### 第一步：获取内容

\`\`\`
getBlockContent(blockId, showId=true)
\`\`\`

返回格式：
\`\`\`
@@20260108164554-m5ar6vb@@段落
Hello World
This is line 2.

@@20260108164544-w8lz0zj@@标题
## Heading
\`\`\`

### 第二步：构造 Diff

**CRITICAL - 必须包含完整的原文内容！**

假设要修改 "Hello World" 为 "你好世界"：

\`\`\`diff
@@20260108164554-m5ar6vb@@
- Hello World
- This is line 2.
+ 你好世界
+ 这是第二行。
\`\`\`

**或者使用上下文行：**

\`\`\`diff
@@20260108164554-m5ar6vb@@
- Hello World
+ 你好世界
  This is line 2.
\`\`\`

**⚠️ 以下写法会被拒绝：**

\`\`\`diff
@@20260108164554-m5ar6vb@@
- Hello
+ 你好
\`\`\`
原因：原文是 "Hello World"，不是 "Hello"，内容不匹配！

### 第三步：执行

\`\`\`
applyBlockDiff({ diff: "..." })
\`\`\`

---

## 操作示例

### 更新块内容

\`\`\`diff
@@20260108164554-m5ar6vb@@
- Hello World
+ 你好，世界
\`\`\`

### 带上下文的更新

\`\`\`diff
@@20260108164554-m5ar6vb@@
  第一行保持不变
- 要修改的第二行
+ 修改后的第二行
  第三行保持不变
\`\`\`

### 删除块（方式一：通过 - 行）

\`\`\`diff
@@20260108164554-m5ar6vb@@
- 这个块的完整内容
- 第二行
\`\`\`

### 删除块（方式二：DELETE 命令）

\`\`\`diff
@@DELETE:20260108164554-m5ar6vb@@
\`\`\`

### 在块后插入

\`\`\`diff
@@20260108164554-m5ar6vb@@
+ 在目标块后面插入的新段落
\`\`\`

### 在文档末尾追加

\`\`\`diff
@@APPEND:20260108164554-m5ar6vb@@
+ 追加到文档末尾的内容
\`\`\`

### 批量操作

\`\`\`diff
@@20260108164554-m5ar6vb@@
- Hello
+ 你好

@@20260108164544-w8lz0zj@@
- ## Old Title
+ ## New Title
\`\`\`

---

## 容器块编辑

### 修改整个容器

\`\`\`diff
@@20251030184332-kjly5ar@@
- > 原始引述内容
- > 第二行
+ > 新的引述内容
+ > 更新后的第二行
\`\`\`

### 修改容器内子块

先用 \`showSubStructure=true\` 获取子块：

\`\`\`
getBlockContent(blockId, showId=true, showSubStructure=true)
\`\`\`

然后单独修改子块：

\`\`\`diff
@@20260108164611-5n7h75k@@
- 引述块内容
+ 修改后的引述内容
\`\`\`

---

## 错误处理

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 内容不匹配 | diff 中的内容与实际不符 | 重新获取最新内容 |
| 块不存在 | ID 错误或块已删除 | 重新获取确认 ID |
| 无效的块 ID | ID 格式不符合规范 | 从 getBlockContent 复制 |
| 没有有效操作 | 只有上下文行 | 添加 - 或 + 行 |

### 校验失败示例

**场景**：块实际内容是 "Hello World"

**错误的 diff**：
\`\`\`diff
@@id@@
- Hello
+ 你好
\`\`\`

**错误信息**：
\`\`\`
❌ 内容校验失败，拒绝执行编辑

Hunk #1 [id]
   错误类型: CONTENT_MISMATCH
   块内容不匹配，拒绝执行编辑
   期望内容: "Hello"
   实际内容: "Hello World"
\`\`\`

**正确的 diff**：
\`\`\`diff
@@id@@
- Hello World
+ 你好世界
\`\`\`

---

## 注意事项

1. **强制校验**：所有 hunk 都会校验，任何失败都拒绝整个操作
2. **完整内容**：必须提供完整的原文（context + minus）
3. **ID 格式**：yyyyMMddHHmmss-xxxxxxx（从 getBlockContent 复制）
4. **多行内容**：每行都需要正确的前缀（空格/-/+）
5. **空行**：空行默认视为上下文行
6. **操作数量**：建议每次最多 3 个 hunk
7. **复杂场景**：让用户自己处理
`.trim();

// 导出供 skill-doc.ts 使用
export { BLOCK_DIFF_EDIT_SKILL };



// ============ 导出 ============

export { parseBlockDiff, formatEdit } from './parser';
export { executeEdits, createSiyuanAPI } from './core';
export type { BlockEdit, EditResult, ValidationResult } from './types';

