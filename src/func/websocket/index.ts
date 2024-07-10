/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-10 15:35:35
 * @FilePath     : /src/func/websocket/index.ts
 * @LastEditTime : 2024-07-10 18:16:35
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import WebSocketManager from "./ws-manager";
import { appendBlock } from "@/api";


/**
 * 把 text 添加到我的 dailynote 快记当中
 * @param text 
 * @returns 
 */
const appendDnList = async (text: string) => {
    let name = 'custom-dn-quicklist';

    let today = new Date();
    let year = today.getFullYear();
    let month = (today.getMonth() + 1).toString().padStart(2, '0');
    let day = today.getDate().toString().padStart(2, '0');
    let v = `${year}${month}${day}`; // 20240710

    let blocks: Block[] = await globalThis.Query.attr(name, v);
    if (blocks.length !== 1) return;
    let id = blocks[0].id;

    let hours = today.getHours().toString().padStart(2, '0');
    let minutes = today.getMinutes().toString().padStart(2, '0');
    let seconds = today.getSeconds().toString().padStart(2, '0');
    let timestr = `${hours}:${minutes}:${seconds}`; // 12:10:10

    appendBlock('markdown', `- [${timestr}] ${text}`, id);
}



export let name = "WebSocket";
export let enabled = false;
let webSocketManager: WebSocketManager | null = null;

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    webSocketManager = new WebSocketManager(plugin, { 
        reconnectInterval: 5000, maxReconnectAttempts: 10
    });
    webSocketManager.createWebSocket();

    webSocketManager.registerMessageHandler('dn-quicklist', appendDnList)
}

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    if (webSocketManager) {
        webSocketManager.unload();
        webSocketManager = null;
    }
}
