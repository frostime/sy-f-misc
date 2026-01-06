import { resolve } from "path"
import { defineConfig, loadEnv } from "vite"
import minimist from "minimist"
import { viteStaticCopy } from "vite-plugin-static-copy"
import livereload from "rollup-plugin-livereload"
import solidPlugin from 'vite-plugin-solid';
import zipPack from "vite-plugin-zip-pack";
import fg from 'fast-glob';
import sass from 'sass';
import { visualizer } from 'rollup-plugin-visualizer';
import fs from 'fs';
import path from 'path';
import vitePluginConditionalCompile from "vite-plugin-conditional-compile";

const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === 'inline';
const isDev = env.NODE_ENV === 'development';
const minify = env.NO_MINIFY ? false : true;
const PLUGIN_NAME = "sy-f-misc";
const EXTERNAL_ROOT = resolve(__dirname, "src/external");
const outputDir = isDev ? "dev" : "dist";

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);

export default defineConfig(async ({ mode, command }) => {
    const externalEntries = getExternalEntries();
    console.log(`Found ${externalEntries.length} external modules:`, externalEntries.map(e => e.name));

    // 如果有外部模块，先构建它们
    if (command === 'build' && externalEntries.length > 0) {
        await buildExternalModules(externalEntries);
    }

    return {
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
                "@gpt": resolve(__dirname, "src/func/gpt"),
                "@external": EXTERNAL_ROOT
            }
        },
        css: {
            preprocessorOptions: {
                scss: {
                    silenceDeprecations: ['legacy-js-api']
                }
            }
        },
        define: {
            "process.env.DEV_MODE": JSON.stringify(isDev),
            "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV)
        },
        plugins: [
            vitePluginConditionalCompile({
                env: {
                    IS_DEV: isDev,
                    PRIVATE_ADD: env.PRIVATE_ADD !== undefined,
                    PRIVATE_REMOVE: env.PRIVATE_REMOVE !== undefined
                }
            }),
            solidPlugin(),
            externalRewritePlugin(),
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
                        src: "src/func/zotero/js/**/*",
                        dest: "zotero",
                    }
                ],
            }),
            process.env.ANALYZE_BUNDLE === 'true' &&
            visualizer({
                open: true,
                filename: './tmp/stats.html',
            }),
        ].filter(Boolean),
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
                    /^\/plugins\/sy-f-misc\//
                ],
                output: {
                    format: "cjs",
                    entryFileNames: "index.js",
                    chunkFileNames: "[name]-[hash].js",
                    assetFileNames: (assetInfo) => {
                        if (assetInfo.name === "style.css") {
                            return "index.css"
                        }
                        return assetInfo.name
                    },
                    manualChunks: undefined
                },
            },
        }
    };
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
            const files = await fg(globPattern, {
                absolute: false,
                onlyFiles: true
            });
            const filteredFiles = filterFn ? files.filter(filterFn) : files;
            if (filteredFiles.length === 0) {
                return;
            }
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
                    `Duplicate ${fileType} filenames found:\n${errorMsg}\n\n` +
                    `Please rename the files to avoid conflicts.`
                );
            }
            console.log(`Found ${filteredFiles.length} ${fileType} file(s) to copy to ${targetDir} directory`);
        },
        async writeBundle() {
            const files = await fg(globPattern, {
                absolute: false,
                onlyFiles: true
            });
            const filteredFiles = filterFn ? files.filter(filterFn) : files;
            if (filteredFiles.length === 0) {
                return;
            }
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

function getExternalEntries() {
    const files = fg.sync('src/external/**/*.{ts,tsx,js}', {
        absolute: true,
        onlyFiles: true,
        // 排除示例/文档文件
        ignore: [
            '**/EXAMPLE_*.{ts,tsx,js}',
            '**/README.md'
        ]
    });
    return files.map(file => {
        const relative = path.relative(EXTERNAL_ROOT, file);
        const normalized = relative.replace(/\.[^.]+$/, '').split(path.sep).join('/');
        return { name: normalized, file };
    });
}

function externalRewritePlugin() {
    return {
        name: 'external-rewrite',
        resolveId(source, importer) {
            // 只在非外部模块文件中重写 @external 导入
            if (source.startsWith('@external/')) {
                // 如果导入者是外部模块本身，不处理（让 Vite 正常编译）
                if (importer && importer.includes('src/external/')) {
                    return null;
                }
                // 在主代码中，将 @external 导入重写为运行时路径
                const normalized = source.replace(/^@external\//, '').replace(/\.[jt]sx?$/, '');
                return {
                    id: `/plugins/${PLUGIN_NAME}/external/${normalized}.js`,
                    external: true
                };
            }
            return null;
        }
    };
}

async function buildExternalModules(entries: { name: string; file: string }[]) {
    const { build } = await import('vite');

    console.log('\n🔨 Building external modules...\n');

    for (const { name, file } of entries) {
        console.log(`  Building: ${name}...`);

        const outFile = path.join(outputDir, 'external', `${name}.js`);
        const outDir = path.dirname(outFile);

        // 确保输出目录存在
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        try {
            await build({
                configFile: false,
                resolve: {
                    alias: {
                        "@": resolve(__dirname, "src"),
                        "@gpt": resolve(__dirname, "src/func/gpt"),
                        "@external": EXTERNAL_ROOT
                    }
                },
                build: {
                    // 使用临时目录构建，然后移动文件
                    outDir: path.join(outputDir, '.temp-external', name),
                    emptyOutDir: true,
                    minify: minify ?? true,
                    sourcemap: isSrcmap ? 'inline' : false,
                    lib: {
                        entry: file,
                        fileName: () => path.basename(name) + '.js',
                        formats: ["cjs"]
                    },
                    rollupOptions: {
                        external: [
                            "siyuan",
                            "process",
                            /^\/plugins\/sy-f-misc\//
                        ],
                        output: {
                            // 禁用代码分割，避免生成多余的 chunk
                            inlineDynamicImports: true
                        }
                    }
                }
            });

            // 移动编译好的文件到正确位置
            const tempFile = path.join(outputDir, '.temp-external', name, path.basename(name) + '.js');
            if (fs.existsSync(tempFile)) {
                fs.copyFileSync(tempFile, outFile);
            }

            console.log(`  ✓ ${name} built successfully`);
        } catch (error) {
            console.error(`  ✗ Failed to build ${name}:`, error);
        }
    }

    // 清理临时目录
    const tempDir = path.join(outputDir, '.temp-external');
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log('\n✅ External modules built\n');
}
