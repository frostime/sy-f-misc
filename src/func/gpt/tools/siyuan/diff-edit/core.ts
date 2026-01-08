/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-01-08 17:58:38
 * @Description  :
 * @FilePath     : /src/func/gpt/tools/siyuan/diff-edit/core.ts
 * @LastEditTime : 2026-01-08 18:46:43
 */
/**
 * Block Diff 执行器
 *
 * 将编辑操作应用到思源笔记
 */

import type {
  BlockEdit,
  EditResult,
} from './types';

// ============ 思源 API 封装 ============

type DataType = 'markdown' | 'dom';

interface SiyuanAPI {
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

  getBlockByID: (id: BlockId) => Promise<{ id: string; parent_id: string; type: string; markdown: string } | null>;
}

/**
 * 执行所有编辑操作
 *
 * @param edits 编辑操作列表
 * @param api 思源 API 接口
 * @param parentId 默认父块 ID（用于 INSERT 操作）
 * @returns 执行结果列表
 */
export async function executeEdits(
  edits: BlockEdit[],
  api: SiyuanAPI,
): Promise<EditResult[]> {
  const results: EditResult[] = [];

  for (const edit of edits) {
    const result = await executeOneEdit(edit, api);
    results.push(result);

    // 如果遇到错误，可以选择是否继续
    // 这里选择继续执行后续操作
  }

  return results;
}

/**
 * 执行单个编辑操作
 */
async function executeOneEdit(
  edit: BlockEdit,
  api: SiyuanAPI,
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
  api: SiyuanAPI,
  defaultParentId?: BlockId
): Promise<EditResult> {
  if (!edit.newContent) {
    return { edit, success: false, error: 'INSERT_AFTER 操作缺少 newContent' };
  }

  // 获取目标块的父块 ID
  let parentId = defaultParentId;
  if (!parentId) {
    const block = await api.getBlockByID(edit.blockId);
    if (!block) {
      return { edit, success: false, error: `找不到块: ${edit.blockId}` };
    }
    parentId = block.parent_id;
  }

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
  api: SiyuanAPI,
  defaultParentId?: BlockId
): Promise<EditResult> {
  if (!edit.newContent) {
    return { edit, success: false, error: 'INSERT_BEFORE 操作缺少 newContent' };
  }

  // 获取目标块的父块 ID
  let parentId = defaultParentId;
  if (!parentId) {
    const block = await api.getBlockByID(edit.blockId);
    if (!block) {
      return { edit, success: false, error: `找不到块: ${edit.blockId}` };
    }
    parentId = block.parent_id;
  }

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
