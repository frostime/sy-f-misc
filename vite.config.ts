import { resolve } from "path"
import { defineConfig } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import livereload from "rollup-plugin-livereload"
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
                { src: "src/func/zotero/js/**/*", dest: "zotero" }
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

            external: [
                "siyuan",
                "process",
                /^\/plugins\/sy-f-misc\//,
                /^@external\//,
            ],

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
});

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
