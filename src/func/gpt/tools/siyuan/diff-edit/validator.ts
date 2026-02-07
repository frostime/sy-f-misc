/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-02-07 21:20:00
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/validator.ts
 * @LastEditTime : 2026-02-07 21:20:00
 * @Description  : Block Diff 格式验证模块（Lexer 检测）
 */

// ============================================================
// Token 定义
// ============================================================

export enum TokenType {
    /** B: BlockIDHunk (@@blockId@@) */
    BLOCK_ID_HUNK = 'BLOCK_ID_HUNK',
    /** S: StartSearch (<<<<<<< SEARCH) */
    START_SEARCH = 'START_SEARCH',
    /** R: EndReplace (>>>>>>> REPLACE) */
    END_REPLACE = 'END_REPLACE',
    /** D: Delimiter (=======) */
    DELIMITER = 'DELIMITER',
    /** T: Text (普通内容行) */
    TEXT = 'TEXT'
}

export interface Token {
    type: TokenType;
    lineNumber: number;  // 1-based
    content?: string;    // 原始内容（用于错误提示）
}

// ============================================================
// 格式验证结果
// ============================================================

export interface FormatValidationResult {
    valid: boolean;
    errors: FormatValidationError[];
}

export interface FormatValidationError {
    lineNumber: number;
    errorType: 'NESTED_SEARCH_REPLACE' | 'UNMATCHED_MARKERS' | 'DELIMITER_ERROR' | 'INVALID_SEQUENCE';
    message: string;
    tokenSequence?: string;  // 错误的 token 序列（用于调试）
}

// ============================================================
// Token 化
// ============================================================

/**
 * 将 Block Diff 文本 token 化
 *
 * @param diffText - 完整的 diff 文本
 * @returns Token 数组
 */
export function tokenizeBlockDiff(diffText: string): Token[] {
    const lines = diffText.split('\n');
    const tokens: Token[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNumber = i + 1;

        // 跳过空行
        if (!line) {
            continue;
        }

        // BlockIDHunk: @@...@@
        if (line.startsWith('@@') && line.endsWith('@@')) {
            tokens.push({
                type: TokenType.BLOCK_ID_HUNK,
                lineNumber,
                content: line
            });
            continue;
        }

        // StartSearch: <<<<<<< SEARCH
        if (line.startsWith('<<<<<<<') && line.includes('SEARCH')) {
            tokens.push({
                type: TokenType.START_SEARCH,
                lineNumber,
                content: line
            });
            continue;
        }

        // EndReplace: >>>>>>> REPLACE
        if (line.startsWith('>>>>>>>') && line.includes('REPLACE')) {
            tokens.push({
                type: TokenType.END_REPLACE,
                lineNumber,
                content: line
            });
            continue;
        }

        // Delimiter: =======
        if (line.startsWith('=======')) {
            tokens.push({
                type: TokenType.DELIMITER,
                lineNumber,
                content: line
            });
            continue;
        }

        // Text: 其他所有行
        tokens.push({
            type: TokenType.TEXT,
            lineNumber,
            content: line
        });
    }

    return tokens;
}

// ============================================================
// Token 序列验证
// ============================================================

/**
 * 验证 token 序列的合法性
 *
 * 正常模式: (B S T* D T* R)+
 * - B: BlockIDHunk
 * - S: StartSearch
 * - T*: 0 个或多个 Text
 * - D: Delimiter
 * - T*: 0 个或多个 Text
 * - R: EndReplace
 *
 * @param tokens - Token 数组
 * @returns 验证结果
 */
