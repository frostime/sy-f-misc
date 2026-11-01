import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const runNodeTest = (files) =>
    spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });

// 1) 既有 parser 测试：由 package script 先跑 tsc 编译到 tmp/gpt-protocol-tests。
//    The isolated compiler emits CommonJS; mark only the ignored test output directory accordingly.
const compiledDir = resolve('tmp/gpt-protocol-tests');
await mkdir(compiledDir, { recursive: true });
await writeFile(resolve(compiledDir, 'package.json'), '{"type":"commonjs"}\n');
const parserTests = ['gpt-protocol-usage', 'gpt-protocol-stream']
    .map(name => resolve(compiledDir, 'tests', `${name}.test.js`));
const parserResult = runNodeTest(parserTests);
if (parserResult.status !== 0) {
    process.exit(parserResult.status ?? 1);
}

// 2) 请求边界测试：esbuild 打包真实 complete / adapter / parser / native payload / toolchain，
//    只把 siyuan、模型查找、日志与模态查询替换为 tests/fixtures/gpt-protocol-host.ts。
const require = createRequire(import.meta.url);
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
const outdir = resolve('tmp/gpt-protocol-transport-tests');
const hostFixture = resolve('tests/fixtures/gpt-protocol-host.ts');
const entryPoints = ['tests/gpt-protocol-transport.test.ts', 'tests/gpt-protocol-native.test.ts', 'tests/gpt-protocol-replay.test.ts'];
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
        name: 'gpt-protocol-host-boundaries',
        setup(build) {
            build.onResolve({ filter: /^(siyuan|\.\.\/MessageLogger|\.\.\/setting|\.\.\/model\/store)$/ }, () => ({ path: hostFixture }));
        },
    }],
    logLevel: 'warning',
});

const transportResult = runNodeTest(
    entryPoints.map(file => resolve(outdir, `${basename(file, '.ts')}.js`)),
);
process.exitCode = transportResult.status ?? 1;
