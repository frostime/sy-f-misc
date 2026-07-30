import assert from 'node:assert/strict';
import test from 'node:test';

import { settleModuleTransitions } from '../src/func/lifecycle.js';

const moduleStub = (name: string, action: () => void | Promise<void>) => ({
    name,
    enabled: false,
    load: action,
    unload: action
});

test('one failed module does not prevent unrelated module transitions from settling', async () => {
    const settled: string[] = [];
    const errors: string[] = [];
    const failure = new Error('expected failure');
    const modules = [
        moduleStub('A', async () => {
            await Promise.resolve();
            settled.push('A');
        }),
        moduleStub('B', () => {
            throw failure;
        }),
        moduleStub('C', () => {
            settled.push('C');
        })
    ];

    await settleModuleTransitions(
        'load',
        modules,
        {},
        (message, error) => {
            errors.push(`${message} ${error === failure}`);
        }
    );

    assert.deepEqual(settled.sort(), ['A', 'C']);
    assert.deepEqual(errors, [
        '[fmisc] Failed to load module B. Reload the SiYuan UI if fmisc state appears inconsistent: true'
    ]);
});