export function validateTokenSequence(tokens: Token[]): FormatValidationResult {
    const errors: FormatValidationError[] = [];

    // 统计各种 marker 数量
    let searchCount = 0;
    let replaceCount = 0;
    let delimiterCount = 0;

    for (const token of tokens) {
        if (token.type === TokenType.START_SEARCH) searchCount++;
        if (token.type === TokenType.END_REPLACE) replaceCount++;
        if (token.type === TokenType.DELIMITER) delimiterCount++;
    }

    // 检查 1: SEARCH 和 REPLACE 数量必须相等
    if (searchCount !== replaceCount) {
        errors.push({
            lineNumber: 0,
            errorType: 'UNMATCHED_MARKERS',
            message: `SEARCH 和 REPLACE 标记数量不匹配: ${searchCount} 个 SEARCH vs ${replaceCount} 个 REPLACE`,
            tokenSequence: ''
        });
    }

    // 检查 2: Delimiter 数量必须等于 SEARCH 数量
    if (delimiterCount !== searchCount) {
        errors.push({
            lineNumber: 0,
            errorType: 'DELIMITER_ERROR',
            message: `分隔符 (=======) 数量不匹配: 应为 ${searchCount} 个，实际 ${delimiterCount} 个`,
            tokenSequence: ''
        });
    }

    // 检查 3: 按状态机验证序列
    let state: 'INIT' | 'AFTER_BLOCK' | 'IN_SEARCH' | 'IN_REPLACE' = 'INIT';
    let lastToken: Token | null = null;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const tokenChar = getTokenChar(token.type);

        switch (state) {
            case 'INIT':
                if (token.type === TokenType.BLOCK_ID_HUNK) {
                    state = 'AFTER_BLOCK';
                } else if (token.type !== TokenType.TEXT) {
                    errors.push({
                        lineNumber: token.lineNumber,
                        errorType: 'INVALID_SEQUENCE',
                        message: `意外的 token: ${token.content}. 期望 BlockIDHunk (@@...@@)`,
                        tokenSequence: getTokenSequence(tokens, i, 5)
                    });
                }
                break;

            case 'AFTER_BLOCK':
                if (token.type === TokenType.START_SEARCH) {
                    state = 'IN_SEARCH';
                } else if (token.type === TokenType.TEXT) {
                    // REPLACE 等指令模式，允许直接有 Text
                    // 保持 AFTER_BLOCK 状态
                } else if (token.type === TokenType.BLOCK_ID_HUNK) {
                    // 下一个 hunk
                    state = 'AFTER_BLOCK';
                } else {
                    errors.push({
                        lineNumber: token.lineNumber,
                        errorType: 'INVALID_SEQUENCE',
                        message: `BlockIDHunk 后应为 SEARCH 标记或内容，实际为: ${token.content}`,
                        tokenSequence: getTokenSequence(tokens, i, 5)
                    });
                }
                break;

            case 'IN_SEARCH':
                if (token.type === TokenType.DELIMITER) {
                    state = 'IN_REPLACE';
                } else if (token.type === TokenType.TEXT) {
                    // 继续在 SEARCH 块中
                } else if (token.type === TokenType.START_SEARCH) {
                    // 嵌套 SEARCH - 错误！
                    errors.push({
                        lineNumber: token.lineNumber,
                        errorType: 'NESTED_SEARCH_REPLACE',
                        message: `在 SEARCH/REPLACE 块内部发现了另一个 SEARCH 标记`,
                        tokenSequence: getTokenSequence(tokens, i, 5)
                    });
                } else {
                    errors.push({
                        lineNumber: token.lineNumber,
                        errorType: 'INVALID_SEQUENCE',
                        message: `SEARCH 块中期望分隔符 (=======) 或内容，实际为: ${token.content}`,
                        tokenSequence: getTokenSequence(tokens, i, 5)
                    });
                }
                break;

            case 'IN_REPLACE':
                if (token.type === TokenType.END_REPLACE) {
                    state = 'INIT';  // 完成一个 SEARCH/REPLACE 块
                } else if (token.type === TokenType.TEXT) {
                    // 继续在 REPLACE 块中
                } else if (token.type === TokenType.DELIMITER) {
                    // 多余的 delimiter
                    errors.push({
                        lineNumber: token.lineNumber,
                        errorType: 'DELIMITER_ERROR',
                        message: `REPLACE 块中出现了多余的分隔符`,
                        tokenSequence: getTokenSequence(tokens, i, 5)
                    });
                } else {
                    errors.push({
                        lineNumber: token.lineNumber,
                        errorType: 'INVALID_SEQUENCE',
                        message: `REPLACE 块中期望 REPLACE 结束标记或内容，实际为: ${token.content}`,
                        tokenSequence: getTokenSequence(tokens, i, 5)
                    });
                }
                break;
        }

        lastToken = token;
    }

    // 检查 4: 最终状态应该回到 INIT（所有 SEARCH/REPLACE 块都已关闭）
    if (state === 'IN_SEARCH') {
        errors.push({
            lineNumber: 0,
            errorType: 'UNMATCHED_MARKERS',
            message: `未关闭的 SEARCH 块: 缺少分隔符 (=======) 或 REPLACE 结束标记`,
            tokenSequence: ''
        });
    } else if (state === 'IN_REPLACE') {
        errors.push({
            lineNumber: 0,
            errorType: 'UNMATCHED_MARKERS',
            message: `未关闭的 REPLACE 块: 缺少 >>>>>>> REPLACE`,
            tokenSequence: ''
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取 token 的单字符表示（用于调试）
 */
function getTokenChar(type: TokenType): string {
    switch (type) {
        case TokenType.BLOCK_ID_HUNK: return 'B';
        case TokenType.START_SEARCH: return 'S';
        case TokenType.END_REPLACE: return 'R';
        case TokenType.DELIMITER: return 'D';
        case TokenType.TEXT: return 'T';
    }
}

/**
 * 获取错误位置附近的 token 序列（用于错误提示）
 */
function getTokenSequence(tokens: Token[], centerIdx: number, windowSize: number = 5): string {
    const start = Math.max(0, centerIdx - windowSize);
    const end = Math.min(tokens.length, centerIdx + windowSize + 1);

    return tokens
        .slice(start, end)
        .map((t, i) => {
            const char = getTokenChar(t.type);
            const marker = (start + i === centerIdx) ? `[${char}]` : char;
            return marker;
        })
        .join(' ');
}

// ============================================================
// 格式错误信息格式化
// ============================================================

/**
 * 格式化格式验证错误信息
 *
 * @param errors - 错误列表
 * @returns 格式化的错误字符串
 */
export function formatFormatValidationErrors(errors: FormatValidationError[]): string {
    if (errors.length === 0) {
        return '';
    }

    const lines: string[] = [
        '❌ 格式验证失败',
        '',
        `检测到 ${errors.length} 个格式错误:`,
        ''
    ];

    for (let i = 0; i < errors.length; i++) {
        const error = errors[i];
        lines.push(`错误 ${i + 1}:`);

        if (error.lineNumber > 0) {
            lines.push(`  位置: 第 ${error.lineNumber} 行`);
        }

        lines.push(`  类型: ${getErrorTypeLabel(error.errorType)}`);
        lines.push(`  原因: ${error.message}`);

        if (error.tokenSequence) {
            lines.push(`  Token 序列: ${error.tokenSequence}`);
            lines.push(`  说明: [X] 表示错误位置`);
        }

        lines.push('');
    }

    lines.push('可能的原因:');
    lines.push('1. Block 内容包含 SEARCH/REPLACE 关键词（如代码块、文档）');
    lines.push('2. 标记不成对（SEARCH 和 REPLACE 数量不匹配）');
    lines.push('3. 分隔符 (=======) 位置错误');
    lines.push('');
    lines.push('建议:');
    lines.push('1. 使用 @@REPLACE:blockId@@ 指令整体替换（跳过格式校验）');
    lines.push('2. 或精细化定位到不含这些关键词的子块进行编辑');
    lines.push('3. 检查是否忘记关闭某个 SEARCH/REPLACE 块');

    return lines.join('\n');
}

function getErrorTypeLabel(type: FormatValidationError['errorType']): string {
    switch (type) {
        case 'NESTED_SEARCH_REPLACE':
            return '嵌套的 SEARCH/REPLACE 块';
        case 'UNMATCHED_MARKERS':
            return '不成对的标记';
        case 'DELIMITER_ERROR':
            return '分隔符错误';
        case 'INVALID_SEQUENCE':
            return '无效的 Token 序列';
    }
}
