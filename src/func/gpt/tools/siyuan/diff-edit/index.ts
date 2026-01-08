/**
 * applyBlockDiff Tool
 *
 * 应用 Block Diff 编辑到思源笔记
 */

import type {
    BlockEdit,
} from './types';
import { parseBlockDiff, formatEdit, validateOldContent } from './parser';
import { executeEdits, createSiyuanAPI } from './core';
import { Tool, ToolExecuteStatus, ToolPermissionLevel } from '@gpt/tools/types';
import { request } from '@/api';


// ============ 思源 API request 函数（需外部注入） ============

let _request: (url: string, data: any) => Promise<any> = request;

const SKILL_NAME = 'block-diff-edit';

// ============ Tool 定义 ============

export const applyBlockDiffTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'applyBlockDiff',
            description: `应用 Block Diff 编辑到思源笔记文档。

**Diff 格式**

使用基于 Block ID 锚定的 Unified Diff 格式：

\`\`\`diff
@@<blockId>@@
- 要删除/替换的原始内容
+ 要添加/替换的新内容
\`\`\`

**案例**

\`\`\`diff
@@20260108164554-m5ar6vb@@段落
- Hello World
+ 你好，世界

@@20260108164544-w8lz0zj@@标题
- ## Old Title
+ ## New Title

@@APPEND:20241020121005-3a8cynh@@
+ 这是追加到文档末尾的新内容
\`\`\`

IMPORTANT: 如果不清楚如何使用，请首先阅读 ${SKILL_NAME}.

\`\`\``,
            parameters: {
                type: 'object',
                properties: {
                    diff: {
                        type: 'string',
                        description: '符合 Block Diff 格式的编辑内容'
                    },
                    dryRun: {
                        type: 'boolean',
                        description: '仅解析不执行，用于预览操作（默认 false）'
                    },
                    validateOld: {
                        type: 'boolean',
                        description: '是否校验 oldContent 与实际内容匹配（默认 false）'
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
        validateOld?: boolean;
    }) => {
        const { diff, dryRun = false, validateOld = false } = args;

        // 1. 解析 diff
        let edits: BlockEdit[];
        try {
            edits = parseBlockDiff(diff);
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Diff 解析失败: ${error instanceof Error ? error.message : String(error)}`
            };
        }

        if (edits.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '未解析到有效的编辑操作，请检查 diff 格式'
            };
        }

        // 2. 干运行模式：仅返回解析结果
        if (dryRun) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    message: '干运行模式，以下操作未执行',
                    operations: edits.map(e => formatEdit(e)),
                    parsed: edits
                }
            };
        }

        // 3. 校验 oldContent（如果启用）
        if (validateOld) {
            const api = createSiyuanAPI(_request);
            for (const edit of edits) {
                if (edit.oldContent && (edit.type === 'UPDATE' || edit.type === 'DELETE')) {
                    const block = await api.getBlockByID(edit.blockId);
                    if (!block) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `块不存在: ${edit.blockId}`
                        };
                    }
                    if (!validateOldContent(block.markdown, edit.oldContent, false)) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `块内容不匹配: ${edit.blockId}\n期望: ${edit.oldContent}\n实际: ${block.markdown}`
                        };
                    }
                }
            }
        }

        // 4. 执行编辑
        if (!_request) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '思源 API 未初始化，请先调用 setRequestFunction'
            };
        }

        const api = createSiyuanAPI(_request);
        const results = await executeEdits(edits, api);

        // 5. 汇总结果
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        if (failCount === 0) {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    message: `成功执行 ${successCount} 个操作`,
                    operations: results.map(r => ({
                        operation: formatEdit(r.edit),
                        success: r.success,
                        newBlockId: r.newBlockId
                    }))
                }
            };
        } else if (successCount === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `全部 ${failCount} 个操作失败`,
                details: results
            };
        } else {
            return {
                status: ToolExecuteStatus.ERROR,
                data: {
                    message: `部分成功: ${successCount} 成功, ${failCount} 失败`,
                    operations: results.map(r => ({
                        operation: formatEdit(r.edit),
                        success: r.success,
                        error: r.error,
                        newBlockId: r.newBlockId
                    }))
                }
            };
        }
    }
};

export const blockDiffSkill = {
    [SKILL_NAME]: {
        when: `当需要编辑、修改、更新思源笔记文档内容时使用。包括但不限于：
- 修改文档中的某个段落内容
- 删除文档中的某些块
- 在文档中插入新内容
- 批量修改多个块
- 对文档进行结构调整`,

        desc: `Block Diff 是一种基于块 ID 锚定的编辑方式，允许精确定位并修改思源笔记中的特定块。
与传统行号定位不同，Block Diff 使用 @@{blockId}@@ 直接锚定目标块，避免了行号计算的不确定性。
支持的操作包括：更新块内容、删除块、在块前后插入新内容、在容器开头/末尾追加。`,

        prompt: `# Block Diff 编辑规范

## 工作流程

### 第一步：获取内容并定位

使用 \`getBlockContent\` 工具获取文档内容：

\`\`\`
getBlockContent(blockId, showId=true)
\`\`\`

返回格式：
\`\`\`
@@20260108164554-m5ar6vb@@段落
Hello World

@@20260108164544-w8lz0zj@@标题
## Heading

@@20260108164618-4pn69mv@@列表
- 列表项 1
- 列表项 2
\`\`\`

如需编辑容器块（引述、列表、超级块）内部的子块，使用：
\`\`\`
getBlockContent(blockId, showId=true, showSubStructure=true)
\`\`\`

### 第二步：构造 Diff

基于获取的内容，构造符合规范的 diff：

\`\`\`diff
@@<blockId>@@
- 原始内容（要删除或替换的行）
+ 新内容（要添加或替换的行）
\`\`\`

### 第三步: 发起 TOOL Call 请求

---

## Diff 语法规范

### 基本格式

每个 hunk 以 \`@@blockId@@\` 开头，后跟 diff 内容：

\`\`\`diff
@@20260108164554-m5ar6vb@@
- 原始内容
+ 新内容
\`\`\`

### 操作类型（自动推断）

| diff 内容 | 操作类型 | 说明 |
|-----------|----------|------|
| 有 \`-\` 行和 \`+\` 行 | UPDATE | 更新块内容 |
| 只有 \`-\` 行 | DELETE | 删除该块 |
| 只有 \`+\` 行 | INSERT_AFTER | 在该块后插入新块 |

### 特殊位置标记

| 标记 | 作用 |
|------|------|
| \`@@BEFORE:blockId@@\` | 在指定块**之前**插入 |
| \`@@PREPEND:docId@@\` | 在文档/容器**开头**插入 |
| \`@@APPEND:docId@@\` | 在文档/容器**末尾**追加 |

---

## 操作示例

### 更新块内容

\`\`\`diff
@@20260108164554-m5ar6vb@@段落
- Hello World
+ 你好，世界
\`\`\`

### 删除块

\`\`\`diff
@@20260108164554-m5ar6vb@@段落
- 这个块将被删除
\`\`\`

### 在块后插入

\`\`\`diff
@@20260108164554-m5ar6vb@@段落
+ 这是在目标块后面新插入的段落
\`\`\`

### 在块前插入

\`\`\`diff
@@BEFORE:20260108164554-m5ar6vb@@
+ 这是在目标块前面插入的内容
\`\`\`

### 在文档末尾追加

\`\`\`diff
@@APPEND:20241020121005-3a8cynh@@
+ 这是追加到文档末尾的新内容
+
+ 可以是多行
\`\`\`

### 在文档开头插入

\`\`\`diff
@@PREPEND:20241020121005-3a8cynh@@
+ 这将成为文档的第一个块
\`\`\`

### 多行内容更新

\`\`\`diff
@@20260108164544-w8lz0zj@@标题
- ## 旧标题
-
- 旧的描述段落
+ ## 新标题
+
+ 新的描述段落，内容已更新
+
+ 还可以添加更多内容
\`\`\`

### 批量操作（多个 hunk）

\`\`\`diff
@@20260108164554-m5ar6vb@@段落
- Hello
+ 你好

@@20260108164544-w8lz0zj@@标题
- ## Old Title
+ ## New Title

@@20260108164618-4pn69mv@@列表
- - 旧列表项 1
- - 旧列表项 2
+ - 新列表项 A
+ - 新列表项 B
+ - 新列表项 C
\`\`\`

---

## 容器块编辑

### 修改整个容器块

直接获取容器块 ID 并更新：

\`\`\`diff
@@20251030184332-kjly5ar@@引述
- > 原始引述内容
- > 第二行
+ > 新的引述内容
+ > 更新后的第二行
+ > 新增的第三行
\`\`\`

### 修改容器内部子块

先用 \`showSubStructure=true\` 获取子块：

\`\`\`
@@20260108164611-5n7h75k@@段落
引述块内容

@@20260108164615-0kui8m2@@段落
段落

@@20260108164617-efu76iu@@段落
段落
\`\`\`

然后单独修改子块：

\`\`\`diff
@@20260108164611-5n7h75k@@段落
- 引述块内容
+ 修改后的引述内容
\`\`\`

---

## 注意事项

1. **ID 必须正确**：错误的 ID 会导致操作失败
2. **多行内容**：每行都需要 \`-\` 或 \`+\` 前缀
3. **空行处理**：内容中的空行也需要带前缀（\`-\` 或 \`+\`）
4. **UPDATE 会整块替换**：新内容会完全替换旧内容
5. **操作顺序**：多个 hunk 按顺序执行，注意依赖关系
6. **容器块**：若容器块内容大，而需要的修改粒度小，建议尽量细粒度修改子块，避免整体替换大容器

---

## 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 无效的块 ID | ID 格式不正确 | 使用 getBlockContent(showId=true) 获取正确的 ID 格式 |
| 块不存在 | ID 错误或块已删除 | 重新获取内容确认 ID |
| 解析失败 | diff 格式不正确 | 检查 \`@@\` 语法和前缀 |
| 内容不匹配 | oldContent 与实际不符 | 重新获取最新内容 |`
    }
}

