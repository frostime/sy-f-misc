/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-08 17:58:38
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/parser.ts
 * @LastEditTime : 2026-01-08 22:46:20
 * @Description  : Block Diff 解析器（严格模式）
 */

import type {
    BlockEdit,
    ParsedHunk,
    DiffLine,
    DiffLineType,
    HunkCommand,
    HunkValidation,
    ParseOptions,
    ValidationError,
    ValidationResult
} from './types';

// ============ ID 校验 ============

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

// ============ Hunk 分割 ============

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

// ============ Hunk 解析（严格模式） ============

/**
 * 解析单个 hunk（严格模式：保持行顺序）
 */
export function parseHunk(hunkText: string): ParsedHunk {
    const rawLines = hunkText.split('\n');
    if (rawLines.length === 0) {
        throw new Error('空的 hunk');
    }

    // 解析头部: @@[MODIFIER:|DELETE:|REPLACE:]blockId@@[类型标签]
    const headerLine = rawLines[0];
    const headerMatch = headerLine.match(
        /^@@(DELETE:|REPLACE:|BEFORE:|AFTER:|PREPEND:|APPEND:)?([a-z0-9-]+)@@(.*)$/i
    );

    if (!headerMatch) {
        throw new Error(`无效的 hunk 头部: ${headerLine}`);
    }

    const rawModifier = headerMatch[1]?.replace(':', '').toUpperCase() || null;
    const blockId = headerMatch[2];
    const typeLabel = headerMatch[3]?.trim() || undefined;

    // 校验 ID 格式
    if (!validateBlockId(blockId)) {
        throw new Error(formatIdError(blockId, `解析 hunk 失败`));
    }

    // 判断是否为特殊命令
    let command: HunkCommand = null;
    let modifier: string | null = null;

    if (rawModifier === 'DELETE') {
        command = 'DELETE';
    } else if (rawModifier === 'REPLACE') {
        command = 'REPLACE';
    } else if (rawModifier) {
        modifier = rawModifier;
    }

    // 解析内容行（严格格式要求）
    const lines: DiffLine[] = [];

    for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        const lineNumber = i + 1; // 1-based

        // ===== 严格格式解析 =====
        // 格式要求：前缀 + 一个空格 + 内容
        // - `- ` + content → minus 行
        // - `+ ` + content → plus 行
        // - ` ` + content → context 行
        // 特殊情况：
        // - `-` 单独 → minus 空行（表示删除空行）
        // - `+` 单独 → plus 空行（表示添加空行）
        // - 真正的空行 → context 空行

        if (line.startsWith('- ')) {
            // 减号行：`- ` 开头（减号+一个空格）
            lines.push({ type: 'minus', content: line.slice(2), lineNumber });
        } else if (line === '-') {
            // 减号空行：表示删除一个空行
            lines.push({ type: 'minus', content: '', lineNumber });
        } else if (line.startsWith('-') && line.length > 1) {
            // 减号后面有内容但没有空格 → 格式错误
            throw new Error(
                `第 ${lineNumber} 行格式错误: "${truncateForError(line)}"\n` +
                `减号行必须是 "- " 开头（减号+空格+内容）\n` +
                `如果内容以 "-" 开头（如列表），应写成: "- - 列表项"`
            );
        } else if (line.startsWith('+ ')) {
            // 加号行：`+ ` 开头（加号+一个空格）
            lines.push({ type: 'plus', content: line.slice(2), lineNumber });
        } else if (line === '+') {
            // 加号空行：表示添加一个空行
            lines.push({ type: 'plus', content: '', lineNumber });
        } else if (line.startsWith('+') && line.length > 1) {
            // 加号后面有内容但没有空格 → 格式错误
            throw new Error(
                `第 ${lineNumber} 行格式错误: "${truncateForError(line)}"\n` +
                `加号行必须是 "+ " 开头（加号+空格+内容）\n` +
                `如果内容以 "+" 开头，应写成: "+ + 内容"`
            );
        } else if (line.startsWith(' ')) {
            // 上下文行：一个空格开头
            lines.push({ type: 'context', content: line.slice(1), lineNumber });
        } else if (line === '') {
            // 真正的空行：视为上下文空行
            lines.push({ type: 'context', content: '', lineNumber });
        } else {
            // 无有效前缀 → 格式错误
            throw new Error(
                `第 ${lineNumber} 行格式错误: "${truncateForError(line)}"\n` +
                `每行必须以 "- "、"+ " 或 " "（空格）开头\n` +
                `上下文行请在行首添加一个空格`
            );
        }
    }

    return {
        raw: hunkText,
        modifier,
        command,
        blockId,
        typeLabel,
        lines
    };
}

// ============ Hunk 校验 ============

/**
 * 校验单个 hunk 的内容
 *
 * @param hunk 解析后的 hunk
 * @returns 校验结果
 */
