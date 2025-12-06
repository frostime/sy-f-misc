/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-29
 * @FilePath     : /src/func/gpt/tools/python-session/manager.ts
 * @Description  : Python Session Service 进程管理器
 */

import { PythonServiceStatus } from './types';
import { PythonSessionAPI, createPythonSessionAPI } from './api';

// Node.js 模块
const childProcess = window?.require?.('child_process');
const path = window?.require?.('path');
const crypto = window?.require?.('crypto');
const net = window?.require?.('net');

// Python 脚本路径（相对于插件目录）
const PYTHON_SCRIPT_NAME = 'python_session_service.py';

/**
 * 查找可用端口
 */
const findAvailablePort = (): Promise<number> => {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => {
                resolve(port);
            });
        });
        server.on('error', reject);
    });
};

/**
 * 生成安全的随机 Token
 */
const generateToken = (): string => {
    return crypto.randomUUID();
};

/**
 * 等待指定毫秒
 */
const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Python 服务进程管理器
 * 负责启动、停止和监控 Python Session Service 进程
 */
export class PythonProcessManager {
    private process: any = null; // ChildProcess
    private port: number | null = null;
    private token: string | null = null;
    private status: PythonServiceStatus = { running: false };
    private api: PythonSessionAPI | null = null;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private statusChangeCallbacks: Array<(status: PythonServiceStatus) => void> = [];

    /**
     * 获取当前服务状态
     */
    getStatus(): PythonServiceStatus {
        return { ...this.status };
    }

    /**
     * 获取 API 客户端
     */
    getAPI(): PythonSessionAPI | null {
        return this.api;
    }

    /**
     * 获取服务端口
     */
    getPort(): number {
        return this.port ?? 0;
    }

    /**
     * 获取认证 Token
     */
    getToken(): string | null {
        return this.token;
    }

    /**
     * 获取进程 PID
     */
    getPid(): number | null {
        return this.process?.pid ?? null;
    }

    /**
     * 检查服务是否正在运行
     */
    async isServiceRunning(): Promise<boolean> {
        if (!this.status.running || !this.api) {
            return false;
        }

        try {
            const health = await this.api.healthCheck();
            return health.status === 'ok';
        } catch {
            return false;
        }
    }

