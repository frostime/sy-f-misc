import { resolve } from "path"
import { defineConfig } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import { createServer as createLiveReloadServer } from "livereload";
import { createSiYuanLiveReloadScript } from './scripts/siyuan_live_reload';
import solidPlugin from 'vite-plugin-solid';
import zipPack from "vite-plugin-zip-pack";
import fg from 'fast-glob';
import { visualizer } from 'rollup-plugin-visualizer';
import fs from 'fs';
import path from 'path';
import vitePluginConditionalCompile from "vite-plugin-conditional-compile";
import { externalModulesPlugin } from './vite-plugin-external-modules';  // 导入插件

const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === 'inline';
const isDev = env.NODE_ENV === 'development';
const minify = env.NO_MINIFY ? false : true;
const outputDir = isDev ? "dev" : "dist";

// ============ 配置区域 ============
const EXTERNAL_MODULES = ["sandbox", "text-edit-engine"];  // 在此配置需要独立打包的模块
const PLUGIN_BASE_PATH = '/plugins/sy-f-misc';
// =================================

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);

const pluginManifest = JSON.parse(fs.readFileSync(resolve(__dirname, "plugin.json"), "utf8"));
// Livereload 端口会烘焙进插件 bundle，因此必须确定性。优先级：
// SIYUAN_LIVERELOAD_PORT > LIVERELOAD_PORT_DEFAULT（本项目显式固定）> 按插件名自动派生
// （派生端口用于多插件项目并行开发时天然错开，避免冲突/串扰）
const LIVERELOAD_PORT_DEFAULT: string | undefined = "31415";
const LIVERELOAD_PORT_BASE = 35740;
const LIVERELOAD_PORT_RANGE = 1000;

function derivedLiveReloadPort(pluginName: string): number {
    let hash = 2166136261; // FNV-1a 32-bit
    for (let i = 0; i < pluginName.length; i++) {
        hash ^= pluginName.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return LIVERELOAD_PORT_BASE + (hash % LIVERELOAD_PORT_RANGE);
}

const liveReloadPort = Number.parseInt(
    env.SIYUAN_LIVERELOAD_PORT || LIVERELOAD_PORT_DEFAULT || String(derivedLiveReloadPort(pluginManifest.name)),
    10
);
const liveReloadFrontend = env.SIYUAN_LIVERELOAD_FRONTEND || "desktop";
const liveReloadMessage = env.SIYUAN_LIVERELOAD_MESSAGE || `Live reload: ${pluginManifest.name}`;
const liveReloadDebounceMs = Number.parseInt(env.SIYUAN_LIVERELOAD_DEBOUNCE_MS || "300", 10);
const pluginReloadGapMs = Number.parseInt(env.SIYUAN_PLUGIN_RELOAD_GAP_MS || "500", 10);

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
            "@gpt": resolve(__dirname, "src/func/gpt"),
            "@external": resolve(__dirname, "src/external")
        }
    },

    css: {
        preprocessorOptions: {
            scss: {
                silenceDeprecations: ['legacy-js-api']
            }
        }
    },

    plugins: [
        // ===== 第一个插件：处理 external 模块 =====
        EXTERNAL_MODULES.length > 0 && externalModulesPlugin({
            externalModules: EXTERNAL_MODULES,
            pluginBasePath: PLUGIN_BASE_PATH,
            isDev: isDev
        }),

        vitePluginConditionalCompile({
            env: {
                IS_DEV: isDev,
                PRIVATE_ADD: env.PRIVATE_ADD !== undefined,
                PRIVATE_REMOVE: env.PRIVATE_REMOVE !== undefined
            }
        }),

        solidPlugin(),
        createCopyFilesPlugin({
            globPattern: 'src/**/*.html',
            targetDir: 'pages',
            pluginName: 'copy-html-files'
        }),
        createCopyFilesPlugin({
            globPattern: 'src/**/*.md',
            targetDir: 'docs',
            pluginName: 'copy-md-files',
            filterFn: (file) => path.basename(file) !== 'README.md'
        }),
        viteStaticCopy({
            targets: [
                { src: "./README*.md", dest: "./" },
                { src: "./plugin.json", dest: "./" },
                { src: "./preview.png", dest: "./" },
                { src: "./icon.png", dest: "./" },
                { src: "src/external/zotero-bridge/*.xpi", dest: "external/zotero-bridge" }
            ],
        }),
        process.env.ANALYZE_BUNDLE === 'true' &&
        visualizer({
            open: true,
            filename: './tmp/stats.html',
        }),
    ].filter(Boolean),

    define: {
        "process.env.DEV_MODE": JSON.stringify(isDev),
        "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV)
    },

    build: {
        outDir: outputDir,
        emptyOutDir: false,
        minify: minify ?? true,
        sourcemap: isSrcmap ? 'inline' : false,

        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            fileName: "index",
            formats: ["cjs"],
        },
        rollupOptions: {
            plugins: [
                ...(
                    isDev ? [
                        liveReloadServer(),
                        siYuanPluginReload(),
                        {
                            name: 'watch-external',
                            async buildStart() {
                                const files = await fg([
                                    'public/i18n/**',
                                    './README*.md',
                                    './plugin.json'
                                ]);
                                for (let file of files) {
                                    this.addWatchFile(file);
                                }
                            }
                        }
                    ] : [
                        zipPack({
                            inDir: './dist',
                            outDir: './',
                            outFileName: 'package.zip'
                        })
                    ]
                )
            ],

            external: [
                "siyuan",
                "process",
                /^\/plugins\/sy-f-misc\//,
                /^@external\//,
            ],

            output: {
                entryFileNames: "[name].js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.names[0] === "style.css") {
                        return "index.css"
                    }
                    return assetInfo.names[0]
                },
            },
        },
    }
});