export function validateHunk(hunk: ParsedHunk): HunkValidation {
    const { command, modifier, lines } = hunk;

    // 1. DELETE 命令：不需要内容
    if (command === 'DELETE') {
        return { valid: true };
    }

    // 2. REPLACE 命令：需要 plus 行（新内容）
    if (command === 'REPLACE') {
        const hasPlus = lines.some(l => l.type === 'plus');
        if (!hasPlus) {
            return {
                valid: false,
                error: `REPLACE 操作需要 + 行（新内容）`
            };
        }
        return { valid: true };
    }

    // 3. 位置修饰符（BEFORE, AFTER, PREPEND, APPEND）：需要 plus 行
    if (modifier) {
        const hasPlus = lines.some(l => l.type === 'plus');
        if (!hasPlus) {
            return {
                valid: false,
                error: `${modifier} 操作需要 + 行（新增内容）`
            };
        }
        return { valid: true };
    }

    // 4. 普通 hunk：检查是否有实际操作
    const hasMinus = lines.some(l => l.type === 'minus');
    const hasPlus = lines.some(l => l.type === 'plus');

    // 4.1 没有 minus 也没有 plus，只有 context → 跳过并警告
    if (!hasMinus && !hasPlus) {
        return {
            valid: true,
            skip: true,
            warning: `Hunk [${hunk.blockId}] 没有实际操作（无 - 或 + 行），已跳过`
        };
    }

    return { valid: true };
}

// ============ 内容重建 ============

/**
 * 从 hunk 重建"原文应该是什么"
 * oldContent = context + minus（按顺序）
 */
export function computeOldContent(hunk: ParsedHunk): string | undefined {
    const { command, modifier, lines } = hunk;

    // DELETE 命令或位置修饰符：不需要 oldContent
    if (command === 'DELETE' || modifier) {
        return undefined;
    }

    const oldLines = lines
        .filter(l => l.type === 'minus' || l.type === 'context')
        .map(l => l.content);

    if (oldLines.length === 0) {
        return undefined;
    }

    return joinAndTrim(oldLines);
}

/**
 * 从 hunk 计算"新内容应该是什么"
 * newContent = context + plus（按顺序）
 */
export function computeNewContent(hunk: ParsedHunk): string | undefined {
    const { command, lines } = hunk;

    // DELETE 命令：无 newContent
    if (command === 'DELETE') {
        return undefined;
    }

    const newLines = lines
        .filter(l => l.type === 'plus' || l.type === 'context')
        .map(l => l.content);

    if (newLines.length === 0) {
        return undefined;
    }

    return joinAndTrim(newLines);
}

/**
 * 合并行并处理尾部空行
 */
function joinAndTrim(lines: string[]): string {
    // 移除尾部空行
    let endIdx = lines.length - 1;
    while (endIdx >= 0 && lines[endIdx] === '') {
        endIdx--;
    }

    if (endIdx < 0) return '';

    return lines.slice(0, endIdx + 1).join('\n');
}

// ============ 编辑操作转换 ============

/**
 * 将解析后的 hunk 转换为编辑操作
 */
export function hunkToEdit(hunk: ParsedHunk): BlockEdit | null {
    const { modifier, command, blockId, lines } = hunk;

    // 1. DELETE 命令
    if (command === 'DELETE') {
        return { type: 'DELETE', blockId };
    }

    // 2. REPLACE 命令（跳过校验，直接替换）
    if (command === 'REPLACE') {
        const newContent = computeNewContent(hunk);
        if (!newContent) {
            return null;
        }
        // 使用 UPDATE 类型，但不设置 oldContent（跳过校验）
        return { type: 'UPDATE', blockId, newContent };
    }

    // 3. 位置修饰符
    if (modifier) {
        const newContent = computeNewContent(hunk);
        if (!newContent) {
            return null;
        }

        switch (modifier) {
            case 'BEFORE':
            case 'INSERT_BEFORE':
                return { type: 'INSERT_BEFORE', blockId, newContent };
            case 'AFTER':
            case 'INSERT_AFTER':
                return { type: 'INSERT_AFTER', blockId, newContent };
            case 'PREPEND':
                return { type: 'PREPEND', blockId, newContent };
            case 'APPEND':
                return { type: 'APPEND', blockId, newContent };
            default:
                return null;
        }
    }

    // 4. 普通 hunk：根据内容推断类型
    const hasMinus = lines.some(l => l.type === 'minus');
    const hasPlus = lines.some(l => l.type === 'plus');

    const oldContent = computeOldContent(hunk);
    const newContent = computeNewContent(hunk);

    if (hasMinus && hasPlus) {
        // 有旧有新 = UPDATE
        return { type: 'UPDATE', blockId, oldContent, newContent };
    }

    if (hasMinus && !hasPlus) {
        // 只有删除 = DELETE（通过 - 行删除）
        return { type: 'DELETE', blockId, oldContent };
    }

    if (!hasMinus && hasPlus) {
        // 只有新增 = INSERT_AFTER
        return { type: 'INSERT_AFTER', blockId, newContent };
    }

    return null;
}

