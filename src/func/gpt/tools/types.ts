/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 01:45:14
 * @FilePath     : /src/func/gpt/tools/types.ts
 * @LastEditTime : 2025-12-30 18:25:53
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
    data?: ScalarType | Record<string, any> | Array<ScalarType | Record<string, any>>;

    // 错误信息（失败时）
    error?: string;

    // 用户拒绝原因（用户拒绝时）
    rejectReason?: string;

    // === 以下字段由 ToolExecutor.execute 自动填充 ===
    // 是否被截断
    isTruncated?: boolean;

    // 格式化后的数据 ( data --> format)
    formattedText?: string;
    // 最终发送给 LLM 的文本 ( data --> format --> truncate)
    finalText?: string;

    // 缓存文件路径（原始数据保存位置）
    cacheFile?: string;
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

export type ToolPermission = {
    // 工具权限级别
    permissionLevel?: ToolPermissionLevel;

    // 是否需要执行前权限检查，默认为 true
    // 设置为 false 可以跳过执行前权限检查，即使 permissionLevel 不是 PUBLIC
    requireExecutionApproval?: boolean;

    // 是否需要结果权限检查，默认为 false
    // 设置为 true 可以启用结果权限检查，要求用户确认是否将结果发送给 LLM
    requireResultApproval?: boolean;
}

// @deprecated
// /**
//  * 工具定义（带权限级别）
//  */
// export type ToolDefinitionWithPermission = IToolDefinition & {
//     // 工具权限级别
//     permissionLevel?: ToolPermissionLevel;

//     // 是否需要执行前权限检查，默认为 true
//     // 设置为 false 可以跳过执行前权限检查，即使 permissionLevel 不是 PUBLIC
//     requireExecutionApproval?: boolean;

//     // 是否需要结果权限检查，默认为 false
//     // 设置为 true 可以启用结果权限检查，要求用户确认是否将结果发送给 LLM
//     requireResultApproval?: boolean;
// };

/**
 * 工具执行函数
 */
export type ToolExecuteFunction = (
    args: Record<string, any>
) => Promise<ToolExecuteResult>;

/**
 * 工具对象
 * execute --> format --> truncate --> LLM 模型
 */
export interface Tool {
    // @deprecated
    // definition: ToolDefinitionWithPermission
    definition: IToolDefinition;

    permission: ToolPermission;

    SKIP_EXTERNAL_TRUNCATE?: boolean;
    DEFAULT_OUTPUT_LIMIT_CHAR?: number;

    SKIP_CACHE_RESULT?: boolean;

    /**
     * 声明工具成功执行后 result.data 的类型（用于 ToolCallScript 参考）
     * 这有助于 LLM 在编写脚本时了解 TOOL_CALL 返回的数据结构
     */
    declaredReturnType?: {
        /** TypeScript 类型表达式，如 "DocumentSummary[]" 或 "{ id: string; content: string }" */
        type: string;
        /** 补充说明，如字段含义、特殊情况等 */
        note?: string;
    };

    execute: ToolExecuteFunction;

    // 可选的参数压缩函数，用于在工具链日志中显示简化的参数信息
    compressArgs?: (args: Record<string, any>) => string;

    // 可选的结果压缩函数，用于在工具链日志中显示简化的结果信息
    compressResult?: (result: ToolExecuteResult) => string;

    // 格式化函数：将原始 data 转换为适合 LLM 的文本
    // 如果未定义，将使用默认格式化逻辑（JSON.stringify）
    formatForLLM?: (data: ToolExecuteResult['data'], args: Record<string, any>) => string;

    // 截断函数：对格式化后的文本进行截断处理
    // 工具可以使用自己的 args 参数（如 limit/begin）来实现自定义截断逻辑
    // 如果未定义，将使用默认的头尾截断逻辑
    truncateForLLM?: (formatted: string, args: Record<string, any>) => string;

    // group?: 'web' | 'siyuan' | 'file-system';
}

export interface ToolGroup {
    name: string;
    tools: Tool[];
    /**
     * 工具组的规则提示
     * - 字符串：静态提示
     * - 函数：动态提示，接收当前启用的工具名列表作为参数
     */
    rulePrompt?: string | ((enabledToolNames: string[]) => string);
    // dynamicStatePrompt?: () => string;  //为后面做 Memory 机制做准备
}

export interface IExternalToolUnit {
    type: 'script';  // 暂时先只支持 script

    scriptType?: 'python';  // 暂时先只支持 python
    // 默认先只允许添加
    scriptLocation?: 'machine' | 'siyuan'; // 在本机某个特定位置，或者是在思源工作空间内的位置
    scriptPath?: string;
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
     * @param toolDefinition 工具定义（可选，用于安全审查等）
     * @returns 用户决策
     */
    showToolExecutionApproval(
        toolName: string,
        toolDescription: string,
        args: Record<string, any>,
        toolDefinition?: IToolDefinition & ToolPermission
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


// ============================================================================
// 内联审批相关类型
// ============================================================================

/**
 * 待审批项
 */
export interface PendingApproval {
    id: string;
    type: 'execution' | 'result';
    toolName: string;
    toolDescription?: string;
    toolDefinition?: IToolDefinition & ToolPermission;
    args: Record<string, any>;
    result?: ToolExecuteResult;  // 仅 type='result' 时存在
    createdAt: number;
    // 内部使用，用于 Promise 决议
    resolve: (decision: { approved: boolean; rejectReason?: string }) => void;
}

