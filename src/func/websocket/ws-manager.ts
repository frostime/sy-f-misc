/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-10 16:11:07
 * @FilePath     : /src/func/websocket/ws-manager.ts
 * @LastEditTime : 2025-02-26 23:51:44
 * @Description  : 
 */
import { Plugin } from 'siyuan';

interface IMessage {
    command: string;
    body: string | Record<string, any>;
}

interface IWsConfig {
    reconnectInterval: number;
    maxReconnectAttempts: number;
}


export default class WebSocketManager {
    private static instance: WebSocketManager | null = null;
    private ws: WebSocket | null = null;
    private url: string = '';

    private isRunning: boolean = true;
    private isReconnecting: boolean = false;

    private reconnectTimeout: number | null = null;
    private reconnectAttempts: number = 0;
    private config: IWsConfig;
    private messageHandlers: { [key: string]: (payload: any) => void } = {};

    public plugin: Plugin

    private constructor(plugin: Plugin, config?: Partial<IWsConfig>) {
        this.plugin = plugin;
        this.config = {
            reconnectInterval: 5000,
            maxReconnectAttempts: 5,
            ...config
        };
        this.validateConfig();
        this.initWebSocketUrl();
    }

    public static create(plugin: Plugin, config?: Partial<IWsConfig>): WebSocketManager {
        if (!WebSocketManager.instance) {
            WebSocketManager.instance = new WebSocketManager(plugin, config);
        }
        return WebSocketManager.instance;
    }

    public static getInstance(): WebSocketManager | null {
        return WebSocketManager.instance;
    }

    public static destroyInstance(): void {
        if (WebSocketManager.instance) {
            WebSocketManager.instance.unload();
            WebSocketManager.instance = null;
        }
    }

    private validateConfig() {
        if (this.config.reconnectInterval <= 0) {
            throw new Error('reconnectInterval must be a positive number');
        }
        if (this.config.maxReconnectAttempts < 0) {
            throw new Error('maxReconnectAttempts must be a non-negative number');
        }
    }

    public isOpen(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    private initWebSocketUrl() {
        const prefix = window.siyuan.ws.ws.url.split('?')[0];
        this.url = `${prefix}/broadcast?channel=${this.plugin.name}`;
    }

    private parseRequest(msg: string): IMessage | null {
        try {
            // Check if msg matches the format [[method]][[payload]]
            const data = JSON.parse(msg);
            if (!data) {
                return null;
            }

            if (data.command && data.body !== undefined) {
                return data;
            }
        } catch (error) {
            // console.error('Failed to parse message:', error);
        }
        return null;
    }

    async createWebSocket() {
        if (this.ws) {
            console.debug('[WebSocket] already connected');
            return;
        }

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => this.onOpen();
            this.ws.onmessage = (event: MessageEvent) => this.onMessage(event);
            this.ws.onclose = (event: CloseEvent) => this.onClose(event);
            this.ws.onerror = (error: Event) => this.onError(error);

            // 添加连接超时检查
            const connectionTimeout = setTimeout(() => {
                if (this.ws?.readyState !== WebSocket.OPEN) {
                    console.warn('[WebSocket] Connection timeout');
                    this.ws?.close();
                    throw new Error('WebSocket connection timeout');
                }
            }, 5000);

            // 等待连接成功或失败
            await new Promise((resolve, reject) => {
                this.ws!.onopen = () => {
                    clearTimeout(connectionTimeout);
                    this.onOpen();
                    resolve(true);
                };
                this.ws!.onerror = (error) => {
                    clearTimeout(connectionTimeout);
                    reject(error);
                };
            });

        } catch (error) {
            console.error('[WebSocket] Failed to create connection:', error);
            this.ws = null;
            this.scheduleReconnect();
        }
    }

    private onOpen() {
        console.debug('[WebSocket] connection opened');
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
    }

    private onMessage(event: MessageEvent) {
        console.debug('[WebSocket] message received:', event.data);
        const parsedMessage = this.parseRequest(event.data);
        if (parsedMessage) {
            this.handleMessage(parsedMessage);
        }
    }

    private onClose(event: CloseEvent) {
        console.debug('[WebSocket] connection closed:', event.code, event.reason);
        this.ws = null;

        if (!this.isRunning) return; //已经退出，不要安排重连调度
        if (this.isReconnecting) return; //正在重连，不要安排重连调度
        if (this.reconnectAttempts > this.config.maxReconnectAttempts) return;
        this.scheduleReconnect();
    }

    private onError(error: Event) {
        console.error('[WebSocket] error:', error);
    }

    private handleMessage(message: IMessage) {
        console.log(`[WebSocket] handler: ${message}`);
        const handler = this.messageHandlers[message.command];
        if (handler) {
            handler(message.body);
        } else {
            console.warn(`[WebSocket] no handler found for method: ${message.command}`);
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimeout) {
            return;
        }
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.warn(`[WebSocket] Max reconnect attempts reached: ${this.reconnectAttempts}`);
            return;
        }
        this.isReconnecting = true;
        this.reconnectTimeout = window.setTimeout(() => {
            console.debug('[WebSocket] Reconnecting...');
            this.reconnectAttempts += 1;
            this.createWebSocket();
        }, this.config.reconnectInterval);
    }

    public unload() {
        this.isRunning = false;
        this.isReconnecting = false;

        //关闭 ws
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        //如果有正在排队中的重连任务，就关掉
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    public registerMessageHandler<T>(method: string, handler: (payload: T) => void) {
        this.messageHandlers[method] = handler;
    }

    public unregisterMessageHandler(method: string) {
        delete this.messageHandlers[method];
    }
}