// ============ 内容匹配校验 ============

/**
 * 校验 oldContent 是否匹配实际块内容
 *
 * @param actual 实际块内容
 * @param expected diff 中声明的旧内容（context + minus）
 * @param strict 是否严格匹配（默认 true）
 */
export function matchContent(
    actual: string,
    expected: string,
    strict: boolean = true
): boolean {
    if (strict) {
        return normalizeContent(actual) === normalizeContent(expected);
    }

    // 宽松匹配：忽略所有空白差异
    const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();
    return normalizeWs(actual) === normalizeWs(expected);
}

/**
 * 标准化内容（用于比较）
 * - trim 首尾空白
 * - 统一换行符
 */
function normalizeContent(s: string): string {
    return s
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
}

// ============ 完整解析流程 ============

/**
 * 解析 Block Diff 文本（仅解析，不校验内容匹配）
 *
 * @param diffText 完整的 diff 文本
 * @param options 解析选项
 * @returns 解析后的 hunk 列表和编辑操作
 */
export function parseBlockDiff(diffText: string, options: ParseOptions = {}): {
    hunks: ParsedHunk[];
    edits: BlockEdit[];
    warnings: string[];
} {
    const hunkTexts = splitIntoHunks(diffText);
    const hunks: ParsedHunk[] = [];
    const edits: BlockEdit[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < hunkTexts.length; i++) {
        const hunkText = hunkTexts[i];

        try {
            // 1. 解析 hunk
            const hunk = parseHunk(hunkText);
            hunks.push(hunk);

            // 2. 校验 hunk 结构
            const validation = validateHunk(hunk);

            if (!validation.valid) {
                errors.push(`Hunk #${i + 1} [${hunk.blockId}]: ${validation.error}`);
                continue;
            }

            if (validation.skip) {
                warnings.push(validation.warning!);
                continue;
            }

            if (validation.warning) {
                warnings.push(validation.warning);
            }

            // 3. 转换为编辑操作
            const edit = hunkToEdit(hunk);
            if (edit) {
                edits.push(edit);
            }

        } catch (error) {
            errors.push(`Hunk #${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(`Diff 解析失败:\n${errors.join('\n')}`);
    }

    return { hunks, edits, warnings };
}

// ============ 辅助函数 ============

/**
 * 格式化编辑操作为可读字符串
 */
// export function formatEdit(edit: BlockEdit): string {
//     const { type, blockId, oldContent, newContent } = edit;

//     switch (type) {
//         case 'UPDATE':
//             return `UPDATE ${blockId}: "${truncate(oldContent!, 30)}" → "${truncate(newContent!, 30)}"`;
//         case 'DELETE':
//             return `DELETE ${blockId}${oldContent ? `: "${truncate(oldContent, 50)}"` : ''}`;
//         case 'INSERT_AFTER':
//             return `INSERT_AFTER ${blockId}: "${truncate(newContent!, 50)}"`;
//         case 'INSERT_BEFORE':
//             return `INSERT_BEFORE ${blockId}: "${truncate(newContent!, 50)}"`;
//         case 'PREPEND':
//             return `PREPEND ${blockId}: "${truncate(newContent!, 50)}"`;
//         case 'APPEND':
//             return `APPEND ${blockId}: "${truncate(newContent!, 50)}"`;
//         default:
//             return `UNKNOWN ${blockId}`;
//     }
// }
export function formatEdit(edit: BlockEdit): string {
    const { type, blockId, oldContent, newContent } = edit;

    switch (type) {
        case 'UPDATE':
            // 处理 REPLACE 命令（有 oldContent）
            if (oldContent) {
                return `UPDATE ${blockId}: "${truncate(oldContent, 30)}" → "${truncate(newContent!, 30)}"`;
            } else {
                return `REPLACE ${blockId}: → "${truncate(newContent!, 30)}"`;
            }
        case 'DELETE':
            return `DELETE ${blockId}${oldContent ? `: "${truncate(oldContent, 50)}"` : ''}`;
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

/**
 * 截断用于错误消息的行内容
 */
function truncateForError(line: string): string {
    if (line.length <= 40) return line;
    return line.slice(0, 37) + '...';
}

/**
 * 格式化校验错误为可读字符串
 */
export function formatValidationError(error: ValidationError): string {
    const lines: string[] = [];
    lines.push(`❌ Hunk #${error.hunkIndex + 1} [${error.blockId}]`);
    lines.push(`   错误类型: ${error.errorType}`);
    lines.push(`   ${error.message}`);

    if (error.expected !== undefined) {
        lines.push(`   期望内容:`);
        lines.push(`   "${truncate(error.expected, 80)}"`);
    }

    if (error.actual !== undefined) {
        lines.push(`   实际内容:`);
        lines.push(`   "${truncate(error.actual, 80)}"`);
    }

    return lines.join('\n');
}
