import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
const outdir = resolve('tmp/gpt-tools-tests');
const hostFixture = resolve('tests/fixtures/gpt-tool-host.ts');
await mkdir(outdir, { recursive: true });
await build({
    entryPoints: ['tests/gpt-tools.test.ts'],
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    conditions: ['browser'],
    alias: { 'solid-js': require.resolve('solid-js/dist/solid.js') },
    plugins: [{
        name: 'gpt-tool-host-boundaries',
        setup(build) {
            build.onResolve({ filter: /^(\.\.\/openai(?:\/complete)?|@\/func\/gpt\/model\/store|@frostime\/siyuan-plugin-kits)$/ }, () => ({ path: hostFixture }));
        },
    }],
    logLevel: 'warning',
});
const result = spawnSync(process.execPath, ['--test', resolve(outdir, 'gpt-tools.test.js')], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