/**
 * Live reload server for dev mode: watch dist/ and notify clients via WebSocket.
 * Paired with siYuanPluginReload(), which embeds a client into the bundle.
 */
function liveReloadServer() {
    let server: ReturnType<typeof createLiveReloadServer> | undefined;

    return {
        name: "siyuan-live-reload-server",
        buildStart() {
            if (server) {
                return;
            }
            server = createLiveReloadServer({
                port: liveReloadPort,
                delay: liveReloadDebounceMs
            });
            server.on("error", (error: NodeJS.ErrnoException) => {
                if (error.code === "EADDRINUSE") {
                    console.error(
                        `[live-reload] 端口 ${liveReloadPort} 已被占用（可能是另一个插件项目的 dev watch）。\n` +
                        `  - 查看占用: netstat -ano | findstr ${liveReloadPort}\n` +
                        `  - 换端口: 设置环境变量 SIYUAN_LIVERELOAD_PORT=<port> 后重新构建`
                    );
                } else {
                    console.error(`[live-reload] unable to listen on port ${liveReloadPort}:`, error);
                }
                throw error;
            });
            // 握手身份广播：每个新连接立即告知本 server 归属的插件，
            // 客户端校验 owner，防止误连到别的插件项目的 server
            server.server.on("connection", (socket) => {
                socket.send(JSON.stringify({ command: "plugin-identity", plugin: pluginManifest.name }));
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
        }
    };
}

/**
 * Embed a dev-only client into the bundle: on livereload message, reload the
 * plugin in SiYuan by toggling it off/on via /api/petal/setPetalEnabled.
 */
function siYuanPluginReload() {
    return {
        name: "siyuan-plugin-reload",
        banner: () => createSiYuanLiveReloadScript({
            port: liveReloadPort,
            pluginName: pluginManifest.name,
            frontend: liveReloadFrontend,
            message: liveReloadMessage,
            debounceMs: liveReloadDebounceMs,
            reloadGapMs: pluginReloadGapMs
        })
    };
}

function createCopyFilesPlugin(options: {
    globPattern: string;
    targetDir: string;
    pluginName: string;
    filterFn?: (file: string) => boolean;
}) {
    const { globPattern, targetDir, pluginName, filterFn } = options;
    const fileType = path.extname(globPattern.split('*').pop() || '').toUpperCase().slice(1);

    return {
        name: pluginName,
        async buildStart() {
            const files = await fg(globPattern, { absolute: false, onlyFiles: true });
            const filteredFiles = filterFn ? files.filter(filterFn) : files;
            if (filteredFiles.length === 0) return;

            const filenameMap = new Map<string, string[]>();
            for (const file of filteredFiles) {
                const filename = path.basename(file);
                if (!filenameMap.has(filename)) {
                    filenameMap.set(filename, []);
                }
                filenameMap.get(filename)!.push(file);
            }

            const duplicates = Array.from(filenameMap.entries())
                .filter(([_, paths]) => paths.length > 1);

            if (duplicates.length > 0) {
                const errorMsg = duplicates
                    .map(([filename, paths]) =>
                        `  - ${filename}:\n${paths.map(p => `    * ${p}`).join('\n')}`
                    )
                    .join('\n');
                throw new Error(
                    `Duplicate ${fileType} filenames found:\n${errorMsg}\n\nPlease rename the files.`
                );
            }

            console.log(`Found ${filteredFiles.length} ${fileType} file(s) to copy to ${targetDir}`);
        },
        async writeBundle() {
            const files = await fg(globPattern, { absolute: false, onlyFiles: true });
            const filteredFiles = filterFn ? files.filter(filterFn) : files;
            if (filteredFiles.length === 0) return;

            const targetPath = path.join(outputDir, targetDir);
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }

            for (const file of filteredFiles) {
                const filename = path.basename(file);
                const destPath = path.join(targetPath, filename);
                fs.copyFileSync(file, destPath);
                console.log(`Copied: ${file} -> ${destPath}`);
            }
        }
    };
}
