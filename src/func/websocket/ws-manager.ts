/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-10 16:11:07
 * @FilePath     : /src/func/websocket/ws-manager.ts
 * @LastEditTime : 2024-07-10 18:15:33
 * @Description  : 
 */
import { Plugin } from 'siyuan';

interface IWsHandler<T = any> {
    method: string;
    payload: T;
}

interface IWsConfig {
    reconnectInterval: number;
    maxReconnectAttempts: number;
}


export default class WebSocketManager {
    private ws: WebSocket | null = null;
    private url: string = '';

    private isRunning: boolean = true;
    private isReconnecting: boolean = false;

    private reconnectTimeout: number | null = null;
    private reconnectAttempts: number = 0;
    private config: IWsConfig;
    private messageHandlers: { [key: string]: (payload: any) => void } = {};

    public plugin: Plugin

    constructor(plugin: Plugin, config?: Partial<IWsConfig>) {
        this.plugin = plugin;
        this.config = {
            reconnectInterval: 5000,
            maxReconnectAttempts: Infinity,
            ...config
        };
        this.validateConfig();
        this.initWebSocketUrl();
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

    private parseRequest(msg: string) {
        try {
            // Check if msg matches the format [[method]][[payload]]
            const match = msg.match(/^\[\[(.+?)\]\]\[\[(.+?)\]\]$/);
            if (!match) {
                return null;
            }

            const [, method, payload] = match;

            // Construct the data object
            const data: IWsHandler<any> = {
                method: method,
                payload: payload
            };

            if (data.method && data.payload !== undefined) {
                return data;
            }
        } catch (error) {
            // console.error('Failed to parse message:', error);
        }
        return null;
    }

    public createWebSocket() {
        if (this.ws) {
            console.debug('[WebSocket] already connected');
            return;
        }

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => this.onOpen();
        this.ws.onmessage = (event: MessageEvent) => this.onMessage(event);
        this.ws.onclose = (event: CloseEvent) => this.onClose(event);
        this.ws.onerror = (error: Event) => this.onError(error);
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

    private handleMessage<T>(message: IWsHandler<T>) {
        console.log(`[WebSocket] handler: ${JSON.stringify(message)}`);
        const handler = this.messageHandlers[message.method];
        if (handler) {
            handler(message.payload);
        } else {
            console.warn(`[WebSocket] no handler found for method: ${message.method}`);
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimeout) {
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
