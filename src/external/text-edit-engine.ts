/**
 * ============================================
 * Edit Engine - 智能代码编辑引擎
 * ============================================
 *
 * 核心能力：
 * 1. SEARCH/REPLACE 编辑算法
 * 2. Unified Diff 编辑算法
 *
 * 特点：
 * - 基于内容匹配（不依赖行号）
 * - 智能容错（支持空格/格式差异）
 * - 冲突检测
 * - 详细的错误报告
 *
 * 适用场景：
 * - AI 辅助代码编辑
 * - 自动化代码重构
 * - 补丁应用系统
 * - 批量代码修改
 * ============================================
 */

// ============================================================
// 公共类型
// ============================================================

/** 编辑选项 */
export interface EditOptions {
    /** 搜索范围（1-based 行号） */
    withinRange?: {
        startLine?: number;
        endLine?: number;
    };
}

/** 编辑结果 */
export interface EditResult {
    /** 是否成功 */
    success: boolean;
    /** 编辑后的内容 */
    content?: string;
    /** 错误信息 */
    error?: string;
    /** 编辑统计 */
    stats?: {
        blocksApplied: number;
        linesRemoved: number;
        linesAdded: number;
        changes: ChangeInfo[];
    };
}

/** 单次变更信息 */
export interface ChangeInfo {
    /** 起始行号（1-based） */
    startLine: number;
    /** 删除行数 */
    removed: number;
    /** 新增行数 */
    added: number;
    /** 匹配类型 */
    matchType: 'exact' | 'normalized' | 'fuzzy';
}

/** SEARCH/REPLACE 块 */
export interface SearchReplaceBlock {
    search: string;
    replace: string;
}

// ============================================================
// 内部类型
// ============================================================

interface MatchResult {
    found: boolean;
    startIdx: number;
    endIdx: number;
    matchType: 'exact' | 'normalized' | 'fuzzy';
    confidence: number;
}

interface DiffHunk {
    header?: string;
    oldContent: string[];
    newContent: string[];
}

interface RangeSpec {
    startLine?: number;
    endLine?: number;
}

// ============================================================
// 核心编辑算法 API
// ============================================================

/**
 * 应用 SEARCH/REPLACE 编辑
 *
 * @param fileContent - 文件内容（字符串）
 * @param blocks - SEARCH/REPLACE 块（可以是多个块）
 * @param options - 编辑选项
 * @returns 编辑结果
 *
 * @example
 * const result = applySearchReplace(fileContent, [
 *   { search: "old code", replace: "new code" }
 * ]);
 *
 * if (result.success) {
 *   console.log("编辑成功:", result.stats);
 *   fs.writeFileSync("file.txt", result.content);
 * } else {
 *   console.error("编辑失败:", result.error);
 * }
 */
export function applySearchReplace(
    fileContent: string,
    blocks: SearchReplaceBlock[],
    options?: EditOptions
): EditResult {
    if (!blocks || blocks.length === 0) {
        return {
            success: false,
            error: '没有提供 SEARCH/REPLACE 块'
        };
    }

    try {
        let lines = fileContent.split('\n');
        const operations: Array<{
            block: SearchReplaceBlock;
            match: MatchResult;
        }> = [];

        // === 第一步：匹配所有块 ===
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const searchLines = block.search.split('\n');
            const result = findUniqueMatch(lines, searchLines, options?.withinRange);

            if (result.error) {
                return {
                    success: false,
                    error: `Block #${i + 1} 匹配失败：${result.error}\n\n搜索内容前 3 行：\n${searchLines.slice(0, 3).join('\n')}`
                };
            }

            operations.push({ block, match: result.match! });
        }

        // === 第二步：检测冲突 ===
        operations.sort((a, b) => b.match.startIdx - a.match.startIdx);
        for (let i = 1; i < operations.length; i++) {
            const prev = operations[i - 1];
            const curr = operations[i];
            if (curr.match.endIdx > prev.match.startIdx) {
                return {
                    success: false,
                    error: `Block 操作范围重叠：第 ${curr.match.startIdx + 1}-${curr.match.endIdx} 行与第 ${prev.match.startIdx + 1}-${prev.match.endIdx} 行`
                };
            }
        }

        // === 第三步：应用编辑 ===
        const changes: ChangeInfo[] = [];
        let totalRemoved = 0;
        let totalAdded = 0;

        for (const op of operations) {
            const replaceLines = op.block.replace.split('\n');
            const removed = op.match.endIdx - op.match.startIdx;
            const added = replaceLines.length;

            lines.splice(op.match.startIdx, removed, ...replaceLines);

            totalRemoved += removed;
            totalAdded += added;

            changes.push({
                startLine: op.match.startIdx + 1,
                removed,
                added,
                matchType: op.match.matchType
            });
        }

        return {
            success: true,
            content: lines.join('\n'),
            stats: {
                blocksApplied: blocks.length,
                linesRemoved: totalRemoved,
                linesAdded: totalAdded,
                changes
            }
        };

    } catch (error: any) {
        return {
            success: false,
            error: `编辑失败: ${error.message}`
        };
    }
}

