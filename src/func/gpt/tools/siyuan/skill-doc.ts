/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-26
 * @FilePath     : /src/func/gpt/tools/siyuan/skill-doc.ts
 * @LastEditTime : 2026-01-08 18:57:52
 * @Description  : 思源笔记技能文档声明（供 declareSkillRules 使用）
 */

import type { ToolGroup } from "../types";

type SkillRule = NonNullable<ToolGroup['declareSkillRules']>[string];

// ============================================================================
// 基础概念类（alwaysLoad: true）
// ============================================================================

const BASICS: Record<string, SkillRule> = {
    'block-markdown-syntax': {
        desc: '块链接、引用与嵌入语法',
        when: '需要在回复中引用块、或构造块嵌入时',
        alwaysLoad: true,
        prompt: `
## 块内容特殊语法 ##

思源块/文档的内容用 Markdown 格式表示，附加一些特殊语法：

**块链接** (可点击跳转):
\`[显示文本](siyuan://blocks/<BlockId>)\`

**块引用** (动态显示被引用块内容):
\`((<BlockId> "锚文本"))\` 或 \`((<BlockId> '锚文本'))\`

**块嵌入/查询块** (动态执行 SQL 并嵌入结果):
\`{{SELECT * FROM blocks WHERE type='d' LIMIT 5}}\`
注意: SQL 中换行需用 \`_esc_newline_\` 转义

**标签**:
\`#标签名#\`

**回答时引用块**: 建议使用块链接格式 \`[锚文本](siyuan://blocks/xxx)\` 方便用户溯源
`.trim()
    },

    'doc-tree': {
        desc: '文档结构、路径规则与 ID 含义 | 重要',
        when: '需要理解文档层级关系、或解释 path/hpath 属性时',
        alwaysLoad: false,
        prompt: `
## 文档结构与块属性 ##

文档块的 block 表属性记录了文档 id、所在 notebook id、以及在笔记本下的 path。
\`<思源工作空间>/data/<box>/<path>\` 就是文档在文件系统中的实际物理位置。

### 示例

假设有一个文档，实际路径如下：
\`\`\`
/data/20260101215354-j0c5gvk/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
     └── 笔记本 ID ──┘          └── 上层文档 ID ──┘           └── 文档 ID ──┘
\`\`\`

对应 block 属性：
\`\`\`json
{
  "id": "20260107143334-l5eqs5i",           // 文档 ID
  "box": "20260101215354-j0c5gvk",          // 笔记本 ID
  "root_id": "20260107143334-l5eqs5i",      // 所在文档 ID（文档块的 root_id 就是自己）
  "content": "文档结构",                     // 文档名称
  "hpath": "/思源笔记开发/文档结构",         // 人类可读路径（名称）
  "path": "/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy",  // ID 路径（笔记本内唯一）
  "type": "d"
}
\`\`\`

### 路径属性说明

- **path**: ID 路径，以 ID 组成，在笔记本内唯一
- **hpath**: 名称路径，人类可读，但可能重复（文档可能同名）
`.trim()
    },
};

// ============================================================================
// SQL 查询类（按需加载）
// ============================================================================

