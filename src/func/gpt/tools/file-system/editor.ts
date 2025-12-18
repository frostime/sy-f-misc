/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-15 01:22:12
 * @Description  : VFS-based editor tools (SearchReplace, ApplyDiff, ReplaceLine, WriteFile)
 * @FilePath     : /src/func/gpt/tools/file-system/editor-vfs.ts
 * @LastEditTime : 2025-12-15 02:18:59
 */

import { VFSManager } from '@/libs/vfs';
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

// ============================================================
// 类型定义
// ============================================================

interface SearchReplaceBlock {
    search: string;
    replace: string;
}

interface DiffHunk {
    header?: string;
    oldContent: string[];
    newContent: string[];
}

interface MatchResult {
    found: boolean;
    startIdx: number;
    endIdx: number;
    matchType: 'exact' | 'normalized' | 'fuzzy';
    confidence: number;
}

interface RangeSpec {
    startLine?: number;
    endLine?: number;
}

// ============================================================
// 核心匹配算法
// ============================================================

function normalizeForMatch(s: string): string {
    return s
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, '  ')
        .replace(/\s+$/gm, '')
        .replace(/[ ]+/g, ' ')
        .trim();
}

function similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const lenDiff = Math.abs(a.length - b.length);
    const maxLen = Math.max(a.length, b.length);

    if (lenDiff / maxLen > 0.2) {
        return 0.5;
    }

    if (maxLen > 500) {
        const aWords = new Set(a.split(/\s+/));
        const bWords = new Set(b.split(/\s+/));
        const intersection = [...aWords].filter(w => bWords.has(w)).length;
        const union = new Set([...aWords, ...bWords]).size;
        return union > 0 ? intersection / union : 0;
    }

    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        let minInRow = Infinity;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
            minInRow = Math.min(minInRow, matrix[i][j]);
        }
        if (minInRow > maxLen * 0.15) {
            return 1 - minInRow / maxLen;
        }
    }

    const distance = matrix[a.length][b.length];
    return 1 - distance / maxLen;
}

function findBlockInLines(
    fileLines: string[],
    searchLines: string[],
    range?: RangeSpec
): MatchResult[] {
    const results: MatchResult[] = [];

    const startLine = Math.max(0, (range?.startLine ?? 1) - 1);
    const endLine = Math.min(fileLines.length, range?.endLine ?? fileLines.length);

    const searchText = searchLines.join('\n');
    const searchNormalized = normalizeForMatch(searchText);
    const searchLen = searchLines.length;

    if (searchLen === 0) return results;

    let hasExactOrNormalized = false;

    for (let i = startLine; i <= endLine - searchLen; i++) {
        const windowLines = fileLines.slice(i, i + searchLen);
        const windowText = windowLines.join('\n');

        if (windowText === searchText) {
            results.push({
                found: true,
                startIdx: i,
                endIdx: i + searchLen,
                matchType: 'exact',
                confidence: 1.0
            });
            hasExactOrNormalized = true;
            continue;
        }

        const windowNormalized = normalizeForMatch(windowText);
        if (windowNormalized === searchNormalized) {
            results.push({
                found: true,
                startIdx: i,
                endIdx: i + searchLen,
                matchType: 'normalized',
                confidence: 0.95
            });
            hasExactOrNormalized = true;
        }
    }

    if (hasExactOrNormalized) {
        results.sort((a, b) => b.confidence - a.confidence);
        return results;
    }

    if (searchLines.length >= 3) {
        for (let i = startLine; i <= endLine - searchLen; i++) {
            const windowLines = fileLines.slice(i, i + searchLen);
            const windowText = windowLines.join('\n');
            const windowNormalized = normalizeForMatch(windowText);

            const sim = similarity(windowNormalized, searchNormalized);
            if (sim > 0.92) {
                results.push({
                    found: true,
                    startIdx: i,
                    endIdx: i + searchLen,
                    matchType: 'fuzzy',
                    confidence: sim
                });
            }
        }
    }

    results.sort((a, b) => b.confidence - a.confidence);

    const seen = new Set<number>();
    const dedupedResults: MatchResult[] = [];
    for (const r of results) {
        if (!seen.has(r.startIdx)) {
            seen.add(r.startIdx);
            dedupedResults.push(r);
        }
    }

    return dedupedResults;
}

