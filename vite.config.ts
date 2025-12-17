import { resolve } from "path"
import { defineConfig, loadEnv } from "vite"
import minimist from "minimist"
import { viteStaticCopy } from "vite-plugin-static-copy"
import livereload from "rollup-plugin-livereload"
import solidPlugin from 'vite-plugin-solid';
import zipPack from "vite-plugin-zip-pack";
import fg from 'fast-glob';
import sass from 'sass'; // Use import instead of require
import { visualizer } from 'rollup-plugin-visualizer';

import vitePluginConditionalCompile from "vite-plugin-conditional-compile";


const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === 'inline';
const isDev = env.NODE_ENV === 'development';
const minify = env.NO_MINIFY ? false : true;

const outputDir = isDev ? "dev" : "dist";

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
            "@gpt": resolve(__dirname, "src/func/gpt")
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

        vitePluginConditionalCompile({
            env: {
                IS_DEV: isDev,
                // 仅仅给我测试使用或者我暂时不想要的一些功能，和正式发布版区分开
                // PRIVATE_ADD: env.PRIVATE !== undefined || isDev,  // 私人打包的时候才加进去，公开发布打包不加入的功能
                // PRIVATE_REMOVE: env.PRIVATE === undefined && !isDev,  // 私人打包的时候删掉的功能，但公开发布打包的时候不删除
                PRIVATE_ADD: env.PRIVATE_ADD !== undefined,
                PRIVATE_REMOVE: env.PRIVATE_REMOVE !== undefined
            }
        }),

        solidPlugin(),

        viteStaticCopy({
            targets: [
                {
                    src: "./README*.md",
                    dest: "./",
                },
                {
                    src: "./plugin.json",
                    dest: "./",
                },
                {
                    src: "./preview.png",
                    dest: "./",
                },
                {
                    src: "./icon.png",
                    dest: "./",
                },
                {
                    src: "src/func/zotero/js/**/*", // 指定需要复制的资源文件目录
                    dest: "zotero", // 目标目录
                }
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
                        livereload(outputDir),
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

            external: ["siyuan", "process"],

            output: {
                entryFileNames: "[name].js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name === "style.css") {
                        return "index.css"
                    }
                    return assetInfo.name
                },
            },
        },
    }
})
