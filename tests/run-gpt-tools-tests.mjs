import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
const outdir = resolve('tmp/gpt-tools-tests');
const hostFixture = resolve('tests/fixtures/gpt-tool-host.ts');
const startupFixture = resolve('tests/fixtures/gpt-startup-host.ts');
const gptEntry = resolve('src/func/gpt/index.ts');
const entryPoints = ['tests/gpt-tools.test.ts', 'tests/gpt-native-mcp-client.test.ts', 'tests/gpt-native-mcp.test.ts', 'tests/gpt-tool-permissions.test.ts', 'tests/gpt-startup.test.ts'];
await mkdir(outdir, { recursive: true });
await build({
    entryPoints,
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    conditions: ['browser'],
    alias: { 'solid-js': require.resolve('solid-js/dist/solid.js') },
    plugins: [{
        name: 'gpt-tool-host-boundaries',
        setup(build) {
            // Keep the real GPT startup owner and native MCP; replace only its UI/platform/persistence boundaries.
            build.onResolve({ filter: /.*/ }, args => {
                if (args.importer === gptEntry && !['./tools/native-mcp', '@frostime/solid-signal-ref'].includes(args.path)) {
                    return { path: startupFixture };
                }
            });
            build.onResolve({ filter: /^(\.\.\/openai(?:\/complete)?|@\/func\/gpt\/model\/store|@frostime\/siyuan-plugin-kits)$/ }, () => ({ path: hostFixture }));
        },
    }],
    logLevel: 'warning',
});
const result = spawnSync(process.execPath, ['--test', ...entryPoints.map(file => resolve(outdir, `${basename(file, '.ts')}.js`))], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