function findUniqueMatch(
    fileLines: string[],
    searchLines: string[],
    range?: RangeSpec
): { match: MatchResult | null; error?: string } {
    const matches = findBlockInLines(fileLines, searchLines, range);

    if (matches.length === 0) {
        return { match: null, error: '未找到匹配的代码块' };
    }

    const acceptableMatches = matches.filter(m => m.confidence >= 0.95);

    if (acceptableMatches.length === 0) {
        const bestMatch = matches[0];
        const matchedLines = fileLines.slice(bestMatch.startIdx, bestMatch.endIdx);

        return {
            match: null,
            error: `未找到精确匹配，但在第 ${bestMatch.startIdx + 1} 行发现相似代码（相似度 ${(bestMatch.confidence * 100).toFixed(1)}%）：\n\n${matchedLines.join('\n')}\n\n请先用 ReadFile 查看文件，然后使用实际的代码内容重新提交。`
        };
    }

    if (acceptableMatches.length > 1) {
        const locations = acceptableMatches
            .map(m => `第 ${m.startIdx + 1} 行`)
            .join(', ');
        return {
            match: null,
            error: `发现 ${acceptableMatches.length} 个匹配位置（${locations}），无法确定修改哪一个。请增加上下文或使用 withinRange 缩小范围。`
        };
    }

    return { match: acceptableMatches[0] };
}

function parseSearchReplaceBlocks(text: string): SearchReplaceBlock[] {
    const blocks: SearchReplaceBlock[] = [];

    const blockRegex = /<<<<<<<?(?:\s*SEARCH)?\s*\n([\s\S]*?)\n?={4,}\s*\n([\s\S]*?)\n?>>>>>>>?(?:\s*REPLACE)?/g;

    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        const search = match[1];
        const replace = match[2];

        blocks.push({
            search: search.replace(/^\n+|\n+$/g, ''),
            replace: replace.replace(/^\n+|\n+$/g, '')
        });
    }

    return blocks;
}

function parseUnifiedDiffRelaxed(diffText: string): DiffHunk[] {
    const lines = diffText.split('\n');
    const hunks: DiffHunk[] = [];
    let current: DiffHunk | null = null;

    const startNewHunk = () => {
        if (current) {
            hunks.push(current);
        }
        current = { header: '', oldContent: [], newContent: [] };
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('@@')) {
            startNewHunk();
            current!.header = line;
            continue;
        }

        if (!current) {
            continue;
        }

        if (line.startsWith('+')) {
            current.newContent.push(line.slice(1));
        } else if (line.startsWith('-')) {
            current.oldContent.push(line.slice(1));
        } else {
            current.oldContent.push(line.startsWith(' ') ? line.slice(1) : line);
            current.newContent.push(line.startsWith(' ') ? line.slice(1) : line);
        }
    }

    if (current && (current.oldContent.length > 0 || current.newContent.length > 0)) {
        hunks.push(current);
    }

    for (const hunk of hunks) {
        while (hunk.oldContent.length > 0 && hunk.oldContent[hunk.oldContent.length - 1] === '') {
            hunk.oldContent.pop();
        }
        while (hunk.newContent.length > 0 && hunk.newContent[hunk.newContent.length - 1] === '') {
            hunk.newContent.pop();
        }
    }

    return hunks;
}

// ============================================================
// 工具工厂
// ============================================================

