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
        copyHtmlFilesPlugin(),
        copyMdFilesPlugin(),
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
});

// Custom plugin to copy HTML files from src to pages directory
function copyHtmlFilesPlugin() {
    return {
        name: 'copy-html-files',
        async buildStart() {
            // Find all HTML files in src directory
            const htmlFiles = await fg('src/**/*.html', {
                absolute: false,
                onlyFiles: true
            });

            if (htmlFiles.length === 0) {
                return;
            }

            // Check for duplicate filenames
            const filenameMap = new Map<string, string[]>();

            for (const file of htmlFiles) {
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
                    `Duplicate HTML filenames found in src directory:\n${errorMsg}\n\n` +
                    `Please rename the files to avoid conflicts.`
                );
            }

            console.log(`Found ${htmlFiles.length} HTML file(s) to copy to pages directory`);
        },
        async writeBundle() {
            // Find all HTML files again for copying
            const htmlFiles = await fg('src/**/*.html', {
                absolute: false,
                onlyFiles: true
            });

            if (htmlFiles.length === 0) {
                return;
            }

            const targetDir = path.join(outputDir, 'pages');

            // Ensure target directory exists
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Copy each HTML file
            for (const file of htmlFiles) {
                const filename = path.basename(file);
                const targetPath = path.join(targetDir, filename);

                fs.copyFileSync(file, targetPath);
                console.log(`Copied: ${file} -> ${targetPath}`);
            }
        }
    };
}

// Custom plugin to copy MD files from src to docs directory (excluding README.md)
function copyMdFilesPlugin() {
    return {
        name: 'copy-md-files',
        async buildStart() {
            // Find all MD files in src directory (excluding README.md)
            const mdFiles = await fg('src/**/*.md', {
                absolute: false,
                onlyFiles: true
            });

            const filteredMdFiles = mdFiles.filter(file => {
                const filename = path.basename(file);
                return filename !== 'README.md';
            });

            if (filteredMdFiles.length === 0) {
                return;
            }

            // Check for duplicate filenames
            const filenameMap = new Map<string, string[]>();

            for (const file of filteredMdFiles) {
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
                    `Duplicate MD filenames found in src directory:\n${errorMsg}\n\n` +
                    `Please rename the files to avoid conflicts.`
                );
            }

            console.log(`Found ${filteredMdFiles.length} MD file(s) to copy to docs directory`);
        },
        async writeBundle() {
            // Find all MD files again for copying
            const mdFiles = await fg('src/**/*.md', {
                absolute: false,
                onlyFiles: true
            });

            const filteredMdFiles = mdFiles.filter(file => {
                const filename = path.basename(file);
                return filename !== 'README.md';
            });

            if (filteredMdFiles.length === 0) {
                return;
            }

            const targetDir = path.join(outputDir, 'docs');

            // Ensure target directory exists
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Copy each MD file
            for (const file of filteredMdFiles) {
                const filename = path.basename(file);
                const targetPath = path.join(targetDir, filename);

                fs.copyFileSync(file, targetPath);
                console.log(`Copied: ${file} -> ${targetPath}`);
            }
        }
    };
}
