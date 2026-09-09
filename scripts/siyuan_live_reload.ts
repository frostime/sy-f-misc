/*
 * Adapted from https://github.com/siyuan-note/plugin-sample-vite-svelte
 * (scripts/siyuan_live_reload.js, MIT License)
 */

export interface SiYuanLiveReloadClientOptions {
    /** Port of the livereload WebSocket server (paired with liveReloadServer() in vite.config.ts) */
    port: number;
    pluginName: string;
    frontend: string;
    message: string;
    debounceMs: number;
    reloadGapMs: number;
}

/**
 * Generates the development-only client embedded in the app bundle.
 * The client translates standard LiveReload messages into SiYuan's
 * single-plugin reload API, which works inside the current workspace.
 */
export function createSiYuanLiveReloadScript({ port, pluginName, frontend, message, debounceMs, reloadGapMs }: SiYuanLiveReloadClientOptions): string {
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
