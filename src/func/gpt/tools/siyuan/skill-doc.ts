/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-26
 * @FilePath     : /src/func/gpt/tools/siyuan/skill-doc.ts
 * @Description  : 思源笔记技能文档声明（供 declareSkillRules 使用）
 */

import type { ToolGroup } from "../types";

type SkillRule = NonNullable<ToolGroup['declareSkillRules']>[string];

const SKILL_RULES: Record<string, SkillRule> = {
    'sql-overview': {
        desc: 'SQL 查询基础与核心表',
        prompt: `
## SQL 查询概述 ##

思源使用 SQLite 数据库存储笔记数据，通过 querySQL 工具可执行 SQL 查询。

**核心表**:
- blocks: 所有块（文档、段落、标题等）
- refs: 块引用关系
- attributes: 块属性（含自定义属性）

**基本查询模式**:
\`SELECT * FROM blocks WHERE <条件> ORDER BY <排序> LIMIT 32\`

**重要**: 始终指定 LIMIT 避免返回过多数据！建议默认 LIMIT 32

- 完整SQL表结构文档: https://docs.siyuan-note.club/zh-Hans/reference/database/table.html
- SQL 查询 CheatSheet: https://ld246.com/article/1739546865001
`.trim()
    },
    'sql-blocks-table': {
        desc: 'SQL blocks 表字段与查询示例',
        prompt: `
## blocks 表字段说明 ##

| 字段 | 说明 | 示例值 |
|------|------|--------|
| id | 块唯一标识 | 20241016135347-zlrn2cz |
| type | 块类型 | d(文档), h(标题), p(段落), l(列表), c(代码), t(表格), m(公式), b(引述), s(超级块), av(属性视图/数据库) |
| subtype | 子类型 | h1-h6(标题级别), u/o/t(无序/有序/任务列表) |
| content | 纯文本内容 | 文档标题或块文本 |
| markdown | Markdown源码 | 含格式的完整内容 |
| box | 所属笔记本ID | 20210808180117-czj9bvb |
| root_id | 所属文档ID | 与文档块id相同 |
| path | ID路径 | /20241020123921-0bdt86h/20240331203024-9vpgge9.sy |
| hpath | 名称路径 | /Inbox/我的文档 |
| created | 创建时间 | 20241016135347 |
| updated | 更新时间 | 20241016140000 |

**常用查询示例**:
- 搜索文档: \`SELECT * FROM blocks WHERE type='d' AND content LIKE '%关键词%' LIMIT 32\`
- 最近更新: \`SELECT * FROM blocks WHERE type='d' ORDER BY updated DESC LIMIT 10\`
`.trim()
    },
    'sql-refs-table': {
        desc: 'SQL refs 反链查询示例',
        prompt: `
## refs 表（块引用关系）##

记录块之间的引用关系，用于查询反链。

| 字段 | 说明 |
|------|------|
| block_id | 引用发起方的块ID（包含引用语法的块） |
| def_block_id | 被引用方的块ID |
| def_block_root_id | 被引用块所在文档ID |

**查询反链示例**:
\`\`\`sql
SELECT B.* FROM blocks AS B
WHERE B.id IN (
    SELECT block_id FROM refs WHERE def_block_id = '<目标块ID>'
)
LIMIT 32
\`\`\`

**查询某文档的所有出链**:
\`\`\`sql
SELECT def_block_id, def_block_root_id FROM refs
WHERE block_id IN (SELECT id FROM blocks WHERE root_id = '<文档ID>')
\`\`\`
`.trim()
    },
    'sql-attributes-table': {
        desc: 'SQL attributes 自定义属性查询',
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
  例: custom-dailynote-20240101=20240101

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
WHERE A.name = 'custom-myattr' AND A.value = 'somevalue'
LIMIT 32
\`\`\`
`.trim()
    },
    'dailynote': {
        desc: '日记机制、路径模板与 SQL 示例',
        prompt: `
## 日记文档 ##

每个笔记本可独立配置日记功能，日记文档按模板路径自动创建。

**路径模板** (GO 模板语法):
- 示例: \`/daily note/{{now | date "2006/01"}}/{{now | date "2006-01-02"}}\`
- 2025-12-15 解析为: \`/daily note/2025/12/2025-12-15\`

**日记文档识别**:
- 文档属性: \`custom-dailynote-<yyyyMMdd>=<yyyyMMdd>\`
- 例: 2024年1月1日的日记有属性 \`custom-dailynote-20240101=20240101\`

**工具使用**:
- getDailyNoteDocs: 获取指定日期范围的日记（推荐）
- appendDailyNote: 向今日日记追加内容

**注意**: 日记文档按笔记本独立管理，操作前需确认目标笔记本

**SQL 查询指定范围日记示例**:
\`\`\`
select distinct B.* from blocks as B join attributes as A
on B.id = A.block_id
where A.name like 'custom-dailynote-%' and B.type='d'
and A.value >= '20231010' and A.value <= '20231013'
order by A.value desc;
\`\`\`
`.trim()
    },
    'block-markdown-syntax': {
        desc: '块链接、引用与嵌入语法',
        prompt: `
## 块内容特殊语法 ##

思源块/文档的内容用 Markdown 格式表示
附加一些 Markdown 内容中的特殊语法：

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
        desc: '思源中文档结构和路径、文档ID规则',
        prompt: `
## 文档结构与块属性 ##

文档块的 block 表（从数据库查询获得）属性中，记录了文档 id，所在 notebook id，还有在笔记本下方的 path。其中 "<思源笔记工作空间>/data/box/path" 就是这个文档在机器文件系统中的实际物理位置。

例如假设有一个文档，他在思源笔记空间中的实际路径如下：

/data/20260101215354-j0c5gvk/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
     └── 笔记本 ID ──┘          └── 上层文档 ID ──┘           └── 文档 ID ──┘


对应文档 block 如下：

- content： “文档结构”为文档名称（标题）
- hpath：“/思源笔记开发/文档结构”为思源笔记内的路径和 path 属性对应
- path：“/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy”为在笔记本下的相对路径
- 上层文档：ID 为20260107143325-zbrtqu，标题为 思源笔记开发
- 所在笔记本 ID：20260101215354-j0c5gvk

<json>
{
"box": "20260101215354-j0c5gvk",  // 所属笔记本 ID
"content": "文档结构",             // 文档名称
"created": "20260107143334",
"fcontent": "文档结构",
"hpath": "/思源笔记开发/文档结构",   // 人类可读路径（名称）
"id": "20260107143334-l5eqs5i",  // 文档 ID（块 ID）
"parent_id": "",
"path": "/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy", // ID 路径（笔记本内唯一）
"root_id": "20260107143334-l5eqs5i", // 所在文档 ID，对文档块而言就是他自身
"type": "d",
"updated": "20260107144148"
...(其他还有一些字段)
}
</json>
`.trim()
    }
};

export const siyuanSkillRules = SKILL_RULES;
export const siyuanSkillTopics = Object.keys(SKILL_RULES);
