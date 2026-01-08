/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-01-08 17:58:38
 * @Description  :
 * @FilePath     : /tmp/siyuan-block-diff/src/types.ts
 * @LastEditTime : 2026-01-08 18:04:14
 */
/**
 * 思源笔记 Block Diff 类型定义
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

/**
 * 解析后的 Hunk
 */
export interface ParsedHunk {
  /** 原始 hunk 文本 */
  raw: string;
  /** 修饰符: BEFORE, AFTER, PREPEND, APPEND 或 null */
  modifier: string | null;
  /** 目标块 ID */
  blockId: string;
  /** 类型标签（可选，如 "段落"、"标题"） */
  typeLabel?: string;
  /** 减号行（去除前缀后） */
  minusLines: string[];
  /** 加号行（去除前缀后） */
  plusLines: string[];
  /** 上下文行 */
  contextLines: string[];
}

export interface EditResult {
  edit: BlockEdit;
  success: boolean;
  error?: string;
  newBlockId?: string; // INSERT 操作返回的新块 ID
}

// ============ 解析选项 ============

export interface ParseOptions {
  /** 是否严格校验 oldContent（默认 false） */
  strictMatch?: boolean;
  /** 是否允许空 hunk（默认 false） */
  allowEmptyHunk?: boolean;
}