/**
 * 应用 Unified Diff 编辑
 *
 * @param fileContent - 文件内容（字符串）
 * @param diff - Unified diff 格式文本
 * @param options - 编辑选项
 * @returns 编辑结果
 *
 * @example
 * const diff = `
 * @@ -10,3 +10,3 @@
 *  function foo() {
 * -  return 1;
 * +  return 2;
 *  }
 * `;
 *
 * const result = applyDiff(fileContent, diff);
 * if (result.success) {
 *   console.log("Diff 应用成功");
 *   fs.writeFileSync("file.txt", result.content);
 * }
 */
export function applyDiff(
    fileContent: string,
    diff: string,
    options?: EditOptions
): EditResult {
    try {
        let lines = fileContent.split('\n');
        const hunks = parseUnifiedDiffRelaxed(diff);

        if (hunks.length === 0) {
            return {
                success: false,
                error: '未找到有效的 diff hunk（需要 @@ 标记）'
            };
        }

        // === 第一步：匹配所有 hunk ===
        const operations: Array<{
            hunk: DiffHunk;
            match: MatchResult;
        }> = [];

        for (let i = 0; i < hunks.length; i++) {
            const hunk = hunks[i];

            if (hunk.oldContent.length === 0) {
                return {
                    success: false,
                    error: `Hunk #${i + 1} 没有旧内容，无法定位`
                };
            }

            const result = findUniqueMatch(lines, hunk.oldContent, options?.withinRange);
            if (result.error) {
                return {
                    success: false,
                    error: `Hunk #${i + 1} 匹配失败：${result.error}\n\n旧内容前 3 行：\n${hunk.oldContent.slice(0, 3).join('\n')}`
                };
            }

            operations.push({ hunk, match: result.match! });
        }

        // === 第二步：检测冲突 ===
        operations.sort((a, b) => b.match.startIdx - a.match.startIdx);
        for (let i = 1; i < operations.length; i++) {
            const prev = operations[i - 1];
            const curr = operations[i];
            if (curr.match.endIdx > prev.match.startIdx) {
                return {
                    success: false,
                    error: 'Hunk 操作范围重叠'
                };
            }
        }

        // === 第三步：应用编辑 ===
        const changes: ChangeInfo[] = [];
        let totalRemoved = 0;
        let totalAdded = 0;

        for (const op of operations) {
            const removed = op.match.endIdx - op.match.startIdx;
            const added = op.hunk.newContent.length;

            lines.splice(op.match.startIdx, removed, ...op.hunk.newContent);

            totalRemoved += removed;
            totalAdded += added;

            changes.push({
                startLine: op.match.startIdx + 1,
                removed,
                added,
                matchType: op.match.matchType
            });
        }

        return {
            success: true,
            content: lines.join('\n'),
            stats: {
                blocksApplied: hunks.length,
                linesRemoved: totalRemoved,
                linesAdded: totalAdded,
                changes
            }
        };

    } catch (error: any) {
        return {
            success: false,
            error: `Diff 应用失败: ${error.message}`
        };
    }
}

/**
 * 解析 SEARCH/REPLACE 块文本
 *
 * @param text - 包含 SEARCH/REPLACE 块的文本
 * @returns 解析出的块数组
 *
 * @example
 * const text = `
 * <<<<<<< SEARCH
 * old code
 * =======
 * new code
 * >>>>>>> REPLACE
 * `;
 * const blocks = parseSearchReplaceBlocks(text);
 */
export function parseSearchReplaceBlocks(text: string): SearchReplaceBlock[] {
    const blocks: SearchReplaceBlock[] = [];
    const blockRegex = /<<<<<<<?(?:\s*SEARCH)?\s*\n([\s\S]*?)\n?={4,}\s*\n([\s\S]*?)\n?>>>>>>>?(?:\s*REPLACE)?/g;

    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        blocks.push({
            search: match[1].replace(/^\n+|\n+$/g, ''),
            replace: match[2].replace(/^\n+|\n+$/g, '')
        });
    }

    return blocks;
}

// ============================================================
// 内部实现：匹配算法
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
// 默认导出
// ============================================================

export default {
    applySearchReplace,
    applyDiff,
    parseSearchReplaceBlocks
};
