/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-08 17:58:38
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/types.ts
 * @LastEditTime : 2026-01-08 22:31:03
 * @Description  : Block Diff 类型定义
 */

// ============ 块编辑操作类型 ============

export type EditType =
    | 'UPDATE'        // 更新块内容
    | 'DELETE'        // 删除块
    | 'INSERT_AFTER'  // 在块后插入
    | 'INSERT_BEFORE' // 在块前插入
    | 'PREPEND'       // 在容器/文档开头插入
    | 'APPEND';       // 在容器/文档末尾追加

/**
 * 单个块编辑操作
 */
export interface BlockEdit {
    /** 操作类型 */
    type: EditType;
    /** 目标块 ID */
    blockId: string;
    /** 原始内容（UPDATE/DELETE 时用于校验） */
    oldContent?: string;
    /** 新内容（UPDATE/INSERT_* 时有效） */
    newContent?: string;
}

// ============ Diff 行类型 ============

export type DiffLineType = 'minus' | 'plus' | 'context';

/**
 * 单行 Diff 内容（保持顺序）
 */
export interface DiffLine {
    /** 行类型 */
    type: DiffLineType;
    /** 内容（去掉前缀后） */
    content: string;
    /** 原始行号（用于错误提示） */
    lineNumber: number;
}

// ============ Hunk 命令类型 ============

/**
 * 特殊命令
 * - DELETE: 删除整个块（无需内容）
 * - REPLACE: 直接替换整个块（跳过内容校验，需要 + 行）
 */
export type HunkCommand = 'DELETE' | 'REPLACE' | null;

/**
 * 解析后的 Hunk（严格模式）
 */
export interface ParsedHunk {
    /** 原始 hunk 文本 */
    raw: string;
    /** 修饰符: BEFORE, AFTER, PREPEND, APPEND 或 null */
    modifier: string | null;
    /** 特殊命令: DELETE 或 null */
    command: HunkCommand;
    /** 目标块 ID */
    blockId: string;
    /** 类型标签（可选，如 "段落"、"标题"） */
    typeLabel?: string;
    /** 有序的 diff 行列表 */
    lines: DiffLine[];
}

/**
 * Hunk 校验结果
 */
export interface HunkValidation {
    /** 是否有效 */
    valid: boolean;
    /** 错误信息（如果无效） */
    error?: string;
    /** 警告信息（如只有 context 行） */
    warning?: string;
    /** 是否应该跳过（只有 context 行） */
    skip?: boolean;
}

/**
 * 编辑执行结果
 */
export interface EditResult {
    edit: BlockEdit;
    success: boolean;
    error?: string;
    newBlockId?: string; // INSERT 操作返回的新块 ID
}

// ============ 解析选项 ============

export interface ParseOptions {
    /** 是否严格校验 oldContent（默认 true，严格模式） */
    strictMatch?: boolean;
}

// ============ 校验结果 ============

export interface ValidationError {
    /** 出错的 hunk 索引 */
    hunkIndex: number;
    /** 目标块 ID */
    blockId: string;
    /** 错误类型 */
    errorType: 'BLOCK_NOT_FOUND' | 'CONTENT_MISMATCH' | 'PARSE_ERROR';
    /** 错误详情 */
    message: string;
    /** 期望内容 */
    expected?: string;
    /** 实际内容 */
    actual?: string;
}

export interface ValidationResult {
    /** 是否全部通过 */
    valid: boolean;
    /** 错误列表 */
    errors: ValidationError[];
    /** 警告列表 */
    warnings: string[];
    /** 有效的编辑操作（跳过警告的） */
    edits: BlockEdit[];
}