const SQL_DOCS: Record<string, SkillRule> = {
    'sql-overview': {
        desc: 'SQL 查询基础与核心表',
        when: '首次编写 SQL 查询，或需要了解表结构概览时',
        prompt: `
## SQL 查询概述 ##

思源使用 SQLite 数据库存储笔记数据，通过 \`querySQL\` 工具可执行 SQL 查询。

**核心表**:
- \`blocks\`: 所有块（文档、段落、标题等）
- \`refs\`: 块引用关系（反链）
- \`attributes\`: 块属性（含自定义属性）

**基本查询模式**:
\`\`\`sql
SELECT * FROM blocks WHERE <条件> ORDER BY <排序> LIMIT 32
\`\`\`

**重要约束**:
- 始终指定 LIMIT 避免返回过多数据！
- 建议默认 LIMIT 32

**参考资源**:
- 完整表结构: https://docs.siyuan-note.club/zh-Hans/reference/database/table.html
- SQL CheatSheet: https://ld246.com/article/1739546865001
`.trim()
    },

    'sql-blocks-table': {
        desc: 'blocks 表字段详解与查询示例',
        when: '需要查询块内容、文档结构，或不清楚字段含义时',
        prompt: `
## blocks 表字段说明 ##

| 字段 | 说明 | 示例值 |
|------|------|--------|
| id | 块唯一标识 | 20241016135347-zlrn2cz |
| type | 块类型 | d(文档), h(标题), p(段落), l(列表), c(代码), t(表格), m(公式), b(引述), s(超级块), av(属性视图) ... |
| subtype | 子类型 | h1-h6(标题级别), u/o/t(无序/有序/任务列表) |
| content | 纯文本内容 | 文档标题或块文本 |
| markdown | Markdown源码 | 含格式的完整内容 |
| box | 所属笔记本ID | 20210808180117-czj9bvb |
| root_id | 所属文档ID | 与文档块 id 相同 |
| path | ID路径 | /20241020123921-0bdt86h/20240331203024-9vpgge9.sy |
| hpath | 名称路径 | /Inbox/我的文档 |
| created | 创建时间 | 20241016135347 |
| updated | 更新时间 | 20241016140000 |

**常用查询示例**:

搜索文档:
\`\`\`sql
SELECT * FROM blocks
WHERE type='d' AND content LIKE '%关键词%'
LIMIT 32
\`\`\`

最近更新:
\`\`\`sql
SELECT * FROM blocks
WHERE type='d'
ORDER BY updated DESC
LIMIT 10
\`\`\`

查询特定类型块:
\`\`\`sql
SELECT * FROM blocks
WHERE type='h' AND subtype='h2'
  AND root_id='<文档ID>'
LIMIT 32
\`\`\`
`.trim()
    },

    'sql-refs-table': {
        desc: 'refs 表与反链查询',
        when: '需要查询块引用关系、反链、出链时',
        prompt: `
## refs 表（块引用关系）##

记录块之间的引用关系，用于查询反链。

| 字段 | 说明 |
|------|------|
| block_id | 引用发起方的块ID（包含引用语法的块） |
| def_block_id | 被引用方的块ID |
| def_block_root_id | 被引用块所在文档ID |

**查询反链示例**:

查询某块的所有反链（谁引用了这个块）:
\`\`\`sql
SELECT B.* FROM blocks AS B
WHERE B.id IN (
    SELECT block_id FROM refs WHERE def_block_id = '<目标块ID>'
)
LIMIT 32
\`\`\`

查询某文档的所有出链:
\`\`\`sql
SELECT def_block_id, def_block_root_id FROM refs
WHERE block_id IN (
    SELECT id FROM blocks WHERE root_id = '<文档ID>'
)
LIMIT 32
\`\`\`

查询互相引用的块对:
\`\`\`sql
SELECT r1.block_id, r1.def_block_id
FROM refs r1
JOIN refs r2
  ON r1.block_id = r2.def_block_id
  AND r1.def_block_id = r2.block_id
LIMIT 32
\`\`\`
`.trim()
    },

    'sql-attributes-table': {
        desc: 'attributes 表与自定义属性查询',
        when: '需要查询或过滤带自定义属性的块时',
        prompt: `
## attributes 表（块属性）##

存储块的自定义属性，用户属性必须以 "custom-" 前缀。

| 字段 | 说明 |
|------|------|
| block_id | 属性所属块ID |
| name | 属性键名 |
| value | 属性值 |

**特殊属性**:
- 日记文档: \`custom-dailynote-<yyyyMMdd>=<yyyyMMdd>\`
  例: \`custom-dailynote-20240101=20240101\`

**查询指定日期范围的日记**:
\`\`\`sql
SELECT DISTINCT B.* FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name LIKE 'custom-dailynote-%'
  AND B.type = 'd'
  AND A.value >= '20231010'
  AND A.value <= '20231013'
ORDER BY A.value DESC
LIMIT 32
\`\`\`

**查询带特定属性的块**:
\`\`\`sql
SELECT B.* FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name = 'custom-myattr'
  AND A.value = 'somevalue'
LIMIT 32
\`\`\`

**查询所有自定义属性**:
\`\`\`sql
SELECT DISTINCT name FROM attributes
WHERE name LIKE 'custom-%'
LIMIT 100
\`\`\`
`.trim()
    },
};

// ============================================================================
// 专题功能类（按需加载）
// ============================================================================

