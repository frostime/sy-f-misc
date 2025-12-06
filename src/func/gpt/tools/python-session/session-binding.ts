/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-29
 * @FilePath     : /src/func/gpt/tools/python-session/session-binding.ts
 * @Description  : ChatSession 与 Python Session 的绑定管理
 */

import { pythonServiceManager } from './manager';
import { PythonSessionAPI } from './api';

/**
 * ChatSession ID -> Python Session ID 的绑定映射
 */
const sessionBindings = new Map<string, string>();

/**
 * 获取 API 客户端
 */
const getAPI = (): PythonSessionAPI | null => {
    return pythonServiceManager.getAPI();
};

/**
 * 为 ChatSession 绑定一个 Python Session
 * 如果已经绑定，返回现有的 Python Session ID
 * 如果服务未运行，返回 null
 *
 * @param chatSessionId ChatSession 的 ID
 * @param workdir 可选的工作目录
 * @returns Python Session ID 或 null
 */
export const bindPythonSession = async (
    chatSessionId: string,
    workdir?: string
): Promise<string | null> => {
    // 如果已绑定，返回现有的
    const existingSessionId = sessionBindings.get(chatSessionId);
    if (existingSessionId) {
        // 验证 Session 是否仍然有效
        const api = getAPI();
        if (api) {
            try {
                const info = await api.getSessionInfo(existingSessionId);
                if (!info.is_closed) {
                    return existingSessionId;
                }
            } catch {
                // Session 已失效，需要重新创建
            }
        }
        // 清理无效绑定
        sessionBindings.delete(chatSessionId);
    }

    // 检查服务是否运行
    const status = pythonServiceManager.getStatus();
    if (!status.running) {
        return null;
    }

    const api = getAPI();
    if (!api) {
        return null;
    }

    try {
        // 创建新的 Python Session
        const response = await api.startSession(workdir);
        const pythonSessionId = response.session_id;

        // 建立绑定
        sessionBindings.set(chatSessionId, pythonSessionId);

        console.log(`绑定 Python Session: Chat=${chatSessionId} -> Python=${pythonSessionId}`);
        return pythonSessionId;
    } catch (error) {
        console.error('创建 Python Session 失败:', error);
        return null;
    }
};

/**
 * 解除 ChatSession 的 Python Session 绑定
 *
 * @param chatSessionId ChatSession 的 ID
 */
export const unbindPythonSession = async (chatSessionId: string): Promise<void> => {
    const pythonSessionId = sessionBindings.get(chatSessionId);
    if (!pythonSessionId) {
        return;
    }

    const api = getAPI();
    if (api) {
        try {
            await api.closeSession(pythonSessionId);
            console.log(`关闭 Python Session: ${pythonSessionId}`);
        } catch (error) {
            console.warn('关闭 Python Session 失败:', error);
        }
    }

    sessionBindings.delete(chatSessionId);
};

/**
 * 获取 ChatSession 绑定的 Python Session ID
 *
 * @param chatSessionId ChatSession 的 ID
 * @returns Python Session ID 或 undefined
 */
export const getPythonSessionId = (chatSessionId: string): string | undefined => {
    return sessionBindings.get(chatSessionId);
};

/**
 * 检查 ChatSession 是否有绑定的 Python Session
 *
 * @param chatSessionId ChatSession 的 ID
 */
export const hasPythonSession = (chatSessionId: string): boolean => {
    return sessionBindings.has(chatSessionId);
};

/**
 * 清理所有 Python Session 绑定
 * 用于服务关闭或插件卸载时
 */
export const clearAllBindings = async (): Promise<void> => {
    const api = getAPI();

    if (api) {
        // 尝试关闭所有绑定的 Session
        const promises = Array.from(sessionBindings.values()).map(async (pythonSessionId) => {
            try {
                await api.closeSession(pythonSessionId);
            } catch (error) {
                console.warn(`关闭 Python Session ${pythonSessionId} 失败:`, error);
            }
        });

        await Promise.allSettled(promises);
    }

    sessionBindings.clear();
    console.log('已清理所有 Python Session 绑定');
};

/**
 * 获取当前绑定数量
 */
export const getBindingCount = (): number => {
    return sessionBindings.size;
};

/**
 * 获取所有绑定信息（用于调试）
 */
export const getAllBindings = (): Map<string, string> => {
    return new Map(sessionBindings);
};
