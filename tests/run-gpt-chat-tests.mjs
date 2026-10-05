import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Reuse Vite's compiler without adding a dependency. Browser Solid is required for reactive hook tests.
const require = createRequire(import.meta.url);
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
const outdir = resolve('tmp/gpt-chat-tests');
const entryPoints = ['tests/gpt-chat.test.ts', 'tests/gpt-residue.test.ts', 'tests/gpt-residue-commit.test.ts'];
await mkdir(outdir, { recursive: true });
await build({
    entryPoints,
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    conditions: ['browser'],
    alias: { 'solid-js': require.resolve('solid-js/dist/solid.js') },
    logLevel: 'warning',
});
const testFiles = entryPoints.map(path => resolve(outdir, path.split('/').pop().replace(/\.ts$/, '.js')));
const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
