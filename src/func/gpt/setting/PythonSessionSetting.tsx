/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-29
 * @FilePath     : /src/func/gpt/setting/PythonSessionSetting.tsx
 * @Description  : Python Session 服务设置组件
 */

import { Component, createSignal, createEffect, onCleanup, Show } from 'solid-js';
import { pythonServiceManager, getBindingCount } from '../tools/python-session';

/**
 * Python Session 服务设置组件
 * 用于控制 Python 服务的启动/停止，显示服务状态
 */
export const PythonSessionSetting: Component = () => {
    const [isRunning, setIsRunning] = createSignal(false);
    const [isLoading, setIsLoading] = createSignal(false);
    const [statusMessage, setStatusMessage] = createSignal('');
    const [serviceInfo, setServiceInfo] = createSignal<{
        port: number;
        pid: number | null;
    } | null>(null);
    const [activeSessionCount, setActiveSessionCount] = createSignal(0);

    // 定期检查服务状态
    const checkStatus = async () => {
        try {
            const running = await pythonServiceManager.isServiceRunning();
            setIsRunning(running);

            if (running) {
                setServiceInfo({
                    port: pythonServiceManager.getPort(),
                    pid: pythonServiceManager.getPid()
                });
                setActiveSessionCount(getBindingCount());
            } else {
                setServiceInfo(null);
                setActiveSessionCount(0);
            }
        } catch (error) {
            console.error('Failed to check Python service status:', error);
        }
    };

    // 初始检查和定期轮询
    createEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 5000); // 每 5 秒检查一次
        onCleanup(() => clearInterval(interval));
    });

    // 启动服务
    const handleStart = async () => {
        setIsLoading(true);
        setStatusMessage('正在启动 Python 服务...');

        try {
            const success = await pythonServiceManager.start();
            if (success) {
                setStatusMessage('Python 服务启动成功');
                await checkStatus();
            } else {
                setStatusMessage('Python 服务启动失败');
            }
        } catch (error) {
            setStatusMessage(`启动失败: ${error.message}`);
        } finally {
            setIsLoading(false);
            // 3 秒后清除状态消息
            setTimeout(() => setStatusMessage(''), 3000);
        }
    };

    // 停止服务
    const handleStop = async () => {
        if (activeSessionCount() > 0) {
            const confirmed = confirm(
                `当前有 ${activeSessionCount()} 个活跃的 Python Session，停止服务将会中断这些 Session。确定要停止吗？`
            );
            if (!confirmed) return;
        }

        setIsLoading(true);
        setStatusMessage('正在停止 Python 服务...');

        try {
            await pythonServiceManager.stop();
            setStatusMessage('Python 服务已停止');
            await checkStatus();
        } catch (error) {
            setStatusMessage(`停止失败: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setStatusMessage(''), 3000);
        }
    };

    // 重启服务
    const handleRestart = async () => {
        if (activeSessionCount() > 0) {
            const confirmed = confirm(
                `当前有 ${activeSessionCount()} 个活跃的 Python Session，重启服务将会中断这些 Session。确定要重启吗？`
            );
            if (!confirmed) return;
        }

        setIsLoading(true);
        setStatusMessage('正在重启 Python 服务...');

        try {
            await pythonServiceManager.stop();
            await new Promise(resolve => setTimeout(resolve, 500));
            const success = await pythonServiceManager.start();
            if (success) {
                setStatusMessage('Python 服务重启成功');
            } else {
                setStatusMessage('Python 服务重启失败');
            }
            await checkStatus();
        } catch (error) {
            setStatusMessage(`重启失败: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setStatusMessage(''), 3000);
        }
    };

    return (
        <div class="python-session-setting">
            <div class="fn__flex-column" style={{ gap: '12px' }}>
                {/* 服务状态 */}
                <div class="fn__flex" style={{ "align-items": "center", gap: '8px' }}>
                    <span class="b3-label__text">Python 交互服务状态:</span>
                    <span
                        class="b3-chip"
                        style={{
                            background: isRunning() ? 'var(--b3-card-success-background)' : 'var(--b3-card-warning-background)',
                            color: isRunning() ? 'var(--b3-card-success-color)' : 'var(--b3-card-warning-color)'
                        }}
                    >
                        {isRunning() ? '运行中' : '已停止'}
                    </span>
                </div>

                {/* 服务详情 */}
                <Show when={isRunning() && serviceInfo()}>
                    <div class="fn__flex-column" style={{ gap: '4px', "padding-left": '16px' }}>
                        <span class="b3-label__text" style={{ "font-size": '12px', color: 'var(--b3-theme-on-surface-light)' }}>
                            端口: {serviceInfo()!.port}
                        </span>
                        <Show when={serviceInfo()!.pid}>
                            <span class="b3-label__text" style={{ "font-size": '12px', color: 'var(--b3-theme-on-surface-light)' }}>
                                进程 PID: {serviceInfo()!.pid}
                            </span>
                        </Show>
                        <span class="b3-label__text" style={{ "font-size": '12px', color: 'var(--b3-theme-on-surface-light)' }}>
                            活跃 Session 数: {activeSessionCount()}
                        </span>
                    </div>
                </Show>

                {/* 操作按钮 */}
                <div class="fn__flex" style={{ gap: '8px' }}>
                    <Show when={!isRunning()}>
                        <button
                            class="b3-button b3-button--outline"
                            disabled={isLoading()}
                            onClick={handleStart}
                        >
                            {isLoading() ? '处理中...' : '启动服务'}
                        </button>
                    </Show>

                    <Show when={isRunning()}>
                        <button
                            class="b3-button b3-button--outline"
                            disabled={isLoading()}
                            onClick={handleStop}
                        >
                            {isLoading() ? '处理中...' : '停止服务'}
                        </button>
                        <button
                            class="b3-button b3-button--outline"
                            disabled={isLoading()}
                            onClick={handleRestart}
                        >
                            {isLoading() ? '处理中...' : '重启服务'}
                        </button>
                    </Show>
                </div>

                {/* 状态消息 */}
                <Show when={statusMessage()}>
                    <div class="b3-label__text" style={{ color: 'var(--b3-theme-primary)' }}>
                        {statusMessage()}
                    </div>
                </Show>

                {/* 使用说明 */}
                <div class="b3-label__text" style={{ "font-size": '12px', color: 'var(--b3-theme-on-surface-light)', "margin-top": '8px' }}>
                    <p style={{ margin: '0 0 4px 0' }}>
                        Python 交互服务提供了一个持久化的 Python 执行环境，用于 LLM 工具调用。
                    </p>
                    <p style={{ margin: '0 0 4px 0' }}>
                        启动服务后，在工具设置中启用 "Python Interactive Session" 工具组即可使用。
                    </p>
                    <p style={{ margin: '0' }}>
                        每个聊天会话会自动获得一个独立的 Python Session，变量状态会在多轮对话中保持。
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PythonSessionSetting;
