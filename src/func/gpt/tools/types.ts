/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 01:45:14
 * @FilePath     : /src/func/gpt/tools/types.ts
 * @LastEditTime : 2025-06-04 13:30:33
 * @Description  : 工具类型定义
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

    // 用户拒绝执行（重命名自 REJECTED）
    EXECUTION_REJECTED = 'execution_rejected',

    // 用户拒绝结果（新增）
    RESULT_REJECTED = 'result_rejected',

    // 工具不存在
    NOT_FOUND = 'not_found',

    // 向后兼容，等同于 EXECUTION_REJECTED
    REJECTED = 'execution_rejected'
}

/**
 * 工具执行结果
 */
export interface ToolExecuteResult {
    // 执行状态
    status: ToolExecuteStatus;

    // 执行结果数据（成功时）
    data?: string;

    // 错误信息（失败时）
    error?: string;

    // 用户拒绝原因（用户拒绝时）
    rejectReason?: string;
}

/**
 * 执行审批回调函数
 */
export type UserApprovalCallback = (
    toolName: string,
    toolDescription: string,
    args: Record<string, any>
) => Promise<{
    approved: boolean;
    rejectReason?: string;
}>;

/**
 * 结果审批回调函数
 */
export type ResultApprovalCallback = (
    toolName: string,
    args: Record<string, any>,
    result: ToolExecuteResult
) => Promise<{
    approved: boolean;
    rejectReason?: string;
}>;

/**
 * 工具定义（带权限级别）
 */
export type ToolDefinitionWithPermission = IToolDefinition & {
    // 工具权限级别
    permissionLevel?: ToolPermissionLevel;

    // 是否需要执行前权限检查，默认为 true
    // 设置为 false 可以跳过执行前权限检查，即使 permissionLevel 不是 PUBLIC
    requireExecutionApproval?: boolean;

    // 是否需要结果权限检查，默认为 false
    // 设置为 true 可以启用结果权限检查，要求用户确认是否将结果发送给 LLM
    requireResultApproval?: boolean;
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
    // group?: 'web' | 'siyuan' | 'file-system';
}

export interface ToolGroup {
    name: string;
    tools: Tool[];
    rulePrompt?: string;
}

/**
 * 展示模式枚举
 */
export enum DisplayMode {
    // 内联模式，适用于chat
    INLINE = 'inline',

    // 对话框模式，适用于chat-in-doc
    DIALOG = 'dialog'
}

/**
 * 审核 UI 适配器接口
 * 负责决定如何展示审核 UI
 */
export interface ApprovalUIAdapter {
    /**
     * 显示工具执行审核界面
     * @param toolName 工具名称
     * @param toolDescription 工具描述
     * @param args 工具参数
     * @param permissionLevel 工具权限级别
     * @returns 用户决策
     */
    showToolExecutionApproval(
        toolName: string,
        toolDescription: string,
        args: Record<string, any>
    ): Promise<{
        approved: boolean;
        persistDecision?: boolean;
        rejectReason?: string;
    }>;

    /**
     * 显示工具结果审核界面
     * @param toolName 工具名称
     * @param args 工具参数
     * @param result 工具执行结果
     * @returns 用户决策
     */
    showToolResultApproval(
        toolName: string,
        args: Record<string, any>,
        result: ToolExecuteResult
    ): Promise<{
        approved: boolean;
        rejectReason?: string;
    }>;
}
