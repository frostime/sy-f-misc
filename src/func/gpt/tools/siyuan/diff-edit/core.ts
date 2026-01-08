/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-08 17:58:38
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/core.ts
 * @LastEditTime : 2026-01-08 22:00:00
 * @Description  : Block Diff 执行器（严格模式）
 */

import type {
    BlockEdit,
    EditResult,
    ParsedHunk,
    ValidationError,
    ValidationResult
} from './types';
import { computeOldContent, matchContent } from './parser';

// ============ 思源 API 封装 ============

type DataType = 'markdown' | 'dom';

export interface SiyuanAPI {
    insertBlock: (
        dataType: DataType,
        data: string,
        nextID?: BlockId,
        previousID?: BlockId,
        parentID?: BlockId
    ) => Promise<IResdoOperations[]>;

    prependBlock: (
        dataType: DataType,
        data: string,
        parentID: BlockId
    ) => Promise<IResdoOperations[]>;

    appendBlock: (
        dataType: DataType,
        data: string,
        parentID: BlockId
    ) => Promise<IResdoOperations[]>;

    updateBlock: (
        dataType: DataType,
        data: string,
        id: BlockId
    ) => Promise<IResdoOperations[]>;

    deleteBlock: (id: BlockId) => Promise<IResdoOperations[]>;

    getBlockByID: (id: BlockId) => Promise<{
        id: string;
        parent_id: string;
        type: string;
        markdown: string;
    } | null>;
}

// ============ 强制校验 ============

/**
 * 校验所有 hunk 的内容匹配（强制，不可跳过）
 *
 * @param hunks 解析后的 hunk 列表
 * @param edits 对应的编辑操作列表
 * @param api 思源 API
 * @param strict 是否严格匹配
 * @returns 校验结果
 */
export async function validateAllHunks(
    hunks: ParsedHunk[],
    edits: BlockEdit[],
    api: SiyuanAPI,
    strict: boolean = true
): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const validEdits: BlockEdit[] = [];

    // 建立 blockId -> edit 的映射
    const editMap = new Map<string, { edit: BlockEdit; hunk: ParsedHunk; index: number }>();
    for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const hunk = hunks.find(h => h.blockId === edit.blockId);
        if (hunk) {
            editMap.set(edit.blockId, { edit, hunk, index: i });
        }
    }

    // 逐个校验
    for (const [blockId, { edit, hunk, index }] of editMap) {
        // 1. DELETE 命令（@@DELETE:id@@）不需要内容校验
        if (hunk.command === 'DELETE') {
            // 只需要验证块存在
            const block = await api.getBlockByID(blockId);
            if (!block) {
                errors.push({
                    hunkIndex: index,
                    blockId,
                    errorType: 'BLOCK_NOT_FOUND',
                    message: `块不存在: ${blockId}`
                });
                continue;
            }
            validEdits.push(edit);
            continue;
        }

        // 2. REPLACE 命令（@@REPLACE:id@@）跳过内容校验
        if (hunk.command === 'REPLACE') {
            // 只需要验证块存在
            const block = await api.getBlockByID(blockId);
            if (!block) {
                errors.push({
                    hunkIndex: index,
                    blockId,
                    errorType: 'BLOCK_NOT_FOUND',
                    message: `块不存在: ${blockId}`
                });
                continue;
            }
            validEdits.push(edit);
            continue;
        }

        // 3. 位置修饰符（BEFORE, AFTER, PREPEND, APPEND）
        if (hunk.modifier) {
            // 需要验证目标块存在
            const block = await api.getBlockByID(blockId);
            if (!block) {
                errors.push({
                    hunkIndex: index,
                    blockId,
                    errorType: 'BLOCK_NOT_FOUND',
                    message: `目标块不存在: ${blockId}`
                });
                continue;
            }
            validEdits.push(edit);
            continue;
        }

        // 4. 普通 UPDATE/DELETE（需要内容校验）
        if (edit.type === 'UPDATE' || edit.type === 'DELETE') {
            // 获取实际块内容
            const block = await api.getBlockByID(blockId);
            if (!block) {
                errors.push({
                    hunkIndex: index,
                    blockId,
                    errorType: 'BLOCK_NOT_FOUND',
                    message: `块不存在: ${blockId}`
                });
                continue;
            }

            // 计算期望的旧内容（context + minus）
            const expectedOld = computeOldContent(hunk);

            if (expectedOld) {
                // 执行内容匹配校验
                const actualContent = block.markdown;

                if (!matchContent(actualContent, expectedOld, strict)) {
                    errors.push({
                        hunkIndex: index,
                        blockId,
                        errorType: 'CONTENT_MISMATCH',
                        message: '块内容不匹配，拒绝执行编辑',
                        expected: expectedOld,
                        actual: actualContent
                    });
                    continue;
                }
            }

            validEdits.push(edit);
            continue;
        }

        // 5. INSERT_AFTER（只有 + 行）
        if (edit.type === 'INSERT_AFTER') {
            // 需要验证目标块存在
            const block = await api.getBlockByID(blockId);
            if (!block) {
                errors.push({
                    hunkIndex: index,
                    blockId,
                    errorType: 'BLOCK_NOT_FOUND',
                    message: `目标块不存在: ${blockId}`
                });
                continue;
            }
            validEdits.push(edit);
            continue;
        }

        // 默认通过
        validEdits.push(edit);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        edits: validEdits
    };
}

// ============ 执行编辑 ============

/**
 * 执行所有编辑操作（校验已通过）
 *
 * @param edits 编辑操作列表
 * @param api 思源 API 接口
 * @returns 执行结果列表
 */
