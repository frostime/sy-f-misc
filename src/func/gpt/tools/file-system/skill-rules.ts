/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2026-02-09
 * @Description  : 文件系统工具组技能文档声明（供 declareSkillRules 使用）
 * @FilePath     : /src/func/gpt/tools/file-system/skill-rules.ts
 */

import type { ToolGroup } from "../types";
import { getPlatform, getScriptName } from "@/libs/system-utils";

type SkillRule = NonNullable<ToolGroup['declareSkillRules']>[string];

const platform = getPlatform();
const shellName = getScriptName();
const isWin = platform === 'win32';

// ============================================================================
// 基础概念类（alwaysLoad）
// ============================================================================


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
// 搜索工具详解
// ============================================================================

const SEARCH_DOCS: Record<string, SkillRule> = {
    'fs-glob-usage': {
        desc: 'fs-Glob 文件名搜索用法与示例',
        when: '需要按文件名或扩展名搜索文件时',
        prompt: `
## fs-Glob 用法

按文件名/路径模式搜索，底层调用系统命令（Unix: find, Windows: Get-ChildItem）。

**参数**:
- \`path\`: 搜索根目录
- \`pattern\`: 文件名模式（通配符），如 \`"*.ts"\`, \`"test_*.py"\`, \`"README*"\`
- \`maxDepth\`: 最大搜索深度，默认 10
- \`type\`: \`"file"\`（默认）/ \`"dir"\` / \`"all"\`
- \`maxResults\`: 最大结果数，默认 100

**示例**:
\`\`\`json
// 查找所有 TypeScript 文件
{ "path": "/project/src", "pattern": "*.ts" }

// 查找测试文件，限制深度
{ "path": "/project", "pattern": "test_*", "maxDepth": 5 }

// 查找目录
{ "path": "/home", "pattern": "node_modules", "type": "dir", "maxDepth": 3 }
\`\`\`

返回相对路径列表。
`.trim()
    },

    'fs-grep-usage': {
        desc: 'fs-Grep 内容搜索用法与示例',
        when: '需要在文件内容中搜索文本或正则时',
        prompt: `
## fs-Grep 用法

在文件内容中搜索，底层调用系统命令（Unix: grep -rn, Windows: Select-String）。

**参数**:
- \`path\`: 搜索根目录
- \`pattern\`: 搜索模式（文本或正则）
- \`include\`: 文件名过滤，如 \`"*.ts"\`
- \`regex\`: 是否为正则表达式，默认 false（纯文本匹配）
- \`caseSensitive\`: 区分大小写，默认 false
- \`contextLines\`: 上下文行数，默认 0
- \`maxResults\`: 最大结果数，默认 50

**示例**:
\`\`\`json
// 在 TypeScript 文件中搜索函数名
{ "path": "/project/src", "pattern": "createFileSystem", "include": "*.ts" }

// 正则搜索 + 上下文
{ "path": "/project", "pattern": "TODO|FIXME|HACK", "regex": true, "contextLines": 2 }

// 大小写敏感搜索
{ "path": "/project", "pattern": "className", "include": "*.tsx", "caseSensitive": true }
\`\`\`

自动排除 node_modules/.git/dist 等目录。返回格式：\`文件:行号:内容\`。
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
// Shell 操作详解
// ============================================================================

const WIN_COMMANDS = [
    'New-Item', 'Copy-Item', 'Move-Item', 'Remove-Item', 'Rename-Item',
    'Get-Item', 'Get-ChildItem', 'Get-Content', 'Set-Content',
    'Test-Path', 'Resolve-Path', 'Split-Path', 'Join-Path',
    'Compress-Archive', 'Expand-Archive', 'Get-FileHash',
    'mkdir', 'cp', 'copy', 'mv', 'move', 'rm', 'del', 'rmdir', 'cat', 'type', 'dir', 'ls'
];

const UNIX_COMMANDS = [
    'mkdir', 'cp', 'mv', 'rm', 'rmdir', 'touch', 'ln', 'chmod',
    'tar', 'zip', 'unzip', 'gzip', 'gunzip',
    'cat', 'head', 'tail', 'wc', 'diff', 'stat', 'file',
    'sort', 'uniq', 'cut', 'tr', 'sed', 'awk',
    'ls', 'tree', 'du', 'df', 'find',
    'basename', 'dirname', 'realpath', 'readlink'
];

const fileOpsPrompt = isWin ? `
## fs-FileOps 命令白名单（${shellName}）

### 允许的命令
${WIN_COMMANDS.join(', ')}

### 语法注意
使用 **PowerShell 语法**编写命令。参数用 \`-ParameterName\` 格式。

### 常用操作示例

**创建目录**:
\`\`\`powershell
mkdir 'new_folder'
New-Item -Path 'path/to/dir' -ItemType Directory -Force
\`\`\`

**复制文件/目录**:
\`\`\`powershell
Copy-Item -Path 'src' -Destination 'backup' -Recurse
cp 'file.txt' 'file.bak'
\`\`\`

**移动/重命名**:
\`\`\`powershell
Move-Item -Path 'old.txt' -Destination 'new.txt'
mv 'folder1' 'folder2'
\`\`\`

**删除文件/目录**:
\`\`\`powershell
Remove-Item -Path 'file.txt'
Remove-Item -Path 'folder' -Recurse -Force
rm 'temp/*'
\`\`\`

**压缩/解压**:
\`\`\`powershell
Compress-Archive -Path 'src' -DestinationPath 'backup.zip'
Expand-Archive -Path 'archive.zip' -DestinationPath 'output'
\`\`\`

**查看/统计**:
\`\`\`powershell
Get-ChildItem -Path '.' -Recurse | Measure-Object
Get-Content 'file.txt' | Select-Object -First 10
\`\`\`

### 安全限制
- 首个命令词必须在白名单中
- 不允许执行任意脚本或下载命令
- 命令在 \`directory\` 参数指定的目录下执行
`.trim() : `
## fs-FileOps 命令白名单（${shellName}）

### 允许的命令
${UNIX_COMMANDS.join(', ')}

### 语法注意
使用 **Bash 语法**编写命令。参数用 \`-flag\` 或 \`--option\` 格式。

### 常用操作示例

**创建目录**:
\`\`\`bash
mkdir new_folder
mkdir -p path/to/nested/dir
\`\`\`

**复制文件/目录**:
\`\`\`bash
cp file.txt file.bak
cp -r src/ backup/
\`\`\`

**移动/重命名**:
\`\`\`bash
mv old.txt new.txt
mv folder1/ folder2/
\`\`\`

**删除文件/目录**:
\`\`\`bash
rm file.txt
rm -rf temp_folder/
\`\`\`

**改权限**:
\`\`\`bash
chmod 755 script.sh
chmod -R 644 *.txt
\`\`\`

**压缩/解压**:
\`\`\`bash
tar -czf backup.tar.gz src/
tar -xzf archive.tar.gz
zip -r backup.zip src/
unzip archive.zip -d output/
\`\`\`

**查看/统计**:
\`\`\`bash
ls -lah
find . -name '*.log' -mtime +7
du -sh *
\`\`\`

**文本处理**:
\`\`\`bash
cat file.txt | head -n 10
sort data.txt | uniq -c
sed 's/old/new/g' file.txt
\`\`\`

### 安全限制
- 首个命令词必须在白名单中
- 不允许执行任意脚本或下载命令
- 命令在 \`directory\` 参数指定的目录下执行
`.trim();

const SHELL_DOCS: Record<string, SkillRule> = {
    'fs-fileops-commands': {
        desc: 'FileOps 命令白名单与常用操作',
        when: '需要使用 fs-FileOps 进行文件操作时',
        prompt: fileOpsPrompt
    },
};

// ============================================================================
// 导出合并后的规则集
// ============================================================================

export const fileSystemSkillRules: ToolGroup['declareSkillRules'] = {
    // ...BASICS,
    ...VIEWER_DOCS,
    ...SEARCH_DOCS,
    ...EDITOR_DOCS,
    ...SHELL_DOCS,
};
