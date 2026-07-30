import assert from 'node:assert/strict';
import test from 'node:test';

import {
    decideSettingsReconciliation,
    type SettingsScopeSnapshot
} from '../src/settings/reconcile-decision.js';

const snapshot = (overrides: Partial<SettingsScopeSnapshot> = {}): SettingsScopeSnapshot => ({
    diskExisted: true,
    lastSeenDisk: { value: 'applied' },
    lastAppliedRuntime: { value: 'applied' },
    ...overrides
});

const decide = (options: {
    snapshot?: SettingsScopeSnapshot;
    nextExists?: boolean;
    nextDisk?: unknown;
    currentRuntime?: unknown;
} = {}) => decideSettingsReconciliation({
    snapshot: options.snapshot ?? snapshot(),
    nextExists: options.nextExists ?? true,
    nextDisk: options.nextDisk ?? { value: 'remote' },
    currentRuntime: options.currentRuntime ?? { value: 'applied' }
});

test('unchanged storage does not reapply settings', () => {
    assert.equal(decide({ nextDisk: { value: 'applied' } }), 'unchanged');
});

test('storage already matching runtime refreshes snapshots without applying', () => {
    assert.equal(decide({
        nextDisk: { nested: { value: 2 } },
        currentRuntime: { nested: { value: 2 } }
    }), 'already-current');
});

test('session runtime precedence keeps a locally divergent scope', () => {
    assert.equal(decide({
        nextDisk: { value: 'remote' },
        currentRuntime: { value: 'local' }
    }), 'keep-local-dirty');
});

test('clean runtime applies changed storage', () => {
    assert.equal(decide(), 'apply-stored-settings');
});

test('storage deletion is deferred only when the scope previously existed', () => {
    assert.equal(decide({ nextExists: false }), 'defer-deletion');
    assert.equal(decide({
        snapshot: snapshot({ diskExisted: false, lastSeenDisk: undefined }),
        nextExists: false
    }), 'unchanged');
});

test('object key order does not create a false settings change', () => {
    assert.equal(decide({
        snapshot: snapshot({ lastSeenDisk: { first: 1, second: 2 } }),
        nextDisk: { second: 2, first: 1 },
        currentRuntime: { first: 1, second: 2 }
    }), 'unchanged');
});
