/*
 * 规则正文：applyBlockDiff 是插件自定义接口，工具 schema 只列出语法，
 * 这里补充使用判断、取 ID 的步骤与常见错误。
 */

const BLOCK_DIFF_EDIT_SKILL = `
# Block Edit 使用规范 (SEARCH/REPLACE 模式)

## 何时用 applyBlockDiff

| 场景 | 方案 |
|------|------|
| 仅追加内容 | ❌ 用 appendContent / createNewDoc |
| 跨文档/大范围编辑 | ❌ 让用户自己来 |
| 极端复杂重构 | ❌ 让用户自己来 |
| **中等复杂、小范围更新** | ✅ **applyBlockDiff** |

**编辑出错需要回滚？** 文档右上角菜单 → 查看文件历史。

---

## 三步工作流

### 1️⃣ 获取块内容与 ID

\`\`\`
getBlockContent(blockId, showId=true, showSubStructure=true)
\`\`\`

\`showId=true\` 返回的每个块带 \`@@<blockId>@@\` 标记，diff 中的定位就使用这些 ID。

### 2️⃣ 选择编辑模式

| 目标 | 模式 |
|------|------|
| **叶子块**，知道原内容 | SEARCH/REPLACE |
| **叶子块**，不关心原内容 | REPLACE 指令 |
| **容器块**，仅改少数子块 | getBlockContent(showSubStructure=true) → 精细编辑子块 |
| **容器块**，整体替换 | REPLACE 指令，保持块类型一致 |

### 3️⃣ 执行

\`\`\`
applyBlockDiff({ diff: "..." })
\`\`\`

---

## 格式要求（严格）

\`\`\`diff
@@<blockId>@@
<<<<<<< SEARCH
原始内容（完整）
=======
新内容
>>>>>>> REPLACE
\`\`\`

1. 标记必须独占一行
2. 顺序固定：\`<<<<<<< SEARCH\` → \`=======\` → \`>>>>>>> REPLACE\`
3. **SEARCH 内容必须与块内容完全一致**（包括空格、换行）
4. 不允许嵌套
5. SEARCH 为空、REPLACE 非空不算有效编辑 —— 该 hunk 会被跳过；新增块用 BEFORE/AFTER 指令

---

## 容器块编辑

当且仅当面对列表、引述、超级块等容器块，且用户明确需要精细更改时，才做精细编辑。

**获取容器**（含子块信息）：

\`\`\`
getBlockContent("container-id", showId=true, showSubStructure=true)
\`\`\`

**编辑子块**：用子块自己的 ID 作为 \`@@<blockId>@@\` 写普通 SEARCH/REPLACE。

**整体替换容器**：用 \`@@REPLACE:<容器块Id>@@\` 给出完整新内容，保持块类型一致。

---

## 错误排查

### 格式验证失败

| 错误 | 原因 | 修复 |
|------|------|------|
| 嵌套标记 | SEARCH 块内有 \`<<<<<<< SEARCH\` | 改用 REPLACE 指令跳过校验，或拆分编辑 |
| 标记不成对 | 缺少 \`>>>>>>> REPLACE\` | 补全标记 |
| 格式错误 | 标记行还有其他内容 | 让标记独占一行 |

### 内容匹配失败

SEARCH 必须复制块的**完整**内容，而不是其中一段。块内容不止一行时，只写首行会匹配失败。

**修复**：用 \`getBlockContent(showId=true)\` 重新获取当前内容，整段复制到 SEARCH。块已被修改过时，以最新内容为准。

### 块不存在

blockId 错误或块已删除。用 \`getBlockContent\` 重新确认 ID。

---

## 约束

- **批量编辑**：单次默认最多 3-5 个编辑操作；若用户许可，可以大批量编辑
- **强制校验**：普通 SEARCH/REPLACE 必须内容完全匹配
- **指令模式**（DELETE/REPLACE）跳过内容校验
- **复杂重构**：让用户自己处理
`.trim();

// 导出供 skill-doc.ts 使用
export { BLOCK_DIFF_EDIT_SKILL };