export function createEditorTools(vfs: VFSManager): Tool[] {
    const searchReplaceTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs-SearchReplace',
                description: '基于内容匹配的代码替换工具。格式为 SEARCH/REPLACE 块，支持批量操作。详见使用指南。',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: '文件路径'
                        },
                        blocks: {
                            type: 'string',
                            description: '一个或多个 SEARCH/REPLACE 块（格式见使用指南）'
                        },
                        withinRange: {
                            type: 'object',
                            description: '可选，限定搜索范围（行号 1-based）',
                            properties: {
                                startLine: { type: 'number', description: '起始行号' },
                                endLine: { type: 'number', description: '结束行号' }
                            }
                        }
                    },
                    required: ['path', 'blocks']
                }
            },
            permissionLevel: ToolPermissionLevel.SENSITIVE,
            requireResultApproval: true
        },

        execute: async (args: {
            path: string;
            blocks: string;
            withinRange?: RangeSpec;
        }): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
            }

            const { fs, path } = vfs.route(args.path);
            const filePath = fs.resolve(path);
            if (!await fs.exists(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
            }

            try {
                const content = await fs.readFile(filePath);
                let lines = content.split('\n');

                const blocks = parseSearchReplaceBlocks(args.blocks);
                if (blocks.length === 0) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: '未找到有效的 SEARCH/REPLACE 块。格式：<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE'
                    };
                }

                const operations: Array<{
                    block: SearchReplaceBlock;
                    match: MatchResult;
                }> = [];

                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i];
                    const searchLines = block.search.split('\n');
                    const result = findUniqueMatch(lines, searchLines, args.withinRange);

                    if (result.error) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `Block #${i + 1} 匹配失败：${result.error}\n\n搜索内容前 3 行：\n${searchLines.slice(0, 3).join('\n')}`
                        };
                    }

                    operations.push({ block, match: result.match! });
                }

                operations.sort((a, b) => b.match.startIdx - a.match.startIdx);
                for (let i = 1; i < operations.length; i++) {
                    const prev = operations[i - 1];
                    const curr = operations[i];
                    if (curr.match.endIdx > prev.match.startIdx) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `Block 操作范围重叠：第 ${curr.match.startIdx + 1}-${curr.match.endIdx} 行与第 ${prev.match.startIdx + 1}-${prev.match.endIdx} 行`
                        };
                    }
                }

                const changes: string[] = [];
                for (const op of operations) {
                    const replaceLines = op.block.replace.split('\n');
                    const removed = op.match.endIdx - op.match.startIdx;
                    const added = replaceLines.length;

                    lines.splice(op.match.startIdx, removed, ...replaceLines);

                    changes.push(
                        `行 ${op.match.startIdx + 1}: -${removed} +${added} (${op.match.matchType})`
                    );
                }

                await fs.writeFile(filePath, lines.join('\n'));

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        file: fs.basename(filePath),
                        blocksApplied: blocks.length,
                        changes
                    }
                };

            } catch (error: any) {
                return { status: ToolExecuteStatus.ERROR, error: `替换失败: ${error.message}` };
            }
        },

        formatForLLM: (data: any) => {
            return `✓ ${data.file}: 应用了 ${data.blocksApplied} 个替换块\n${data.changes.join('\n')}`;
        }
    };

    const applyDiffTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs-ApplyDiff',
                description: '应用 Unified Diff 格式补丁。基于内容匹配，header 行号可随意填写。详见使用指南。',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: '文件路径'
                        },
                        diff: {
                            type: 'string',
                            description: 'Unified diff 内容（可包含多个 @@ hunk）'
                        },
                        withinRange: {
                            type: 'object',
                            description: '可选，限定搜索范围（行号 1-based）',
                            properties: {
                                startLine: { type: 'number' },
                                endLine: { type: 'number' }
                            }
                        }
                    },
                    required: ['path', 'diff']
                }
            },
            permissionLevel: ToolPermissionLevel.SENSITIVE,
            requireResultApproval: true
        },

        execute: async (args: {
            path: string;
            diff: string;
            withinRange?: RangeSpec;
        }): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
            }

            const { fs, path } = vfs.route(args.path);
            const filePath = fs.resolve(path);
            if (!await fs.exists(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
            }

            try {
                const content = await fs.readFile(filePath);
                let lines = content.split('\n');

                const hunks = parseUnifiedDiffRelaxed(args.diff);
                if (hunks.length === 0) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: '未找到有效的 diff hunk（需要 @@ 标记）'
                    };
                }

                const operations: Array<{
                    hunk: DiffHunk;
                    match: MatchResult;
                }> = [];

                for (let i = 0; i < hunks.length; i++) {
                    const hunk = hunks[i];

                    if (hunk.oldContent.length === 0) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `Hunk #${i + 1} 没有旧内容，无法定位`
                        };
                    }

                    const result = findUniqueMatch(lines, hunk.oldContent, args.withinRange);
                    if (result.error) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: `Hunk #${i + 1} 匹配失败：${result.error}\n\n旧内容前 3 行：\n${hunk.oldContent.slice(0, 3).join('\n')}`
                        };
                    }

                    operations.push({ hunk, match: result.match! });
                }

                operations.sort((a, b) => b.match.startIdx - a.match.startIdx);
                for (let i = 1; i < operations.length; i++) {
                    const prev = operations[i - 1];
                    const curr = operations[i];
                    if (curr.match.endIdx > prev.match.startIdx) {
                        return {
                            status: ToolExecuteStatus.ERROR,
                            error: 'Hunk 操作范围重叠'
                        };
                    }
                }

                const stats = { removed: 0, added: 0 };
                const changes: string[] = [];

                for (const op of operations) {
                    const removed = op.match.endIdx - op.match.startIdx;
                    const added = op.hunk.newContent.length;

                    lines.splice(op.match.startIdx, removed, ...op.hunk.newContent);

                    stats.removed += removed;
                    stats.added += added;
                    changes.push(
                        `行 ${op.match.startIdx + 1}: -${removed} +${added} (${op.match.matchType})`
                    );
                }

                await fs.writeFile(filePath, lines.join('\n'));

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        file: fs.basename(filePath),
                        hunks: hunks.length,
                        removed: stats.removed,
                        added: stats.added,
                        changes
                    }
                };

            } catch (error: any) {
                return { status: ToolExecuteStatus.ERROR, error: `Diff 应用失败: ${error.message}` };
            }
        },

        formatForLLM: (data: any) => {
            return `✓ ${data.file}: 应用了 ${data.hunks} 个 hunk (-${data.removed} +${data.added})\n${data.changes.join('\n')}`;
        }
    };

    const replaceLineTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs-ReplaceLine',
                description: '快速替换单行内容（需提供原始内容验证）。适用于简单的单行修改。',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '文件路径' },
                        line: { type: 'number', description: '行号（1-based）', minimum: 1 },
                        expected: { type: 'string', description: '当前行的期望内容（用于验证）' },
                        newContent: { type: 'string', description: '新的行内容' }
                    },
                    required: ['path', 'line', 'expected', 'newContent']
                }
            },
            permissionLevel: ToolPermissionLevel.SENSITIVE,
            requireResultApproval: true
        },

        execute: async (args: {
            path: string;
            line: number;
            expected: string;
            newContent: string;
        }): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: 'FS not available' };
            }

            const { fs, path } = vfs.route(args.path);
            const filePath = fs.resolve(path);
            if (!await fs.exists(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
            }

            try {
                const content = await fs.readFile(filePath);
                const lines = content.split('\n');
                const idx = args.line - 1;

                if (idx < 0 || idx >= lines.length) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `行号越界: 文件有 ${lines.length} 行，请求第 ${args.line} 行`
                    };
                }

                const normalize = (s: string) => s.trim().replace(/\s+/g, ' ');
                if (normalize(lines[idx]) !== normalize(args.expected)) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `第 ${args.line} 行内容不匹配\n期望: "${args.expected}"\n实际: "${lines[idx]}"`
                    };
                }

                lines[idx] = args.newContent;
                await fs.writeFile(filePath, lines.join('\n'));

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: { file: fs.basename(filePath), line: args.line }
                };
            } catch (error: any) {
                return { status: ToolExecuteStatus.ERROR, error: error.message };
            }
        },

        formatForLLM: (data: any) => `✓ ${data.file}:${data.line} 已替换`
    };

    const writeFileTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs-WriteFile',
                description: '写入完整文件内容。适用于：(1) 创建新文件 (2) 大规模重写（>50% 变更）',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '文件路径' },
                        content: { type: 'string', description: '完整的文件内容' },
                        mode: {
                            type: 'string',
                            enum: ['append', 'overwrite', 'create'],
                            description: '写入模式：create（默认，文件存在报错）、overwrite（覆盖）、append（追加）'
                        }
                    },
                    required: ['path', 'content']
                }
            },
            permissionLevel: ToolPermissionLevel.SENSITIVE,
            requireResultApproval: true
        },

        execute: async (args: {
            path: string;
            content: string;
            mode?: 'append' | 'overwrite' | 'create';
        }): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
            }

            const mode = args.mode || 'create';

            try {
                const { fs, path } = vfs.route(args.path);
                const filePath = fs.resolve(path);
                const exists = await fs.exists(filePath);

                if (mode === 'create' && exists) {
                    return { status: ToolExecuteStatus.ERROR, error: `文件已存在: ${filePath}，请使用 mode: 'overwrite'` };
                }

                let content = args.content;
                if (mode === 'append' && exists) {
                    const existing = await fs.readFile(filePath);
                    content = existing + '\n' + args.content;
                }

                await fs.writeFile(filePath, content);

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        file: fs.basename(filePath),
                        lines: content.split('\n').length,
                        bytes: new TextEncoder().encode(content).length,
                        mode
                    }
                };
            } catch (error: any) {
                return { status: ToolExecuteStatus.ERROR, error: error.message };
            }
        },

        formatForLLM: (data: any) => `✓ ${data.file}: 已写入 ${data.lines} 行 (${data.bytes} bytes, mode=${data.mode})`
    };

    return [searchReplaceTool, applyDiffTool, replaceLineTool, writeFileTool];
}

