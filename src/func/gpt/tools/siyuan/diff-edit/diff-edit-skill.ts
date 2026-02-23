const BLOCK_DIFF_EDIT_SKILL = `
# Block Edit 使用规范 (SEARCH/REPLACE 模式)

## 何时用 applyBlockDiff

| 场景 | 方案 |
|------|------|
| 仅追加内容 | ❌ 用 appendContent / createNewDoc |
| 跨文档/大范围编辑 | ❌ 让用户自己来 |
| 极端复杂重构 | ❌ 让用户自己来 |
| **中等复杂、小范围更新** | ✅ **applyBlockDiff** |

**编辑出错需要回滚？**
- 右上角文档菜单：查看文件历史
- 插件顶栏"变量管理"：查看过去工具调用

---

## 三步工作流

### 1️⃣ 获取块内容
\`\`\`
getBlockContent(blockId, showId=true, showSubStructure=true)
\`\`\`

### 2️⃣ 选择编辑模式

| 目标 | 模式 | 说明 |
|------|------|------|
| **叶子块** | SEARCH/REPLACE | 知道原内容 |
| **叶子块** | REPLACE 指令 | 不关心原内容 |
| **容器块小编辑** | getBlockContent → 精细编辑子块 | 仅改少数子块 |
| **容器块整体替换** | REPLACE 指令 | 结构保持一致 |

### 3️⃣ 执行
\`\`\`
applyBlockDiff({ diff: "..." })
\`\`\`

---

## SEARCH/REPLACE 格式

### 基本语法
\`\`\`diff
@@<blockId>@@
<<<<<<< SEARCH
原始内容（完整）
=======
新内容
>>>>>>> REPLACE
\`\`\`

**格式要求（严格）**：
1. 标记独占一行
2. 顺序：\`<<<<<<< SEARCH\` → \`=======\` → \`>>>>>>> REPLACE\`
3. **SEARCH 内容必须与块内容完全一致**（包括空格、换行）
4. 不允许嵌套

### 操作推断
- SEARCH 非空 + REPLACE 非空 → UPDATE
- SEARCH 非空 + REPLACE 空 → DELETE
- SEARCH 空 + REPLACE 非空 → ⚠️ 不允许（用 AFTER/BEFORE 指令）

---

## 特殊指令

### DELETE 指令（跳过内容校验）
\`\`\`diff
@@DELETE:<blockId>@@
\`\`\`

### REPLACE 指令（跳过内容校验）
\`\`\`diff
@@REPLACE:<blockId>@@
全新内容（可多行）
\`\`\`

**注意**：REPLACE 应保持块类型一致。复杂拆分建议用 REPLACE + AFTER 分离。

### 位置修饰符
\`\`\`diff
@@BEFORE:<blockId>@@       # 在块前插入
@@AFTER:<blockId>@@        # 在块后插入
@@PREPEND:<containerId>@@  # 容器开头
@@APPEND:<containerId>@@   # 容器末尾
\`\`\`

---

## 核心示例

### 更新段落
\`\`\`diff
@@20260108164554-m5ar6vb@@
<<<<<<< SEARCH
Hello World
=======
你好世界
>>>>>>> REPLACE
\`\`\`

### 删除块
\`\`\`diff
@@DELETE:20260108164554-m5ar6vb@@
\`\`\`

### 直接替换（不校验）
\`\`\`diff
@@REPLACE:20260108164554-m5ar6vb@@
全新内容
\`\`\`

### 插入新块
\`\`\`diff
@@AFTER:20260108164554-m5ar6vb@@
要插入的新段落
\`\`\`

### 批量操作
\`\`\`diff
@@20260108164554-m5ar6vb@@
<<<<<<< SEARCH
Hello World
=======
你好世界
>>>>>>> REPLACE

@@20260108164544-w8lz0zj@@
<<<<<<< SEARCH
## Old Title
=======
## New Title
>>>>>>> REPLACE
\`\`\`

---

## 容器块编辑

### 精细化编辑子块

当且仅当面对列表、引述、超级块等容器块，且用户明确需要精细更改的情况下才建议精细化编辑。

**获取容器**（含子块信息）：
\`\`\`
getBlockContent("container-id", showId=true, showSubStructure=true)
\`\`\`

**编辑子块**：
\`\`\`diff
@@child-block-id@@
<<<<<<< SEARCH
原内容
=======
新内容
>>>>>>> REPLACE
\`\`\`

### 整体替换容器
\`\`\`diff
@@REPLACE:list-block-id@@
- 新列表项 1
- 新列表项 2
\`\`\`

---

## 错误排查

### 格式验证失败

| 错误 | 原因 | 修复 |
|------|------|------|
| 嵌套标记 | SEARCH 块内有 \`<<<<<<< SEARCH\` | 用 REPLACE 指令跳过校验或拆分 |
| 标记不成对 | 缺少 \`>>>>>>> REPLACE\` | 补全标记 |
| 格式错误 | 标记行有其他内容 | 标记独占一行 |

### 内容匹配失败

实际块内容：
\`\`\`
Hello World
This is line 2.
\`\`\`

❌ **错误的 diff**（只匹配部分）：
\`\`\`diff
@@id@@
<<<<<<< SEARCH
Hello
=======
你好
>>>>>>> REPLACE
\`\`\`

✅ **正确的 diff**（复制完整内容）：
\`\`\`diff
@@id@@
<<<<<<< SEARCH
Hello World
This is line 2.
=======
你好世界
这是第二行。
>>>>>>> REPLACE
\`\`\`

**解决方案**：
1. 用 getBlockContent 获取准确块内容
2. 复制完整的块内容到 SEARCH
3. 如果块已改变，用最新版本

### 块不存在

**原因**：blockId 错误或已删除

**修复**：用 getBlockContent 重新获取准确 ID

---

## 约束

- **批量编辑**：默认单词最多 3-5 个编辑操作；若用户许可，可以大批量编辑
- **强制校验**：普通 SEARCH/REPLACE 必须内容完全匹配
- **指令模式**（DELETE/REPLACE）跳过内容校验
- **复杂重构**：让用户自己处理
`.trim();

// 导出供 skill-doc.ts 使用
export { BLOCK_DIFF_EDIT_SKILL };
