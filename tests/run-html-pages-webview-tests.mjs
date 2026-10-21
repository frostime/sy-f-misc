import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Reuse Vite's compiler, as in the other isolated module test runners.
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
const outdir = resolve('tmp/html-pages-webview-tests');
await mkdir(outdir, { recursive: true });
await build({
    entryPoints: ['tests/html-pages-webview.test.ts'],
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: {
        '@frostime/siyuan-plugin-kits': resolve('tests/fixtures/html-pages-platform.ts'),
        siyuan: resolve('tests/fixtures/html-pages-platform.ts'),
    },
    logLevel: 'warning',
});
const result = spawnSync(process.execPath, ['--test', resolve(outdir, 'html-pages-webview.test.js')], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
