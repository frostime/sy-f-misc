/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-29
 * @FilePath     : /src/func/gpt/tools/python-session/types.ts
 * @Description  : Python Session 工具相关类型定义
 */

/**
 * Python 服务状态
 */
export interface PythonServiceStatus {
    /** 服务是否正在运行 */
    running: boolean;
    /** 服务端口 */
    port?: number;
    /** 认证 Token */
    token?: string;
    /** 活跃的 Session 数量 */
    sessionCount?: number;
    /** 错误信息 */
    error?: string;
    /** 服务启动时间 */
    startTime?: number;
}

/**
 * Python Session 信息
 */
export interface PythonSessionInfo {
    session_id: string;
    created_at: string;
    execution_count: number;
    is_closed: boolean;
    uptime_seconds: number;
    workdir: string;
}

/**
 * 变量信息
 */
export interface VarInfo {
    name: string;
    type: string;
    repr: string;
}

/**
 * 执行错误详情
 */
export interface ExecErrorDetail {
    ename: string;
    evalue: string;
    traceback: string[];
}

/**
 * 代码执行响应
 */
export interface ExecResponse {
    ok: boolean;
    stdout: string;
    stderr: string;
    result_repr?: string;
    error?: ExecErrorDetail;
    timed_out: boolean;
    execution_count: number;
}

/**
 * Session 启动响应
 */
export interface SessionStartResponse {
    session_id: string;
    created_at: string;
    workdir: string;
    message: string;
}

/**
 * 历史记录条目
 */
export interface HistoryEntry {
    execution_count: number;
    code: string;
    stdout: string;
    stderr: string;
    result_repr?: string;
    error?: ExecErrorDetail;
    ok: boolean;
}
