/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-08 17:58:38
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/core.ts
 * @LastEditTime : 2026-02-07 21:35:00
 * @Description  : Block Diff 执行器（SEARCH/REPLACE 模式）
 */

import type {
    BlockEdit,
    EditResult,
    ParsedHunk,
    ValidationError,
    ValidationResult
} from './types';

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

// ============ 内容匹配辅助函数 ============

/**
 * 简单的 Jaccard 相似度计算（用于错误提示）
 */
function calculateSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * 生成详细的内容不匹配错误消息
 */
function formatContentMismatchError(
    blockId: string,
    searchContent: string,
    actualContent: string
): string {
    const similarity = calculateSimilarity(searchContent, actualContent);
    const percentage = (similarity * 100).toFixed(1);

    let message = `块 ${blockId} 内容不匹配（相似度: ${percentage}%）\n\n`;
    message += `期望匹配的 SEARCH 内容:\n${searchContent}\n\n`;
    message += `实际块内容:\n${actualContent}\n\n`;
    message += `建议:\n`;
    message += `1. 使用 getBlockContent 工具 (showId: true, showSubStructure: true) 获取块的准确内容\n`;
    message += `2. 复制实际内容到 SEARCH 块中\n`;
    message += `3. 如果块内容已改变,请使用最新版本`;

    return message;
}

// ============ 强制校验 ============

/**
 * 校验所有 hunk 的内容匹配（强制，不可跳过）
 *
 * @param hunks 解析后的 hunk 列表
 * @param edits 对应的编辑操作列表
 * @param api 思源 API
 * @param strict 是否严格匹配（暂时保留，SEARCH/REPLACE 总是严格匹配）
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

        // 4. 普通 SEARCH/REPLACE（需要内容校验）
        if (hunk.searchReplace) {
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

            const actualContent = block.markdown;
            const searchContent = hunk.searchReplace.search;

            // SEARCH/REPLACE 模式下总是严格匹配
            if (actualContent !== searchContent) {
                errors.push({
                    hunkIndex: index,
                    blockId,
                    errorType: 'CONTENT_MISMATCH',
                    message: formatContentMismatchError(blockId, searchContent, actualContent),
                    expected: searchContent,
                    actual: actualContent
                });
                continue;
            }

            validEdits.push(edit);
            continue;
        }

        // 5. 其他情况（INSERT_AFTER 等只需要验证块存在）
        if (edit.type === 'INSERT_AFTER' || edit.type === 'INSERT_BEFORE') {
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
