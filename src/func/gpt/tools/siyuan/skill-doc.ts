/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-26
 * @FilePath     : /src/func/gpt/tools/siyuan/skill-doc.ts
 * @Description  : 思源笔记技能文档查询工具
 */

import { Tool, ToolExecuteStatus, ToolPermissionLevel, ToolExecuteResult } from "../types";

/**
 * 技能文档主题定义
 */
const SKILL_DOCS: Record<string, string> = {
    'sql-overview': `
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
`.trim(),

    'sql-blocks-table': `
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
`.trim(),

    'sql-refs-table': `
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
`.trim(),

    'sql-attributes-table': `
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
`.trim(),

    'block-markdown-syntax': `
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
`.trim(),

    'dailynote': `
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
`.trim(),

    'id-and-path': `
## ID 与路径规则 ##

**ID 格式**: \`/\\d{14,}-\\w{7}/\`
- 结构: 创建时间戳 + 随机字符
- 示例: \`20241016135347-zlrn2cz\` (2024-10-16 13:53:47 创建)
- 可从 ID 推断创建时间

**path (ID 路径)**:
- 格式: \`/<父文档ID>/<当前文档ID>.sy\`
- 笔记本内唯一
- 可推断文档层级关系

**hpath (名称路径)**:
- 格式: \`/<父文档名>/<当前文档名>\`
- 可能重复（不同笔记本可能有同名文档）
- 人类可读

**重要规则**: 所有 API 的 docId/notebookId/blockId 参数必须使用 ID，不能用名称或路径！
`.trim(),

    'tool-selection': `
## 工具选择指南 ##

**文档查找**:
- 知道文档名 → searchDocument
- 需要当前打开的 → listActiveDocs
- 需要层级结构 → listSubDocs / listSiblingDocs / getParentDoc
- 需要笔记本概览 → listNotebookDocs

**内容获取**:
- 读取文档/块内容 → getBlockMarkdown
- 获取文档元信息 → getDocument

**内容写入**:
- 追加到文档末尾 → appendMarkdown
- 追加到今日日记 → appendDailyNote

**高级查询**:
- 简单关键词搜索 → searchKeyword
- 复杂条件/统计/跨表 → querySQL

**querySQL 使用时机**:
- 需要 JOIN 多表（如查反链、带属性筛选）
- 需要聚合统计（COUNT, GROUP BY）
- 现有工具无法满足的复杂查询
- 使用前建议查阅相关 SQL 文档主题
`.trim()
};

/**
 * 获取所有可用主题
 */
const getAvailableTopics = (): string[] => Object.keys(SKILL_DOCS);

/**
 * 思源技能文档查询工具
 */
export const siyuanSkillDocTool: Tool = {
    SKIP_CACHE_RESULT: true,
    SKIP_EXTERNAL_TRUNCATE: true,

    definition: {
        type: 'function',
        function: {
            name: 'SiYuanSkillDoc',
            description: `查询思源笔记高级功能文档。当需要使用 querySQL 或理解复杂概念时调用。
可用主题: ${getAvailableTopics().join(', ')}
返回 \`string\`（Markdown 格式文档）`,
            parameters: {
                type: 'object',
                properties: {
                    topics: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: getAvailableTopics()
                        },
                        description: '要查询的主题列表，可一次查询多个相关主题'
                    }
                },
                required: ['topics']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { topics: string[] }): Promise<ToolExecuteResult> => {
        const { topics } = args;

        if (!topics || topics.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `请指定要查询的主题。可用主题: ${getAvailableTopics().join(', ')}`
            };
        }

        const results: string[] = [];
        const notFound: string[] = [];

        for (const topic of topics) {
            if (SKILL_DOCS[topic]) {
                results.push(SKILL_DOCS[topic]);
            } else {
                notFound.push(topic);
            }
        }

        if (results.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `未找到主题: ${notFound.join(', ')}。可用主题: ${getAvailableTopics().join(', ')}`
            };
        }

        let output = results.join('\n\n---\n\n');

        if (notFound.length > 0) {
            output += `\n\n[注意] 未找到主题: ${notFound.join(', ')}`;
        }

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: output
        };
    },

    // 参数压缩显示
    compressArgs: (args: Record<string, any>) => {
        return `topics: [${args.topics?.join(', ') || ''}]`;
    }
};
