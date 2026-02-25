/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-26
 * @FilePath     : /src/func/gpt/tools/siyuan/skill-doc.ts
 * @LastEditTime : 2026-01-18 15:34:37
 * @Description  : 思源笔记技能文档声明（供 declareSkillRules 使用）
 */

import type { ToolGroup } from "../types";
import { BLOCK_DIFF_EDIT_SKILL, DIFF_SKILL_NAME } from "./diff-edit";

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

    'slice-reading': {
        desc: '长文档/容器的分页阅读策略',
        when: '需要使用 slice 参数以应对读取长文档内容，指定阅读给定文档 ID 中，给定某个块位置的内容',
        prompt: `
## 长文档/容器阅读策略 ##

当读取文档 (type='d') 或复杂容器块时，推荐使用 \`getBlockContent\` 的 \`slice\` 参数进行分段读取。

### 推荐工作流 (Cursor Pagination)

1. **初始读取**: 获取前 N 个块
   \`getBlockContent(id, slice="0:20")\`

2. **处理内容**: 阅读返回的内容，并记录下**最后一个块的 ID** (例如 \`2023...-lastid\`)。

3. **获取下一页**: 使用 "ID:+N" 语法
   \`getBlockContent(id, slice="2023...-lastid:+20")\`
   *注: 这会从 lastid 开始向后取 20 个块。*

4. **重复步骤 3** 直到读完。

### 聚焦工作流

已经确定在文档 DID 中，关注某个块 ID 位置附近的内容时：

1. **定位块**: 确定目标块 ID (例如 \`2023...-targetid\`)。
2. **获取前后内容**:
   - 向前阅读:
     \`getBlockContent(DID, slice="2023...-targetid:-10")\`
   - 向后阅读:
     \`getBlockContent(DID, slice="2023...-targetid:+10")\`

### Slice 语法参考

| 语法 | 含义 | 场景 |
| :--- | :--- | :--- |
| \`0:20\` | 索引切片：前 20 个 | 预览开头 |
| \`<ID>:+20\` | 游标切片：从 ID 开始向后 20 个 | **逐页顺序阅读 (推荐)** |
| \`<ID>:-10\` | 游标切片：从 ID 结束向前 10 个 | 向上回顾上下文 |
| \`<ID1>:<ID2>\` | 范围切片：读取两个 ID 之间的内容 | 精确提取特定段落 |

假设 blockList 为文档下完整的块列表；有 10 个块，ID 分别为 \`id0\` 到 \`id9\`。

| 输入语法 | 解析逻辑 | 结果范围 (索引) | 备注 |
| :--- | :--- | :--- | :--- |
| \`"id2:id5"\` | Start=\`idx(2)\`, End=\`idx(5)+1\` | \`[2, 3, 4, 5]\` | **ID 闭区间** |
| \`"id2:+3"\` | Start=\`2\`, End=\`2+3\` | \`[2, 3, 4]\` | **游标翻页** |
| \`"id5:-3"\` | End=\`5+1\`, Start=\`6-3\` | \`[3, 4, 5]\` | **向上翻页** (含 id5) |
| \`"0:5"\` | Start=\`0\`, End=\`5\` | \`[0, 1, 2, 3, 4]\` | **普通分页** |
| \`"-2:"\` | Start=\`-2\`, End=\`undefined\` | \`[8, 9]\` | **取末尾** |
| \`"id8:END"\` | Start=\`8\`, End=\`undefined\` | \`[8, 9]\` | **阅读剩余** |
| \`"BEGIN:id2"\` | Start=\`0\`, End=\`2+1\` | \`[0, 1, 2]\` | **阅读开头** |

**注意**: 使用 slice 时，工具会自动附带 ID (@@id@@)，无需手动开启 showId。
`.trim()
    },

    [DIFF_SKILL_NAME]: {
        desc: '基于 Block ID 锚定的精确编辑方案',
        when: '需要使用 applyBlockDiff 来编辑思源笔记文档前，强制性读取 !IMPORTANT!',
        prompt: BLOCK_DIFF_EDIT_SKILL
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

