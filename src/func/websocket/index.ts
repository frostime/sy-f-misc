/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-10 15:35:35
 * @FilePath     : /src/func/websocket/index.ts
 * @LastEditTime : 2025-02-10 14:29:05
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import WebSocketManager from "./ws-manager";

import { api } from "@frostime/siyuan-plugin-kits";

import { Configs } from "./components";
import { Handlers } from "./handlers";


export let name = "WebSocket";
export let enabled = false;

export const declareToggleEnabled = {
    title: '💬 WebSocket',
    description: '启用 WebSocket 功能',
    defaultEnabled: false
};

export const load = async (plugin: FMiscPlugin, signal?: AbortSignal) => {
    if (enabled) return;
    enabled = true;

    //检查 body class 中是否有 body--window
    const body = document.body;
    if (body.classList.contains('body--window')) {
        console.warn(`F-Misc::WebSocket 不在 SiYuan mini windows 中运行.`);
        return;
    }

    let info = await api.request('/api/broadcast/getChannelInfo', { name: plugin.name });
    if (signal?.aborted) return;
    if (info.channel?.count > 0) {
        console.info('已经存在 Web Socket 服务，无需重复连接.')
        console.log(info.channel);
        return;
    }

    const wsManager = WebSocketManager.create(plugin, {
        reconnectInterval: 5000, maxReconnectAttempts: 10
    });
    wsManager.createWebSocket();

    let handlers = await Handlers();
    if (signal?.aborted) return;
    Object.entries(handlers).forEach(([key, handler]) => {
        wsManager.registerMessageHandler(key, handler);
    });
}

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    WebSocketManager.destroyInstance();
}

export const getAlive = () => {
    const wsManager = WebSocketManager.getInstance();
    return wsManager?.isOpen() ?? false;
}

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'WebSocket',
    load: () => { },
    items: [],
    customPanel: () => {
        return Configs();
    }
}

