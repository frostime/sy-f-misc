import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// The isolated compiler emits CommonJS; mark only the ignored test output directory accordingly.
const outdir = resolve('tmp/gpt-protocol-tests');
await mkdir(outdir, { recursive: true });
await writeFile(resolve(outdir, 'package.json'), '{"type":"commonjs"}\n');
const result = spawnSync(process.execPath, [
    '--test',
    resolve(outdir, 'tests/gpt-protocol-usage.test.js'),
    resolve(outdir, 'tests/gpt-protocol-stream.test.js'),
], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
