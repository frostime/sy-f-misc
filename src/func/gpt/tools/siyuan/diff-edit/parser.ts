/**
 * Block Diff 解析器
 *
 * 解析基于 @@{id}@@ 锚定的 Unified Diff 格式
 */

import type { BlockEdit, ParsedHunk, ParseOptions, EditType } from './types';

/**
 * 校验思源笔记块 ID 格式
 * 格式：yyyyMMddHHmmss-xxxxxxx (14位数字-7位小写字母数字)
 */
function validateBlockId(id: string): boolean {
    return /^\d{14}-[a-z0-9]{7}$/.test(id);
}

/**
 * 格式化 ID 错误信息
 */
function formatIdError(id: string, context: string): string {
    return `${context}: 无效的块 ID "${id}"\n` +
           `块 ID 格式应为：yyyyMMddHHmmss-xxxxxxx\n` +
           `示例：20260108164554-m5ar6vb`;
}


/**
 * 解析 Block Diff 文本为编辑操作列表
 *
 * @param diffText 完整的 diff 文本
 * @param options 解析选项
 * @returns 编辑操作列表
 */
export function parseBlockDiff(diffText: string, options: ParseOptions = {}): BlockEdit[] {
    const hunks = splitIntoHunks(diffText);
    const edits: BlockEdit[] = [];
    const errors: string[] = [];

    for (const hunkText of hunks) {
        try {
            const parsed = parseHunk(hunkText);
            if (!parsed) {
                errors.push(`无法解析 hunk: ${hunkText.split('\n')[0]}`);
                continue;
            }

            const edit = hunkToEdit(parsed, options);
            if (edit) {
                edits.push(edit);
            }
        } catch (error) {
            // 收集所有错误，最后一起抛出
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }

    if (errors.length > 0) {
        throw new Error(`Diff 解析失败:\n${errors.join('\n')}`);
    }

    return edits;
}


/**
 * 将 diff 文本按 hunk 分割
 */
export function splitIntoHunks(diffText: string): string[] {
    // 按 @@...@@ 模式分割，保留分隔符
    const parts = diffText.split(/(?=@@[\w:-]+@@)/);

    return parts
        .map(p => p.trim())
        .filter(p => p.startsWith('@@'));
}

/**
 * 解析单个 hunk
 */
export function parseHunk(hunkText: string): ParsedHunk | null {
    const lines = hunkText.split('\n');
    if (lines.length === 0) return null;

    // 解析头部: @@[MODIFIER:]blockId@@[类型标签]
    const headerLine = lines[0];
    const headerMatch = headerLine.match(
        /^@@(BEFORE:|AFTER:|PREPEND:|APPEND:)?([a-z0-9-]+)@@(.*)$/i
    );

    if (!headerMatch) {
        return null;
    }

    const modifier = headerMatch[1]?.replace(':', '').toUpperCase() || null;
    const blockId = headerMatch[2];
    const typeLabel = headerMatch[3]?.trim() || undefined;

    if (!validateBlockId(blockId)) {
        throw new Error(formatIdError(blockId, `解析 hunk 失败`));
    }

    // 收集各类行
    const minusLines: string[] = [];
    const plusLines: string[] = [];
    const contextLines: string[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('-')) {
            // 减号行：去除前缀 '-'，保留后续空格
            minusLines.push(line.slice(1));
        } else if (line.startsWith('+')) {
            // 加号行：去除前缀 '+'，保留后续空格
            plusLines.push(line.slice(1));
        } else if (line.startsWith(' ')) {
            // 上下文行：去除前缀空格
            contextLines.push(line.slice(1));
        } else if (line === '') {
            // 空行：根据位置判断归属
            // 如果前面有 minus 行且没有 plus 行，归入 minus
            // 如果前面有 plus 行，归入 plus
            // 否则归入 context
            if (minusLines.length > 0 && plusLines.length === 0) {
                minusLines.push('');
            } else if (plusLines.length > 0) {
                plusLines.push('');
            } else {
                contextLines.push('');
            }
        }
    }

    return {
        raw: hunkText,
        modifier,
        blockId,
        typeLabel,
        minusLines,
        plusLines,
        contextLines,
    };
}

