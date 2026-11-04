import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

// Provider 复制/粘贴载荷与命名：纯逻辑，无 DOM 依赖。
const outdir = resolve('tmp/gpt-provider-transfer-tests');
const entryPoints = ['tests/gpt-provider-transfer.test.ts'];
await mkdir(outdir, { recursive: true });
await build({
    entryPoints,
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    conditions: ['browser'],
    logLevel: 'warning',
});
const testFiles = entryPoints.map(path => resolve(outdir, path.split('/').pop().replace(/\.ts$/, '.js')));
const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
