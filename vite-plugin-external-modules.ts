import type { Plugin } from 'vite';
import { build } from 'vite';
import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';

/**
 * ============================================
 * External Modules Plugin for Vite
 * ============================================
 *
 * 功能：将指定模块独立打包到 external/ 目录，并在运行时动态加载
 *
 * ## 使用场景
 * - 需要在运行时动态加载的模块（避免打包到主 bundle）
 * - 需要独立更新的模块（无需重新构建主代码）
 * - 需要延迟加载的大型模块（减小主 bundle 体积）
 *
 * ## 配置示例
 * ```typescript
 * // vite.config.ts
 * const EXTERNAL_MODULES = ['sandbox', 'heavy-parser'];
 * const PLUGIN_BASE_PATH = '/plugins/my-plugin';
 *
 * plugins: [
 *   externalModulesPlugin({
 *     externalModules: EXTERNAL_MODULES,
 *     pluginBasePath: PLUGIN_BASE_PATH,
 *     isDev: isDev
 *   })
 * ]
 * ```
 *
 * ## 模块结构支持
 *
 * 1. 单文件模块：
 *    src/external/sandbox.ts  →  dist/external/sandbox.js
 *
 * 2. 目录模块：
 *    src/external/parser/index.ts  →  dist/external/parser.js
 *
 * ## 使用方式
 *
 * ❌ 不支持静态导入（会导致 CJS 顶层 await 错误）：
 * ```typescript
 * import * as Sandbox from "@external/sandbox"  // 会被移除并警告
 * ```
 *
 * ✅ 必须使用动态导入：
 * ```typescript
 * // 在异步函数内
 * const sandbox = await import("@external/sandbox")
 * const { JavaScriptSandBox } = sandbox
 *
 * // 或使用 dev 路径（开发时）
 * const mod = await import("dev/external/sandbox")
 * ```
 *
 * ## 构建流程
 * 1. 扫描源码，找到所有动态导入 @external/xxx 的模块
 * 2. 为每个模块独立构建到 dist/external/xxx.js
 * 3. 转换源码中的导入路径为运行时路径
 * 4. 清理 external/ 目录中的无关文件
 *
 * ## 输出示例
 * ```
 * dist/
 * ├── index.js           # 主代码
 * ├── external/
 * │   ├── sandbox.js     # 独立的 external 模块
 * │   └── parser.js
 * └── ...
 * ```
 * ============================================
 */

interface ExternalModuleOptions {
  /** 需要独立打包的模块名列表（不含扩展名） */
  externalModules: string[];
  /** 运行时的插件基础路径，如 '/plugins/my-plugin' */
  pluginBasePath: string;
  /** 是否为开发模式 */
  isDev: boolean;
}

export function externalModulesPlugin(options: ExternalModuleOptions): Plugin {
  const { externalModules, pluginBasePath, isDev } = options;
  const outputDir = isDev ? 'dev' : 'dist';
  const externalDir = path.resolve(process.cwd(), outputDir, 'external');

  const discoveredModules = new Set<string>();
  const staticImportWarnings = new Set<string>();

  return {
    name: 'vite-plugin-external-modules',
    enforce: 'pre',

    async buildStart() {
      console.log('\n🔍 Scanning for external modules...');

      const srcFiles = await fg(['src/**/*.{ts,tsx,js,jsx}'], {
        absolute: true,
        ignore: ['**/node_modules/**', '**/external/**']
      });

      for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf-8');

        // === 检测静态导入（不应该使用，给出警告） ===
        const staticImportRegex = /import\s+(?:[\w\s{},*]+)\s+from\s+["']@external\/([^"']+)["']/g;
        let staticMatch;
        while ((staticMatch = staticImportRegex.exec(content)) !== null) {
          const moduleName = staticMatch[1].replace(/\.(ts|tsx|js|jsx)$/, '');
          if (externalModules.includes(moduleName)) {
            const relativePath = path.relative(process.cwd(), file);
            staticImportWarnings.add(`${relativePath}: import "@external/${moduleName}"`);
          }
        }

        // === 扫描动态导入（正确的使用方式） ===
        const dynamicImportRegex = /import\s*\(\s*["'](?:@external|dev\/external)\/([^"']+)["']\s*\)/g;
        let dynamicMatch;
        while ((dynamicMatch = dynamicImportRegex.exec(content)) !== null) {
          const moduleName = dynamicMatch[1].replace(/\.(ts|tsx|js|jsx)$/, '');
          if (externalModules.includes(moduleName)) {
            discoveredModules.add(moduleName);
          }
        }
      }

      // === 输出警告 ===
      if (staticImportWarnings.size > 0) {
        console.log('\n⚠️  Static imports detected (will be removed):');
        //@ts-ignore
        for (const warning of staticImportWarnings) {
          console.log(`   ${warning}`);
        }
        console.log('   💡 Use dynamic import instead: const mod = await import("@external/xxx")\n');
      }

      // === 检查是否有模块需要构建 ===
      if (discoveredModules.size === 0) {
        if (staticImportWarnings.size > 0) {
          console.log('   No valid dynamic imports found');
        } else {
          console.log('   No external modules used');
        }
        return;
      }

      console.log(`   Found: ${Array.from(discoveredModules).join(', ')}`);

      // === 创建输出目录 ===
      if (!fs.existsSync(externalDir)) {
        fs.mkdirSync(externalDir, { recursive: true });
      }

      // === 构建每个模块 ===
      console.log('\n📦 Building external modules...');
      //@ts-ignore
      for (const moduleName of discoveredModules) {
        await buildExternalModule(moduleName, externalDir, isDev);
      }

      console.log(`✅ External modules built → ${outputDir}/external/`);

      // === 清理无关文件 ===
      cleanupExternalDir(externalDir);
    },

    transform(code, id) {
      // 跳过不需要处理的文件
      if (!/\.(ts|tsx|js|jsx)$/.test(id) ||
        id.includes('node_modules') ||
        id.includes('/external/')) {
        return null;
      }

      let transformed = code;
      let hasChanges = false;

      // === 移除静态导入 ===
      const staticImportRegex = /import\s+(?:(?:[\w\s{},*]+)\s+from\s+)?["']@external\/([^"']+)["'];?\s*/g;

      transformed = transformed.replace(staticImportRegex, (match, modulePath) => {
        const moduleName = modulePath.replace(/\.(ts|tsx|js|jsx)$/, '');
        if (externalModules.includes(moduleName)) {
          hasChanges = true;
          return `/* [AUTO-REMOVED] ${match.trim()} */\n// ⚠️ Use dynamic import: const mod = await import("@external/${moduleName}")\n`;
        }
        return match;
      });

      // === 转换动态导入路径 ===
      const dynamicImportRegex = /import\s*\(\s*["'](?:@external|dev\/external)\/([^"']+)["']\s*\)/g;

      transformed = transformed.replace(dynamicImportRegex, (match, modulePath) => {
        const moduleName = modulePath.replace(/\.(ts|tsx|js|jsx)$/, '');
        if (externalModules.includes(moduleName)) {
          hasChanges = true;
          return `import('${pluginBasePath}/external/${moduleName}.js')`;
        }
        return match;
      });

      return hasChanges ? { code: transformed, map: null } : null;
    }
  };
}