/**
 * 将解析后的 hunk 转换为编辑操作
 */
export function hunkToEdit(hunk: ParsedHunk, options: ParseOptions = {}): BlockEdit | null {
    const { modifier, blockId, minusLines, plusLines } = hunk;
    const { allowEmptyHunk = false } = options;

    // 合并行内容
    const oldContent = joinLines(minusLines);
    const newContent = joinLines(plusLines);

    // 空 hunk 检查
    if (!oldContent && !newContent && !allowEmptyHunk) {
        return null;
    }

    // 根据修饰符确定类型
    if (modifier) {
        const type = modifier as EditType;
        if (['BEFORE', 'INSERT_BEFORE'].includes(modifier)) {
            return { type: 'INSERT_BEFORE', blockId, newContent };
        }
        if (['AFTER', 'INSERT_AFTER'].includes(modifier)) {
            return { type: 'INSERT_AFTER', blockId, newContent };
        }
        if (modifier === 'PREPEND') {
            return { type: 'PREPEND', blockId, newContent };
        }
        if (modifier === 'APPEND') {
            return { type: 'APPEND', blockId, newContent };
        }
    }

    // 根据 -/+ 行推断类型
    if (oldContent && newContent) {
        // 有旧有新 = UPDATE
        return { type: 'UPDATE', blockId, oldContent, newContent };
    }

    if (oldContent && !newContent) {
        // 只有旧 = DELETE
        return { type: 'DELETE', blockId, oldContent };
    }

    if (!oldContent && newContent) {
        // 只有新 = INSERT_AFTER
        return { type: 'INSERT_AFTER', blockId, newContent };
    }

    return null;
}

/**
 * 合并行数组为字符串，处理尾部空行
 */
function joinLines(lines: string[]): string | undefined {
    if (lines.length === 0) return undefined;

    // 移除尾部空行
    let endIdx = lines.length - 1;
    while (endIdx >= 0 && lines[endIdx] === '') {
        endIdx--;
    }

    if (endIdx < 0) return undefined;

    return lines.slice(0, endIdx + 1).join('\n');
}

/**
 * 校验 oldContent 是否匹配实际块内容
 *
 * @param actual 实际块内容
 * @param expected diff 中声明的旧内容
 * @param strict 是否严格匹配
 */
export function validateOldContent(
    actual: string,
    expected: string,
    strict: boolean = false
): boolean {
    if (strict) {
        return actual.trim() === expected.trim();
    }

    // 宽松匹配：忽略空白差异
    const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();
    return normalizeWs(actual) === normalizeWs(expected);
}

/**
 * 格式化编辑操作为可读字符串
 */
export function formatEdit(edit: BlockEdit): string {
    const { type, blockId, oldContent, newContent } = edit;

    switch (type) {
        case 'UPDATE':
            return `UPDATE ${blockId}: "${truncate(oldContent!, 30)}" → "${truncate(newContent!, 30)}"`;
        case 'DELETE':
            return `DELETE ${blockId}: "${truncate(oldContent!, 50)}"`;
        case 'INSERT_AFTER':
            return `INSERT_AFTER ${blockId}: "${truncate(newContent!, 50)}"`;
        case 'INSERT_BEFORE':
            return `INSERT_BEFORE ${blockId}: "${truncate(newContent!, 50)}"`;
        case 'PREPEND':
            return `PREPEND ${blockId}: "${truncate(newContent!, 50)}"`;
        case 'APPEND':
            return `APPEND ${blockId}: "${truncate(newContent!, 50)}"`;
        default:
            return `UNKNOWN ${blockId}`;
    }
}

function truncate(str: string, maxLen: number): string {
    const oneLine = str.replace(/\n/g, '\\n');
    if (oneLine.length <= maxLen) return oneLine;
    return oneLine.slice(0, maxLen - 3) + '...';
}