export const editorToolsRulePrompt = `
## 文件编辑工具使用指南

### 工具选择策略

| 场景 | 推荐工具 | 说明 |
|------|----------|------|
| 修改 1-3 处代码 | SearchReplace | 最可靠，基于内容匹配；可能更消耗 Token |
| 熟悉 diff 格式 | ApplyDiff | 同样基于内容匹配，忽略 header 行号 |
| 单行微调 | ReplaceLine | 最快，但需要知道行号 |
| 新建文件/大改 | WriteFile | 超过 50% 变更时使用 |


### ApplyDiff 工具

**格式**：
\`\`\`diff
@@ ... @@
 function foo() {
   const x = 1;
-  return x + 1;
+  return x + 2;
 }
\`\`\`

**要点**：
- Header 写 \`@@ ... @@\` 即可，无需计算行号
- 上下文行（空格开头）建议 3-5 行
- 工具通过内容自动定位

### SearchReplace 工具

**格式**：
\`\`\`
<<<<<<< SEARCH
// 包含 3-5 行上下文
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

**关键规则**：
1. SEARCH 必须是文件中**实际存在**的代码（精确匹配）
2. 包含 3-5 行上下文确保唯一性
3. 多处修改写多个 SEARCH/REPLACE 块
4. REPLACE 留空表示删除

**重复代码处理**：
- 使用 \`withinRange: { startLine: 100, endLine: 200 }\`
- 或增加更多上下文行


### 错误处理流程

**错误类型 1：未找到匹配**
- 原因：SEARCH 内容与文件不符
- 处理：先用 ReadFile 查看实际内容，复制粘贴到 SEARCH

**错误类型 2：发现相似代码（非精确匹配）**
- 工具会显示相似代码的位置和内容
- **必须**先用 ReadFile 查看文件
- 用文件中的实际代码重新提交
- **禁止**凭记忆修改或猜测内容

**错误类型 3：多个匹配位置**
- 增加上下文行（如改为 5-7 行）
- 或使用 withinRange 限定范围

### 最佳实践

✅ **推荐做法**：
- 不确定时先 ReadFile 确认
- 复制文件中的真实代码到 SEARCH
- 保持充足的上下文（3-5 行）

❌ **避免错误**：
- 凭记忆猜测代码内容
- SEARCH 内容有空格/注释差异
- 只写要改的那一行，无上下文
`.trim();
