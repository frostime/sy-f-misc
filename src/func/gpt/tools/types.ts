/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 01:45:14
 * @FilePath     : /src/func/gpt/tools/types.ts
 * @LastEditTime : 2025-05-11 16:24:07
 * @Description  : 
 */
/**
 * 工具权限级别
 */
export enum ToolPermissionLevel {
    // 无需用户审核，可直接执行
    PUBLIC = 'public',

    // 需要用户首次审核，之后可以记住选择
    MODERATE = 'moderate',

    // 每次执行都需要用户审核
    SENSITIVE = 'sensitive'
}

/**
 * 工具执行状态
 */
export enum ToolExecuteStatus {
    // 执行成功
    SUCCESS = 'success',

    // 执行失败（出错）
    ERROR = 'error',

    // 用户拒绝执行
    REJECTED = 'rejected',

    // 工具不存在
    NOT_FOUND = 'not_found'
}

/**
 * 工具执行结果
 */
export interface ToolExecuteResult {
    // 执行状态
    status: ToolExecuteStatus;

    // 执行结果数据（成功时）
    data?: any;

    // 错误信息（失败时）
    error?: string;

    // 用户拒绝原因（用户拒绝时）
    rejectReason?: string;
}

/**
 * 用户审核回调函数
 */
export type UserApprovalCallback = (
    toolName: string,
    toolDescription: string,
    args: Record<string, any>
) => Promise<{
    approved: boolean;
    persistDecision?: boolean;  // 是否保存用户决定，避免下次重复询问
    rejectReason?: string;
}>;

/**
 * 工具定义（带权限级别）
 */
export type ToolDefinitionWithPermission = IToolDefinition & {
    permissionLevel: ToolPermissionLevel;
};

/**
 * 工具执行函数
 */
export type ToolExecuteFunction = (
    args: Record<string, any>
) => Promise<ToolExecuteResult>;

/**
 * 工具对象
 */
export interface Tool {
    definition: ToolDefinitionWithPermission;
    execute: ToolExecuteFunction;
    tags?: string[];  // 工具标签，用于分类和管理
}