    /**
     * 注册状态变化回调
     */
    onStatusChange(callback: (status: PythonServiceStatus) => void): () => void {
        this.statusChangeCallbacks.push(callback);
        return () => {
            const index = this.statusChangeCallbacks.indexOf(callback);
            if (index !== -1) {
                this.statusChangeCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * 通知状态变化
     */
    private notifyStatusChange(): void {
        const currentStatus = this.getStatus();
        this.statusChangeCallbacks.forEach(cb => cb(currentStatus));
    }

    /**
     * 更新状态
     */
    private updateStatus(updates: Partial<PythonServiceStatus>): void {
        this.status = { ...this.status, ...updates };
        this.notifyStatusChange();
    }

    /**
     * 获取 Python 脚本路径
     */
    private getScriptPath(): string {
        // 获取插件目录
        const pluginDir = globalThis.siyuan?.config?.system?.workspaceDir
            ? path.join(globalThis.siyuan.config.system.workspaceDir, 'data', 'plugins', 'sy-f-misc')
            : '';

        if (!pluginDir) {
            throw new Error('无法确定插件目录');
        }

        return path.join(pluginDir, 'scripts', PYTHON_SCRIPT_NAME);
    }

    /**
     * 启动 Python 服务
     */
    async start(options?: { workdir?: string }): Promise<boolean> {
        if (this.status.running) {
            console.warn('Python 服务已在运行');
            return true;
        }

        if (!childProcess) {
            this.updateStatus({
                running: false,
                error: '当前环境不支持启动子进程（需要 Electron 环境）'
            });
            return false;
        }

        try {
            // 生成 Token 和端口
            this.token = generateToken();
            this.port = await findAvailablePort();

            // 准备环境变量
            const env = {
                ...process.env,
                PYSESSION_TOKEN: this.token,
                PYSESSION_PORT: String(this.port),
                PYSESSION_EXEC_TIMEOUT: '30'
            };

            if (options?.workdir) {
                env['PYSESSION_WORKDIR'] = options.workdir;
            }

            // 获取脚本路径
            const scriptPath = this.getScriptPath();
            console.log(`启动 Python 服务: ${scriptPath}`);
            console.log(`端口: ${this.port}, Token: ${this.token.slice(0, 8)}...`);

            // 启动进程
            this.process = childProcess.spawn('python', [scriptPath], {
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false
            });

            // 监听标准输出
            this.process.stdout?.on('data', (data: Buffer) => {
                console.log('[Python Service]', data.toString().trim());
            });

            // 监听标准错误
            this.process.stderr?.on('data', (data: Buffer) => {
                console.error('[Python Service Error]', data.toString().trim());
            });

            // 监听进程退出
            this.process.on('exit', (code: number | null, signal: string | null) => {
                this.handleProcessExit(code, signal);
            });

            this.process.on('error', (err: Error) => {
                console.error('Python 进程错误:', err);
                this.updateStatus({
                    running: false,
                    error: `进程错误: ${err.message}`
                });
            });

            // 等待服务就绪
            const ready = await this.waitForReady();

            if (ready) {
                this.api = createPythonSessionAPI(this.port, this.token);
                this.updateStatus({
                    running: true,
                    port: this.port,
                    token: this.token,
                    error: undefined,
                    startTime: Date.now()
                });

                // 启动健康检查
                this.startHealthCheck();

                console.log('Python 服务启动成功');
                return true;
            } else {
                await this.stop();
                this.updateStatus({
                    running: false,
                    error: '服务启动超时'
                });
                return false;
            }
        } catch (error) {
            console.error('启动 Python 服务失败:', error);
            this.updateStatus({
                running: false,
                error: `启动失败: ${error.message}`
            });
            return false;
        }
    }

    /**
     * 等待服务就绪
     */
    private async waitForReady(maxRetries: number = 30, interval: number = 500): Promise<boolean> {
        const tempApi = createPythonSessionAPI(this.port!, this.token!);

        for (let i = 0; i < maxRetries; i++) {
            try {
                const health = await tempApi.healthCheck();
                if (health.status === 'ok') {
                    return true;
                }
            } catch {
                // 服务尚未就绪，继续等待
            }
            await sleep(interval);
        }

        return false;
    }

    /**
     * 停止 Python 服务
     */
    async stop(): Promise<void> {
        // 停止健康检查
        this.stopHealthCheck();

        if (this.process) {
            try {
                // 优雅关闭：发送 SIGTERM
                this.process.kill('SIGTERM');

                // 等待进程退出
                await new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => {
                        // 强制关闭
                        if (this.process) {
                            this.process.kill('SIGKILL');
                        }
                        resolve();
                    }, 5000);

                    if (this.process) {
                        this.process.once('exit', () => {
                            clearTimeout(timeout);
                            resolve();
                        });
                    } else {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            } catch (error) {
                console.error('停止 Python 服务时出错:', error);
            }
        }

        this.process = null;
        this.api = null;
        this.port = null;
        this.token = null;

        this.updateStatus({
            running: false,
            port: undefined,
            token: undefined,
            sessionCount: undefined,
            startTime: undefined
        });

        console.log('Python 服务已停止');
    }

    /**
     * 处理进程退出
     */
    private handleProcessExit(code: number | null, signal: string | null): void {
        console.log(`Python 进程退出: code=${code}, signal=${signal}`);

        this.stopHealthCheck();
        this.process = null;
        this.api = null;

        const wasRunning = this.status.running;

        if (wasRunning) {
            // 非预期退出
            this.updateStatus({
                running: false,
                error: code !== 0 ? `进程异常退出 (code: ${code})` : '服务已关闭'
            });
        }
    }

    /**
     * 启动健康检查
     */
    private startHealthCheck(): void {
        this.stopHealthCheck();

        this.healthCheckInterval = setInterval(async () => {
            if (!this.api || !this.status.running) {
                return;
            }

            try {
                const health = await this.api.healthCheck();
                this.updateStatus({
                    sessionCount: health.sessions
                });
            } catch (error) {
                console.warn('健康检查失败:', error);
                // 连续失败可能表示服务已挂
                // 这里可以添加更复杂的逻辑
            }
        }, 10000); // 每 10 秒检查一次
    }

    /**
     * 停止健康检查
     */
    private stopHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * 执行健康检查（手动）
     */
    async healthCheck(): Promise<boolean> {
        if (!this.api) {
            return false;
        }

        try {
            const health = await this.api.healthCheck();
            this.updateStatus({
                sessionCount: health.sessions
            });
            return health.status === 'ok';
        } catch {
            return false;
        }
    }
}

/**
 * 全局 Python 服务管理器单例
 */
export const pythonServiceManager = new PythonProcessManager();
