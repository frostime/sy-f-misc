/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2026-02-09
 * @Description  : 文件系统工具组技能文档声明（供 declareSkillRules 使用）
 * @FilePath     : /src/func/gpt/tools/file-system/skill-rules.ts
 */

import type { ToolGroup } from "../types";

type SkillRule = NonNullable<ToolGroup['declareSkillRules']>[string];

// ============================================================================
// 查看工具详解
// ============================================================================

const VIEWER_DOCS: Record<string, SkillRule> = {
    'fs-view-modes': {
        desc: 'fs-View 读取模式详解',
        when: '需要查看文件内容，但不确定用哪种模式时',
        prompt: `
## fs-View 读取模式

**auto（默认）**: 智能选择，小文件读全部，大文件读前 100 行
**full**: 完整读取（<0.5MB）
**head**: 前 N 行（默认 50，最大 1000）
**tail**: 后 N 行（默认 50，最大 1000）
**range**: 指定行范围 [start, end]

### 示例
\`\`\`json
// 自动模式（推荐）
{ "path": "src/main.ts" }

// 查看文件前 100 行
{ "path": "large_log.txt", "mode": "head", "lines": 100 }

// 查看最后 50 行日志
{ "path": "app.log", "mode": "tail", "lines": 50 }

// 查看 50-100 行
{ "path": "data.csv", "mode": "range", "range": [50, 100] }

// 带行号显示
{ "path": "script.py", "showLineNumbers": true }
\`\`\`

**注意**: 大文件（>0.5MB）不要用 full 模式，优先用 head/tail/range。
`.trim()
    },
};

// ============================================================================
// 编辑工具详解
// ============================================================================

const EDITOR_DOCS: Record<string, SkillRule> = {
    'fs-search-replace': {
        desc: 'SearchReplace 格式规范与错误处理',
        when: '需要使用 fs-SearchReplace 修改文件内容时',
        prompt: `
## fs-SearchReplace 详细用法

### 格式

\`\`\`
<<<<<<< SEARCH
// 包含 3-5 行上下文的原始代码
function example() {
  const x = 1;
  return x;
}
=======
function example() {
  const x = 2;
  return x * 2;
}
>>>>>>> REPLACE
\`\`\`

### 关键规则
1. **SEARCH 必须精确匹配**文件中的实际代码（含空格、缩进）
2. 包含 **3-5 行上下文**确保唯一性
3. 多处修改写**多个** SEARCH/REPLACE 块
4. **REPLACE 留空**表示删除该代码段
5. 重复代码使用 \`withinRange: { startLine, endLine }\` 限定范围

### 错误处理

**"未找到匹配"**:
→ SEARCH 内容与文件不符。先用 \`fs-View\` 查看实际内容，复制到 SEARCH。

**"发现相似代码（非精确匹配）"**:
→ 工具会显示相似代码位置。**必须**用 \`fs-View\` 查看文件，用实际代码重新提交。
→ **禁止**凭记忆修改或猜测内容。

**"多个匹配位置"**:
→ 增加上下文行（5-7 行）或使用 \`withinRange\` 缩小范围。

### 最佳实践
- 修改前先 \`fs-View\` 确认内容
- SEARCH 中复制文件中的**真实代码**
- 保持充足上下文（3-5 行）
`.trim()
    },

    'fs-write-file': {
        desc: 'WriteFile 写入模式与使用场景',
        when: '需要创建新文件或大规模重写文件时',
        prompt: `
## fs-WriteFile 用法

### 写入模式
- \`create\`（默认）：创建新文件，文件已存在则报错
- \`overwrite\`：覆盖已有文件
- \`append\`：追加到文件末尾

### 适用场景
- **新建文件**: mode=create
- **大规模重写**（>50% 变更）: mode=overwrite
- **追加日志/内容**: mode=append

### 示例
\`\`\`json
// 创建新文件
{ "path": "src/utils/helper.ts", "content": "export function ...", "mode": "create" }

// 覆盖重写
{ "path": "config.json", "content": "{...}", "mode": "overwrite" }

// 追加内容
{ "path": "CHANGELOG.md", "content": "## v1.2.0\\n...", "mode": "append" }
\`\`\`

自动创建父目录（不存在时）。
`.trim()
    },
};

// ============================================================================
// 导出合并后的规则集
// ============================================================================

export const fileSystemSkillRules: ToolGroup['declareSkillRules'] = {
    ...VIEWER_DOCS,
    ...EDITOR_DOCS,
};