export async function executeEdits(
    edits: BlockEdit[],
    api: SiyuanAPI
): Promise<EditResult[]> {
    const results: EditResult[] = [];

    for (const edit of edits) {
        const result = await executeOneEdit(edit, api);
        results.push(result);

        // 如果遇到错误，继续执行后续操作
        // （因为校验已通过，执行失败通常是网络问题）
    }

    return results;
}

/**
 * 执行单个编辑操作
 */
async function executeOneEdit(
    edit: BlockEdit,
    api: SiyuanAPI
): Promise<EditResult> {
    try {
        switch (edit.type) {
            case 'UPDATE':
                return await executeUpdate(edit, api);

            case 'DELETE':
                return await executeDelete(edit, api);

            case 'INSERT_AFTER':
                return await executeInsertAfter(edit, api);

            case 'INSERT_BEFORE':
                return await executeInsertBefore(edit, api);

            case 'PREPEND':
                return await executePrepend(edit, api);

            case 'APPEND':
                return await executeAppend(edit, api);

            default:
                return {
                    edit,
                    success: false,
                    error: `未知操作类型: ${(edit as any).type}`,
                };
        }
    } catch (error) {
        return {
            edit,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * 执行 UPDATE 操作
 */
async function executeUpdate(
    edit: BlockEdit,
    api: SiyuanAPI
): Promise<EditResult> {
    if (!edit.newContent) {
        return { edit, success: false, error: 'UPDATE 操作缺少 newContent' };
    }

    await api.updateBlock('markdown', edit.newContent, edit.blockId);

    return { edit, success: true };
}

/**
 * 执行 DELETE 操作
 */
async function executeDelete(
    edit: BlockEdit,
    api: SiyuanAPI
): Promise<EditResult> {
    await api.deleteBlock(edit.blockId);

    return { edit, success: true };
}

/**
 * 执行 INSERT_AFTER 操作
 */
async function executeInsertAfter(
    edit: BlockEdit,
    api: SiyuanAPI
): Promise<EditResult> {
    if (!edit.newContent) {
        return { edit, success: false, error: 'INSERT_AFTER 操作缺少 newContent' };
    }

    // 获取目标块的父块 ID
    const block = await api.getBlockByID(edit.blockId);
    if (!block) {
        return { edit, success: false, error: `找不到块: ${edit.blockId}` };
    }
    const parentId = block.parent_id;

    const result = await api.insertBlock(
        'markdown',
        edit.newContent,
        undefined,        // nextID
        edit.blockId,     // previousID - 在此块之后
        parentId
    );

    // 提取新块 ID
    const newBlockId = result?.[0]?.doOperations?.[0]?.id;

    return { edit, success: true, newBlockId };
}

/**
 * 执行 INSERT_BEFORE 操作
 */
async function executeInsertBefore(
    edit: BlockEdit,
    api: SiyuanAPI
): Promise<EditResult> {
    if (!edit.newContent) {
        return { edit, success: false, error: 'INSERT_BEFORE 操作缺少 newContent' };
    }

    // 获取目标块的父块 ID
    const block = await api.getBlockByID(edit.blockId);
    if (!block) {
        return { edit, success: false, error: `找不到块: ${edit.blockId}` };
    }
    const parentId = block.parent_id;

    const result = await api.insertBlock(
        'markdown',
        edit.newContent,
        edit.blockId,     // nextID - 在此块之前
        undefined,        // previousID
        parentId
    );

    const newBlockId = result?.[0]?.doOperations?.[0]?.id;

    return { edit, success: true, newBlockId };
}

/**
 * 执行 PREPEND 操作
 */
async function executePrepend(
    edit: BlockEdit,
    api: SiyuanAPI
): Promise<EditResult> {
    if (!edit.newContent) {
        return { edit, success: false, error: 'PREPEND 操作缺少 newContent' };
    }

    const result = await api.prependBlock('markdown', edit.newContent, edit.blockId);

    const newBlockId = result?.[0]?.doOperations?.[0]?.id;

    return { edit, success: true, newBlockId };
}

/**
 * 执行 APPEND 操作
 */
async function executeAppend(
    edit: BlockEdit,
    api: SiyuanAPI
): Promise<EditResult> {
    if (!edit.newContent) {
        return { edit, success: false, error: 'APPEND 操作缺少 newContent' };
    }

    const result = await api.appendBlock('markdown', edit.newContent, edit.blockId);

    const newBlockId = result?.[0]?.doOperations?.[0]?.id;

    return { edit, success: true, newBlockId };
}

// ============ API 适配器 ============

/**
 * 创建思源 API 适配器
 *
 * @param request 思源 request 函数
 * @returns SiyuanAPI 接口实现
 */
export function createSiyuanAPI(
    request: (url: string, data: any) => Promise<any>
): SiyuanAPI {
    return {
        insertBlock: async (dataType, data, nextID, previousID, parentID) => {
            return request('/api/block/insertBlock', {
                dataType, data, nextID, previousID, parentID
            });
        },

        prependBlock: async (dataType, data, parentID) => {
            return request('/api/block/prependBlock', { dataType, data, parentID });
        },

        appendBlock: async (dataType, data, parentID) => {
            return request('/api/block/appendBlock', { dataType, data, parentID });
        },

        updateBlock: async (dataType, data, id) => {
            return request('/api/block/updateBlock', { dataType, data, id });
        },

        deleteBlock: async (id) => {
            return request('/api/block/deleteBlock', { id });
        },

        getBlockByID: async (id) => {
            return request('/api/query/sql', {
                stmt: `SELECT * FROM blocks WHERE id = '${id}' LIMIT 1`
            }).then(res => res?.[0] || null);
        },
    };
}
