/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-10 16:11:07
 * @FilePath     : /src/func/websocket/ws-manager.ts
 * @LastEditTime : 2024-07-10 16:12:29
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

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
    private reconnectTimeout: number | null = null;
    private isReconnecting: boolean = false;
    private reconnectAttempts: number = 0;
    private config: IWsConfig;
    private messageHandlers: { [key: string]: (payload: any) => void } = {};

    constructor(private plugin: FMiscPlugin, config?: Partial<IWsConfig>) {
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

    private parseRequest<T>(msg: string): IWsHandler<T> | null {
        try {
            const data = JSON.parse(msg);
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
        console.debug('[WebSocket] connection closed:', event.reason);
        this.ws = null;
        if (!this.isReconnecting && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }

    private onError(error: Event) {
        console.error('[WebSocket] error:', error);
    }

    private handleMessage<T>(message: IWsHandler<T>) {
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
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.isReconnecting = false;
    }

    public registerMessageHandler<T>(method: string, handler: (payload: T) => void) {
        this.messageHandlers[method] = handler;
    }

    public unregisterMessageHandler(method: string) {
        delete this.messageHandlers[method];
    }
}