/**
 * 为单个 external 模块构建独立的 bundle
 */
async function buildExternalModule(
  moduleName: string,
  outputDir: string,
  isDev: boolean
): Promise<void> {
  const srcPath = path.resolve(process.cwd(), 'src/external', moduleName);

  let entryPath: string | null = null;
  const possibleExtensions = ['.ts', '.tsx', '.js', '.jsx'];

  // 1. 尝试作为单文件：src/external/sandbox.ts
  for (const ext of possibleExtensions) {
    const filePath = `${srcPath}${ext}`;
    if (fs.existsSync(filePath)) {
      entryPath = filePath;
      break;
    }
  }

  // 2. 尝试作为目录模块：src/external/parser/index.ts
  if (!entryPath && fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
    for (const ext of possibleExtensions) {
      const indexPath = path.join(srcPath, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        entryPath = indexPath;
        break;
      }
    }
  }

  if (!entryPath) {
    throw new Error(
      `Cannot find entry for external module: ${moduleName}\n` +
      `Expected: src/external/${moduleName}.ts or src/external/${moduleName}/index.ts`
    );
  }

  console.log(`   Building ${moduleName}...`);

  await build({
    configFile: false,
    logLevel: 'warn',
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "src"),
        "@gpt": path.resolve(process.cwd(), "src/func/gpt"),
      }
    },
    build: {
      outDir: outputDir,
      emptyOutDir: false,
      minify: !isDev,
      sourcemap: false,
      lib: {
        entry: entryPath,
        fileName: moduleName,
        formats: ['es'],
      },
      rollupOptions: {
        external: ['siyuan', 'process'],
        output: {
          entryFileNames: `${moduleName}.js`,
        },
      },
    },
  });
}

/**
 * 清理 external 目录中的无关文件和目录
 *
 * 删除规则：
 * - 删除特定目录：scripts, i18n, docs, pages, zotero
 * - 删除所有空目录
 * - 保留所有 .js 文件（构建的 external 模块）
 */
function cleanupExternalDir(externalDir: string): void {
  if (!fs.existsSync(externalDir)) {
    return;
  }

  const dirsToRemove = ['scripts', 'i18n', 'docs', 'pages', 'zotero'];
  let cleaned = false;

  // 删除指定目录
  for (const dirName of dirsToRemove) {
    const dirPath = path.join(externalDir, dirName);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`   🧹 Cleaned: ${dirName}/`);
      cleaned = true;
    }
  }

  // 递归删除空目录
  const removeEmptyDirs = (dir: string) => {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // 递归处理子目录
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        removeEmptyDirs(fullPath);
      }
    }

    // 检查当前目录是否为空
    const remainingEntries = fs.readdirSync(dir);
    if (remainingEntries.length === 0 && dir !== externalDir) {
      fs.rmdirSync(dir);
      const relPath = path.relative(externalDir, dir);
      console.log(`   🧹 Removed empty dir: ${relPath}`);
      cleaned = true;
    }
  };

  removeEmptyDirs(externalDir);

  if (cleaned) {
    console.log('✨ External directory cleaned\n');
  } else {
    console.log();
  }
}
