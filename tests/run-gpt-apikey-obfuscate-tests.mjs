import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

// Compile the obfuscation module test. No DOM needed; pure crypto-free logic.
const outdir = resolve('tmp/gpt-apikey-obfuscate-tests');
const entryPoints = ['tests/gpt-apikey-obfuscate.test.ts'];
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
