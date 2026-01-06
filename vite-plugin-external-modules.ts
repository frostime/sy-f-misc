import type { Plugin } from 'vite';
import { build } from 'vite';
import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';

interface ExternalModuleOptions {
  externalModules: string[];
  pluginBasePath: string;
  isDev: boolean;
}

export function externalModulesPlugin(options: ExternalModuleOptions): Plugin {
  const { externalModules, pluginBasePath, isDev } = options;
  const outputDir = isDev ? 'dev' : 'dist';
  const externalDir = path.resolve(process.cwd(), outputDir, 'external');

  const discoveredModules = new Set<string>();

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

        const allImportRegex = /import\s+(?:[^'"]*\s+from\s+)?["']@external\/([^"']+)["']/g;
        const dynamicImportRegex = /import\s*\(\s*["'](?:@external|dev\/external)\/([^"']+)["']\s*\)/g;

        let match;
        while ((match = allImportRegex.exec(content)) !== null) {
          const moduleName = match[1].replace(/\.(ts|tsx|js|jsx)$/, '');
          if (externalModules.includes(moduleName)) {
            discoveredModules.add(moduleName);
          }
        }

        while ((match = dynamicImportRegex.exec(content)) !== null) {
          const moduleName = match[1].replace(/\.(ts|tsx|js|jsx)$/, '');
          if (externalModules.includes(moduleName)) {
            discoveredModules.add(moduleName);
          }
        }
      }

      if (discoveredModules.size === 0) {
        console.log('   No external modules used');
        return;
      }

      console.log(`   Found: ${Array.from(discoveredModules).join(', ')}`);

      if (!fs.existsSync(externalDir)) {
        fs.mkdirSync(externalDir, { recursive: true });
      }

      console.log('\n📦 Building external modules...');
      for (const moduleName of discoveredModules) {
        await buildExternalModule(moduleName, externalDir, isDev);
      }

      console.log(`✅ External modules built → ${outputDir}/external/`);

      // === 清理不需要的文件/目录 ===
      cleanupExternalDir(externalDir);
    },

    transform(code, id) {
      if (!/\.(ts|tsx|js|jsx)$/.test(id) ||
        id.includes('node_modules') ||
        id.includes('/external/')) {
        return null;
      }

      let transformed = code;
      let hasChanges = false;

      const staticImportRegex = /import\s+(?:(?:[\w\s{},*]+)\s+from\s+)?["']@external\/([^"']+)["'];?\s*/g;

      transformed = transformed.replace(staticImportRegex, (match, modulePath) => {
        const moduleName = modulePath.replace(/\.(ts|tsx|js|jsx)$/, '');
        if (externalModules.includes(moduleName)) {
          hasChanges = true;
          return `/* [AUTO-REMOVED] ${match.trim()} */\n// ⚠️ External modules must use dynamic import: const mod = await import("@external/${moduleName}")\n`;
        }
        return match;
      });

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

async function buildExternalModule(
  moduleName: string,
  outputDir: string,
  isDev: boolean
): Promise<void> {
  const srcPath = path.resolve(process.cwd(), 'src/external', moduleName);

  let entryPath: string | null = null;
  const possibleExtensions = ['.ts', '.tsx', '.js', '.jsx'];

  for (const ext of possibleExtensions) {
    const filePath = `${srcPath}${ext}`;
    if (fs.existsSync(filePath)) {
      entryPath = filePath;
      break;
    }
  }

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
    throw new Error(`Cannot find entry for external module: ${moduleName}`);
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
 * 清理 external 目录中的不需要的文件和目录
 */
function cleanupExternalDir(externalDir: string): void {
  if (!fs.existsSync(externalDir)) {
    return;
  }

  // 需要删除的目录列表
  const dirsToRemove = ['scripts', 'i18n', 'docs', 'pages', 'zotero'];

  let cleaned = false;

  for (const dirName of dirsToRemove) {
    const dirPath = path.join(externalDir, dirName);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`   🧹 Cleaned: ${dirName}/`);
      cleaned = true;
    }
  }

  // 删除所有空目录
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
      console.log(`   🧹 Removed empty dir: ${path.relative(externalDir, dir)}`);
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
