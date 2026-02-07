/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-08 17:58:38
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/parser.ts
 * @LastEditTime : 2026-02-07 21:25:00
 * @Description  : Block Diff 解析器（SEARCH/REPLACE 模式）
 */

import type {
    BlockEdit,
    ParsedHunk,
    HunkCommand,
    HunkValidation,
    ParseOptions,
    ValidationError
} from './types';

import {
    tokenizeBlockDiff,
    validateTokenSequence,
    formatFormatValidationErrors
} from './validator';

// ============================================================
// ID 校验
// ============================================================

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

// ============================================================
// Hunk 分割
// ============================================================

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

// ============================================================
// SEARCH/REPLACE 块解析
// ============================================================

/**
 * SEARCH/REPLACE 块
 */
export interface SearchReplaceBlock {
    search: string;   // SEARCH 块的完整内容
    replace: string;  // REPLACE 块的完整内容
}

/**
 * 解析单个 hunk（SEARCH/REPLACE 模式）
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

    // 获取内容部分（去掉头部）
    const contentLines = rawLines.slice(1);
    const contentText = contentLines.join('\n');

    // 解析 SEARCH/REPLACE 块（如果存在）
    let searchReplace: SearchReplaceBlock | undefined;

    if (!command && !modifier) {
        // 普通编辑模式：需要 SEARCH/REPLACE 块
        searchReplace = parseSearchReplaceContent(contentText);
    }

    return {
        raw: hunkText,
        modifier,
        command,
        blockId,
        typeLabel,
        searchReplace,
        newContent: undefined  // 将在后续步骤填充（对于指令模式）
    };
}

/**
 * 解析 SEARCH/REPLACE 块内容
 */
function parseSearchReplaceContent(content: string): SearchReplaceBlock {
    // 查找 <<<<<<< SEARCH
    const searchMatch = content.match(/<<<<<<<?(?:\s*SEARCH)?\s*\n([\s\S]*?)\n?={4,}/);
    if (!searchMatch) {
        throw new Error('未找到 SEARCH 块（格式: <<<<<<< SEARCH）');
    }

    const searchContent = searchMatch[1];

    // 查找分隔符后的部分
    const afterDelimiter = content.substring(searchMatch.index! + searchMatch[0].length);

    // 查找 >>>>>>> REPLACE
    const replaceMatch = afterDelimiter.match(/([\s\S]*?)\n?>>>>>>>?(?:\s*REPLACE)?/);
    if (!replaceMatch) {
        throw new Error('未找到 REPLACE 块（格式: >>>>>>> REPLACE）');
    }

    const replaceContent = replaceMatch[1];

    return {
        search: searchContent.trim(),
        replace: replaceContent.trim()
    };
}

// ============================================================
// Hunk 校验
// ============================================================

/**
 * 校验单个 hunk 的内容
 *
 * @param hunk 解析后的 hunk
 * @returns 校验结果
 */
export function validateHunk(hunk: ParsedHunk): HunkValidation {
    const { command, modifier, searchReplace } = hunk;

    // 1. DELETE 命令：不需要内容
    if (command === 'DELETE') {
        return { valid: true };
    }

    // 2. REPLACE 命令：需要新内容（从 content 提取）
    if (command === 'REPLACE') {
        // newContent 将在 hunkToEdit 中提取
        return { valid: true };
    }

    // 3. 位置修饰符（BEFORE, AFTER, PREPEND, APPEND）：需要新内容
    if (modifier) {
        return { valid: true };
    }

    // 4. 普通 hunk：需要 SEARCH/REPLACE 块
    if (!searchReplace) {
        return {
            valid: false,
            error: '普通编辑模式需要 SEARCH/REPLACE 块'
        };
    }

    // 检查 SEARCH 块是否为空
    if (!searchReplace.search) {
        return {
            valid: true,
            skip: true,
            warning: `Hunk [${hunk.blockId}] SEARCH 块为空，已跳过`
        };
    }

    return { valid: true };
}

// ============================================================
// 编辑操作转换
// ============================================================

/**
 * 从 hunk 内容中提取新内容（用于指令模式）
 */
function extractNewContent(hunk: ParsedHunk): string | undefined {
    const contentLines = hunk.raw.split('\n').slice(1);  // 去掉头部
    const content = contentLines.join('\n').trim();

    if (!content) {
        return undefined;
    }

    return content;
}

/**
 * 将解析后的 hunk 转换为编辑操作
 */
export function hunkToEdit(hunk: ParsedHunk): BlockEdit | null {
    const { modifier, command, blockId, searchReplace } = hunk;

    // 1. DELETE 命令
    if (command === 'DELETE') {
        return { type: 'DELETE', blockId };
    }

    // 2. REPLACE 命令（跳过校验，直接替换）
    if (command === 'REPLACE') {
        const newContent = extractNewContent(hunk);
        if (!newContent) {
            return null;
        }
        // 使用 UPDATE 类型，但不设置 oldContent（跳过校验）
        return { type: 'UPDATE', blockId, newContent };
    }

    // 3. 位置修饰符
    if (modifier) {
        const newContent = extractNewContent(hunk);
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

    // 4. 普通 hunk：SEARCH/REPLACE 模式
    if (searchReplace) {
        return {
            type: 'UPDATE',
            blockId,
            oldContent: searchReplace.search,
            newContent: searchReplace.replace
        };
    }

    return null;
}

// ============================================================
// 内容匹配校验
// ============================================================

/**
 * 校验 oldContent 是否匹配实际块内容
 *
 * @param actual 实际块内容
 * @param expected diff 中声明的旧内容（SEARCH 块）
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

// ============================================================
// 完整解析流程
// ============================================================

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
    // ========== 第一步：格式验证（Lexer 检测） ==========
    const tokens = tokenizeBlockDiff(diffText);
    const formatValidation = validateTokenSequence(tokens);

    if (!formatValidation.valid) {
        const errorMessage = formatFormatValidationErrors(formatValidation.errors);
        throw new Error(errorMessage);
    }

    // ========== 第二步：分割 hunks ==========
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

// ============================================================
// 辅助函数
// ============================================================

/**
 * 格式化编辑操作为可读字符串
 */
export function formatEdit(edit: BlockEdit): string {
    const { type, blockId, oldContent, newContent } = edit;

    switch (type) {
        case 'UPDATE':
            // 处理 REPLACE 命令（无 oldContent）
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
 * 格式化校验错误为可读字符串
 */
export function formatValidationError(error: ValidationError): string {
    const lines: string[] = [];
    lines.push(`❌ Hunk #${error.hunkIndex + 1} [${error.blockId}]`);
    lines.push(`   错误类型: ${error.errorType}`);
    lines.push(`   ${error.message}`);

    if (error.expected !== undefined) {
        lines.push(`   SEARCH 块（你提供的）:`);
        lines.push(`   ---`);
        lines.push(`   ${truncate(error.expected, 200)}`);
        lines.push(`   ---`);
    }

    if (error.actual !== undefined) {
        lines.push(`   实际块内容:`);
        lines.push(`   ---`);
        lines.push(`   ${truncate(error.actual, 200)}`);
        lines.push(`   ---`);
    }

    return lines.join('\n');
}
