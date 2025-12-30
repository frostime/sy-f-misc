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
import fs from 'fs';
import path from 'path';

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

            external: [
                "siyuan",
                "process",
                /^\/plugins\/sy-f-misc\//  // 排除运行时动态导入的插件资源
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

/**
 * Generic plugin to copy files from source to a target directory
 * @param options Configuration options
 * @param options.globPattern Glob pattern to match source files (e.g., 'src/**\/*.html')
 * @param options.targetDir Target directory name relative to outputDir (e.g., 'pages')
 * @param options.pluginName Name of the plugin
 * @param options.filterFn Optional filter function to exclude certain files
 * @returns Vite plugin
 */
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
            // Find all files matching the glob pattern
            const files = await fg(globPattern, {
                absolute: false,
                onlyFiles: true
            });

            // Apply filter if provided
            const filteredFiles = filterFn ? files.filter(filterFn) : files;

            if (filteredFiles.length === 0) {
                return;
            }

            // Check for duplicate filenames
            const filenameMap = new Map<string, string[]>();

            for (const file of filteredFiles) {
                const filename = path.basename(file);
                if (!filenameMap.has(filename)) {
                    filenameMap.set(filename, []);
                }
                filenameMap.get(filename)!.push(file);
            }

            // Report error if duplicates found
            const duplicates = Array.from(filenameMap.entries())
                .filter(([_, paths]) => paths.length > 1);

            if (duplicates.length > 0) {
                const errorMsg = duplicates
                    .map(([filename, paths]) =>
                        `  - ${filename}:\n${paths.map(p => `    * ${p}`).join('\n')}`
                    )
                    .join('\n');

                throw new Error(
                    `Duplicate ${fileType} filenames found:\n${errorMsg}\n\n` +
                    `Please rename the files to avoid conflicts.`
                );
            }

            console.log(`Found ${filteredFiles.length} ${fileType} file(s) to copy to ${targetDir} directory`);
        },
        async writeBundle() {
            // Find all files again for copying
            const files = await fg(globPattern, {
                absolute: false,
                onlyFiles: true
            });

            // Apply filter if provided
            const filteredFiles = filterFn ? files.filter(filterFn) : files;

            if (filteredFiles.length === 0) {
                return;
            }

            const targetPath = path.join(outputDir, targetDir);

            // Ensure target directory exists
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }

            // Copy each file
            for (const file of filteredFiles) {
                const filename = path.basename(file);
                const destPath = path.join(targetPath, filename);

                fs.copyFileSync(file, destPath);
                console.log(`Copied: ${file} -> ${destPath}`);
            }
        }
    };
}
