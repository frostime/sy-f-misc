/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-29
 * @FilePath     : /src/func/gpt/tools/python-session/api.ts
 * @Description  : Python Session Service HTTP API 客户端
 */

import {
    PythonSessionInfo,
    VarInfo,
    ExecResponse,
    SessionStartResponse,
    HistoryEntry
} from './types';

/**
 * Python Session API 客户端
 * 封装与 Python Session Service 的 HTTP 通信
 */
export class PythonSessionAPI {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // 移除末尾斜杠
        this.token = token;
    }

    /**
     * 发送 HTTP 请求的通用方法
     */
    private async request<T>(
        method: 'GET' | 'POST' | 'DELETE',
        path: string,
        body?: Record<string, any>
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };

        const options: RequestInit = {
            method,
            headers
        };

        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.detail || errorJson.message || errorMessage;
            } catch {
                if (errorText) {
                    errorMessage = errorText;
                }
            }
            throw new Error(errorMessage);
        }

        return response.json();
    }

    // ==================== Session 管理 ====================

    /**
     * 健康检查
     */
    async healthCheck(): Promise<{ status: string; sessions: number }> {
        return this.request('GET', '/health');
    }

    /**
     * 创建新 Session
     */
    async startSession(workdir?: string): Promise<SessionStartResponse> {
        const payload = workdir ? { workdir } : {};
        return this.request('POST', '/v1/session/start', payload);
    }

    /**
     * 获取 Session 信息
     */
    async getSessionInfo(sessionId: string): Promise<PythonSessionInfo> {
        return this.request('GET', `/v1/session/${sessionId}/info`);
    }

    /**
     * 列出所有活跃 Sessions
     */
    async listSessions(): Promise<{ sessions: PythonSessionInfo[]; total: number }> {
        return this.request('GET', '/v1/sessions');
    }

    /**
     * 关闭 Session
     */
    async closeSession(sessionId: string): Promise<{ status: string; message: string }> {
        return this.request('DELETE', `/v1/session/${sessionId}`);
    }

    /**
     * 重置 Session
     */
    async resetSession(sessionId: string): Promise<{ status: string; message: string }> {
        return this.request('POST', `/v1/session/${sessionId}/reset`);
    }

    // ==================== 代码执行 ====================

    /**
     * 执行代码
     */
    async executeCode(
        sessionId: string,
        code: string,
        timeout?: number
    ): Promise<ExecResponse> {
        const payload: { code: string; timeout?: number } = { code };
        if (timeout !== undefined) {
            payload.timeout = timeout;
        }
        return this.request('POST', `/v1/session/${sessionId}/exec`, payload);
    }

    // ==================== 变量操作 ====================

    /**
     * 列出变量
     */
    async listVariables(sessionId: string): Promise<{ variables: VarInfo[] }> {
        return this.request('GET', `/v1/session/${sessionId}/vars`);
    }

    /**
     * 获取指定变量
     */
    async getVariables(
        sessionId: string,
        names: string[]
    ): Promise<{ values: Record<string, VarInfo | null> }> {
        return this.request('POST', `/v1/session/${sessionId}/vars/get`, { names });
    }

    // ==================== 历史记录 ====================

    /**
     * 获取执行历史
     */
    async getHistory(
        sessionId: string,
        n: number = 10
    ): Promise<{ entries: HistoryEntry[]; total: number }> {
        return this.request('GET', `/v1/session/${sessionId}/history?n=${n}`);
    }
}

/**
 * 创建 API 客户端实例
 */
export const createPythonSessionAPI = (port: number, token: string): PythonSessionAPI => {
    const baseUrl = `http://127.0.0.1:${port}`;
    return new PythonSessionAPI(baseUrl, token);
};