const FEATURES: Record<string, SkillRule> = {
    'dailynote': {
        desc: '日记机制、路径模板与查询',
        when: '涉及日记文档操作或查询时',
        prompt: `
## 日记文档 ##

每个笔记本可独立配置日记功能，日记文档按模板路径自动创建。

### 路径模板（GO 模板语法）

示例: \`/daily note/{{now | date "2006/01"}}/{{now | date "2006-01-02"}}\`

2025-12-15 解析为: \`/daily note/2025/12/2025-12-15\`

### 日记文档识别

文档属性: \`custom-dailynote-<yyyyMMdd>=<yyyyMMdd>\`

例: 2024年1月1日的日记有属性 \`custom-dailynote-20240101=20240101\`

### 工具使用

- **getDailyNoteDocs**: 获取指定日期范围的日记（推荐）
  \`\`\`
  getDailyNoteDocs({
    notebookId: '<笔记本ID>',
    atDate: '2024-01-01'  // 或 beforeDate/afterDate
  })
  \`\`\`

- **appendContent**: 向今日日记追加内容
  \`\`\`
  appendContent({
    markdown: '内容',
    targetType: 'dailynote',
    target: '<笔记本ID>'
  })
  \`\`\`

### 注意事项

- 日记文档按笔记本独立管理
- 操作前需确认目标笔记本（使用 \`listNotebooks\`）
- 每个笔记本可能有不同的日记路径模板

### SQL 查询示例

查询指定范围日记:
\`\`\`sql
SELECT DISTINCT B.* FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name LIKE 'custom-dailynote-%'
  AND B.type = 'd'
  AND A.value >= '20231010'
  AND A.value <= '20231013'
ORDER BY A.value DESC
LIMIT 32
\`\`\`
`.trim()
    },

    'block-diff-edit': {
        desc: '基于 Block ID 锚定的精确编辑方案',
        when: '需要编辑、修改、更新思源笔记文档内容时',
        prompt: `
# Block Diff 编辑规范

## 核心理念

Block Diff 是一种基于块 ID 锚定的编辑方式，允许精确定位并修改思源笔记中的特定块。
与传统行号定位不同，使用 \`@@{blockId}@@\` 直接锚定目标块，避免了行号计算的不确定性。

## 重要守则

0. 首先问自己: 需要用 applyDiff 吗？—— 编辑出现错误的责任完全在于你！
  - 仅涉及内容增加 -> 使用 appendContent 和 createNewDoc
  - 设计极端复杂变更，例如移动块、重构文档 -> 让用户自己来
  - 跨文档编辑、同文档内跨大范围编辑 -> 让用户自己来
  - 中等复杂任务、小范围内更新 -> apply diff
  - 保守策略: 复杂结构如嵌套复杂的列表块，把编辑的内容 append 到原 block 后面让用户自行整理

1. 编辑出错需要回滚时 -> 读取 Var 记录中读取文档工具的结果缓存 -> 安慰用户并帮助他恢复内容

2. 规划指南: applyBlockDiff 只能用于同邻域范围内编辑
  - 一次最多处理 3 个 diff hunk
  - 多批量编辑 -> 拆解为多个小任务，逐步完成

3. 精细化编辑
  - 叶子块 -> 直接编辑
  - 容器块（如列表、引述、超级块等）
    - 小编辑 -> 尽量精细化编辑避免直接替换整个容器
    - 大改动，但容器本身结构不变 -> 替换容器
    - 大容器、极大改动 -> 让用户自己来

4. 精准的 hunk
  - hunk 顶部的 id 足够定位编辑对象，不需要多余上下文辅助定位(不同于纯文本)
  - 只给出需要涉及到编辑的块的 hunk，避免冗余


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

**CRITICAL - 块 ID 格式要求**：
- 必须从 \`getBlockContent(showId=true)\` 的输出中复制完整 ID
- 格式：yyyyMMddHHmmss-xxxxxxx（14位数字-7位小写字母数字）
- 正确示例：\`@@20260108164554-m5ar6vb@@\`
- 错误示例：\`@@164554-m5ar6vb@@\`（数字不足14位）
- 错误示例：\`@@20260108164554-M5AR6VB@@\`（包含大写字母）

### 第三步：发起 Tool Call

调用 \`applyBlockDiff\` 工具应用修改。

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

先用 \`showSubStructure=true\` 获取子块，然后单独修改：

\`\`\`diff
@@20260108164611-5n7h75k@@段落
- 引述块内容
+ 修改后的引述内容
\`\`\`

## 注意事项

1. **ID 格式检查**：系统会自动检查 ID 格式，错误格式会被立即拒绝
2. **多行内容**：每行都需要 \`-\` 或 \`+\` 前缀
3. **空行处理**：内容中的空行也需要带前缀
4. **UPDATE 会整块替换**：新内容会完全替换旧内容
5. **操作顺序**：多个 hunk 按顺序执行，注意依赖关系
6. **容器块**：建议尽量细粒度修改子块，避免整体替换大容器

## 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 无效的块 ID | ID 格式不符合规范 | 使用 \`getBlockContent(showId=true)\` 获取正确 ID |
| 块不存在 | ID 错误或块已删除 | 重新获取内容确认 ID |
| 解析失败 | diff 格式不正确 | 检查 \`@@\` 语法和前缀 |
| 内容不匹配 | oldContent 与实际不符 | 重新获取最新内容 |
`.trim()
    },
};

// ============================================================================
// 导出整合的技能规则
// ============================================================================

export const siyuanSkillRules: Record<string, SkillRule> = {
    ...BASICS,
    ...SQL_DOCS,
    ...FEATURES
};

export const siyuanSkillTopics = Object.keys(siyuanSkillRules);

