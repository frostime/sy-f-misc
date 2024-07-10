import type FMiscPlugin from "@/index";
import WebSocketManager from "./ws-manager";


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
}

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    if (webSocketManager) {
        webSocketManager.unload();
        webSocketManager = null;
    }
}
