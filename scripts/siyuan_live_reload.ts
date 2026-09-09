/*
 * Adapted from https://github.com/siyuan-note/plugin-sample-vite-svelte
 * (scripts/siyuan_live_reload.js, MIT License)
 *
 * SiYuan 插件的 dev-only live reload：
 * - server 端（useLiveReload 插件）：监听 livereload WebSocket，输出目录文件变更时广播 reload
 * - client 端（以 banner 注入插件 bundle 的脚本）：收到 reload 后调用 /api/petal/setPetalEnabled
 *   将插件关闭再开启，实现思源内自动重载，无需手动去设置里开关插件
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer as createLiveReloadServer } from "livereload";
import type { Plugin } from "vite";

export interface LiveReloadOptions {
    /** vite 输出目录（相对项目根），server 监听该目录的文件变更 */
    outputDir: string;
    /**
     * livereload server 端口。会烘焙进客户端 bundle，因此必须确定性；
     * 多个插件项目并行开发时，各项目使用不同端口（客户端会校验 server 归属）。
     */
    port?: number;
    /** 传给 /api/petal/setPetalEnabled 的 frontend 参数 */
    frontend?: string;
    /** 重载时 showMessage 的提示语，默认 "Live reload: <插件名>" */
    message?: string;
    /**
     * 防抖毫秒数：server 端延迟广播，client 端合并多条变更消息。
     * bundle 构建会分多轮写入 dev/，每轮都可能触发一次文件变更，故默认值刻意偏大。
     */
    debounceMs?: number;
    /** 插件 disable 与 enable 之间的间隔毫秒数 */
    reloadGapMs?: number;
}

/**
 * Dev 构建使用的 vite 插件：启动 livereload server，并把自动重载客户端
 * 以 banner 形式注入插件 bundle。仅在 dev 构建分支中调用。
 */
export function useLiveReload({
    outputDir,
    port = 31415,
    frontend = "desktop",
    message,
    debounceMs = 1000 * 5,
    reloadGapMs = 500,
}: LiveReloadOptions): Plugin {
    const manifest = readPluginManifest();
    const reloadMessage = message ?? `Live reload: ${manifest.name}`;
    console.log("liveReloadPort=>", port);

    let server: ReturnType<typeof createLiveReloadServer> | undefined;

    return {
        name: "siyuan-live-reload",
        buildStart() {
            if (server) {
                return;
            }
            server = createLiveReloadServer({ port, delay: debounceMs });
            server.on("error", (error: NodeJS.ErrnoException) => {
                if (error.code === "EADDRINUSE") {
                    console.error(
                        `[live-reload] 端口 ${port} 已被占用（可能是另一个插件项目的 dev watch）。\n` +
                        `  - 查看占用: netstat -ano | findstr ${port}\n` +
                        `  - 换端口: 设置环境变量 SIYUAN_LIVERELOAD_PORT=<port> 后重新构建`
                    );
                } else {
                    console.error(`[live-reload] unable to listen on port ${port}:`, error);
                }
                throw error;
            });
            // 握手身份广播：livereload 包 hello 响应的 serverName 是硬编码的、不可配置，
            // 故借底层 ws Server 的 connection 事件向每个新连接告知归属插件；
            // 客户端据此校验 owner，防止多插件并行开发时误连到别的项目的 server
            server.server.on("connection", (socket) => {
                socket.send(JSON.stringify({ command: "plugin-identity", plugin: manifest.name }));
            });
            server.watch(resolve(__dirname, outputDir));
        },
        closeWatcher() {
            // watch 模式结束时关闭 server
            server?.close();
            server = undefined;
        },
        closeBundle() {
            // CLI 一次性 build 结束时清理 server；watch 模式下本 hook 每次 rebuild 都会触发，
            // 必须保持 server 存活，仅在不处于 watch 模式时关闭
            if (!this.meta.watchMode) {
                server?.close();
                server = undefined;
            }
        },
        banner: () => createClientScript({
            port,
            pluginName: manifest.name,
            frontend,
            message: reloadMessage,
            debounceMs,
            reloadGapMs
        })
    };
}

function readPluginManifest(): { name: string } {
    // vite 会把本模块打进 config bundle，并把 __dirname 替换为 vite.config.ts 所在目录（项目根）；
    // 直接以 node 运行（如测试脚本）时 __dirname 是 scripts/，故向上多找一层
    for (const base of [__dirname, resolve(__dirname, "..")]) {
        const manifestPath = resolve(base, "plugin.json");
        if (existsSync(manifestPath)) {
            return JSON.parse(readFileSync(manifestPath, "utf8"));
        }
    }
    throw new Error("plugin.json not found (expected at project root)");
}

interface ClientOptions {
    /** livereload WebSocket server 端口（与 useLiveReload 启动的 server 配对） */
    port: number;
    pluginName: string;
    frontend: string;
    message: string;
    debounceMs: number;
    reloadGapMs: number;
}

/**
 * 生成注入 bundle 的客户端脚本。脚本会连接 livereload WebSocket 并校验
 * server 的 plugin-identity 身份，只有确认 server 归属本插件后才执行重载。
 */
function createClientScript({ port, pluginName, frontend, message, debounceMs, reloadGapMs }: ClientOptions): string {
    const values = JSON.stringify({ frontend, message, pluginName, port, debounceMs, reloadGapMs });

    return `(function () {
    const options = ${values};
    const socketKey = "__siYuanPluginLiveReload";
    // livereload server binds to whatever "localhost" resolves to (::1 on IPv6-preferring
    // systems, 127.0.0.1 otherwise); try both loopback forms to survive the mismatch.
    const hosts = ["localhost", "127.0.0.1"];
    let hostIndex = 0;
    // Handshake guard: only act on reload after the server has identified itself as
    // the livereload server of THIS plugin (avoids cross-plugin crosstalk when two
    // plugin projects' dev watches share a port).
    let ownerVerified = false;
    let warnedUnverified = false;
    const previousSocket = globalThis[socketKey];
    previousSocket?.close();

    const showMessage = (text) => {
        try {
            if (typeof require === "function") {
                require("siyuan").showMessage(text);
            }
        } catch (error) {
            console.warn("Unable to show SiYuan live reload message", error);
        }
    };

    const request = async (enabled) => {
        const response = await fetch("/api/petal/setPetalEnabled", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                packageName: options.pluginName,
                enabled,
                frontend: options.frontend
            })
        });
        const result = await response.json();
        if (result.code !== 0) {
            throw new Error(result.msg || "SiYuan rejected the plugin reload request");
        }
    };

    let reloadTimer;
    let reloadInFlight = false;
    let reloadPending = false;

    const runReload = async () => {
        if (reloadInFlight) {
            reloadPending = true;
            return;
        }

        reloadInFlight = true;
        showMessage(options.message);
        try {
            await request(false);
            await new Promise((resolve) => setTimeout(resolve, options.reloadGapMs));
            await request(true);
        } catch (error) {
            console.error("SiYuan plugin live reload failed", error);
            showMessage("Live reload failed: " + (error?.message || error));
        } finally {
            reloadInFlight = false;
            if (reloadPending) {
                reloadPending = false;
                scheduleReload();
            }
        }
    };

    const scheduleReload = () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(runReload, options.debounceMs);
    };

    const connect = () => {
        const socket = new WebSocket("ws://" + hosts[hostIndex] + ":" + options.port + "/livereload");
        globalThis[socketKey] = socket;

        socket.addEventListener("open", () => {
            socket.send(JSON.stringify({
                command: "hello",
                protocols: ["http://livereload.com/protocols/official-7"],
                ver: "4.0.0"
            }));
        });

        socket.addEventListener("message", async (event) => {
            const payload = JSON.parse(event.data);
            if (payload.command === "plugin-identity") {
                if (payload.plugin === options.pluginName) {
                    ownerVerified = true;
                } else {
                    console.warn("[live-reload] livereload server on port " + options.port + " belongs to plugin '" + payload.plugin + "', not '" + options.pluginName + "'. Disconnecting; use a different SIYUAN_LIVERELOAD_PORT per plugin.");
                    socket.close();
                }
                return;
            }
            if (payload.command === "reload") {
                if (!ownerVerified) {
                    if (!warnedUnverified) {
                        warnedUnverified = true;
                        console.warn("[live-reload] Ignoring reload: livereload server on port " + options.port + " did not identify itself as '" + options.pluginName + "'.");
                    }
                    return;
                }
                scheduleReload();
            }
        });

        socket.addEventListener("error", () => {
            hostIndex += 1;
            if (hostIndex < hosts.length) {
                setTimeout(connect, 200);
            } else {
                console.warn("SiYuan plugin live reload could not connect to port " + options.port + " (tried: " + hosts.join(", ") + ")");
            }
        });
    };

    connect();
})();`;
}
