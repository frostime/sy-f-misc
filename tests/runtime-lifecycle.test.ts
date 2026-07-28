import assert from 'node:assert/strict';
import test from 'node:test';

import { FMiscRuntimeLifecycle } from '../src/runtime-lifecycle.js';

const settleCurrentTurn = () => new Promise<void>(resolve => setImmediate(resolve));

const deferred = <T = void>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

const createFixture = () => {
    const settingsReady = deferred<{
        scheduleReconcileAfterStorageSync(): void;
        dispose(): void | Promise<void>;
    }>();
    const featuresReady = deferred();
    const events: string[] = [];
    let featureStartupSignal: AbortSignal | undefined;
    const persistence: {
        scheduleReconcileAfterStorageSync(): void;
        dispose(): void | Promise<void>;
    } = {
        scheduleReconcileAfterStorageSync: () => {
            events.push('reconcile');
        },
        dispose: () => {
            events.push('dispose-settings');
        }
    };
    const lifecycle = new FMiscRuntimeLifecycle({
        teardownBarrierKey: Symbol('fixture-runtime'),
        initializeSettings: () => settingsReady.promise,
        loadFeatures: async signal => {
            featureStartupSignal = signal;
            events.push('load-features');
            await featuresReady.promise;
            events.push('features-loaded');
        },
        unloadFeatures: async () => {
            events.push('unload-features');
        },
        logError: message => events.push(message)
    });
    return {
        lifecycle,
        settingsReady,
        featuresReady,
        persistence,
        events,
        getFeatureStartupSignal: () => featureStartupSignal
    };
};

test('storage notifications before active are coalesced until feature startup settles', async () => {
    const fixture = createFixture();
    const loading = fixture.lifecycle.load();

    fixture.lifecycle.notifyStorageDataChanged();
    fixture.lifecycle.notifyStorageDataChanged();
    fixture.settingsReady.resolve(fixture.persistence);
    await settleCurrentTurn();

    assert.deepEqual(fixture.events, ['load-features']);
    assert.equal(fixture.lifecycle.getState(), 'loading-features');

    fixture.featuresReady.resolve();
    await loading;

    assert.equal(fixture.lifecycle.getState(), 'active');
    assert.deepEqual(fixture.events, ['load-features', 'features-loaded', 'reconcile']);
});

test('storage notifications while active reconcile immediately', async () => {
    const fixture = createFixture();
    const loading = fixture.lifecycle.load();
    fixture.settingsReady.resolve(fixture.persistence);
    await settleCurrentTurn();
    fixture.featuresReady.resolve();
    await loading;

    fixture.lifecycle.notifyStorageDataChanged();
    fixture.lifecycle.notifyStorageDataChanged();

    assert.deepEqual(fixture.events.slice(-2), ['reconcile', 'reconcile']);
});

test('teardown during feature startup disposes settings and waits before unloading features', async () => {
    const fixture = createFixture();
    const loading = fixture.lifecycle.load();
    fixture.settingsReady.resolve(fixture.persistence);
    await settleCurrentTurn();

    const unloading = fixture.lifecycle.unload();
    fixture.lifecycle.notifyStorageDataChanged();

    assert.equal(fixture.lifecycle.getState(), 'disposed');
    assert.equal(fixture.getFeatureStartupSignal()?.aborted, true);
    assert.deepEqual(fixture.events, ['load-features', 'dispose-settings']);

    fixture.featuresReady.resolve();
    await Promise.all([loading, unloading]);

    assert.deepEqual(fixture.events, [
        'load-features',
        'dispose-settings',
        'features-loaded',
        'unload-features'
    ]);
});

test('active teardown waits for settings reconciliation to drain before unloading features', async () => {
    const fixture = createFixture();
    const settingsDisposed = deferred();
    fixture.persistence.dispose = () => {
        fixture.events.push('dispose-settings');
        return settingsDisposed.promise;
    };

    const loading = fixture.lifecycle.load();
    fixture.settingsReady.resolve(fixture.persistence);
    await settleCurrentTurn();
    fixture.featuresReady.resolve();
    await loading;

    const unloading = fixture.lifecycle.unload();
    await Promise.resolve();
    assert.equal(fixture.events.includes('unload-features'), false);

    settingsDisposed.resolve();
    await unloading;
    assert.deepEqual(fixture.events.slice(-2), ['dispose-settings', 'unload-features']);
});

test('a replacement runtime waits for the previous generation teardown', async () => {
    const barrierKey = Symbol('runtime-generation-test');
    const oldTeardown = deferred();
    const events: string[] = [];
    const oldRuntime = new FMiscRuntimeLifecycle({
        teardownBarrierKey: barrierKey,
        initializeSettings: async () => ({
            scheduleReconcileAfterStorageSync: () => undefined,
            dispose: () => oldTeardown.promise
        }),
        loadFeatures: async () => undefined,
        unloadFeatures: async () => {
            events.push('old-unloaded');
        }
    });
    await oldRuntime.load();
    const unloadingOldRuntime = oldRuntime.unload();

    const newRuntime = new FMiscRuntimeLifecycle({
        teardownBarrierKey: barrierKey,
        initializeSettings: async () => {
            events.push('new-settings');
            return {
                scheduleReconcileAfterStorageSync: () => undefined,
                dispose: () => undefined
            };
        },
        loadFeatures: async () => {
            events.push('new-features');
        },
        unloadFeatures: async () => undefined
    });
    const loadingNewRuntime = newRuntime.load();
    await Promise.resolve();

    assert.deepEqual(events, []);

    oldTeardown.resolve();
    await Promise.all([unloadingOldRuntime, loadingNewRuntime]);
    assert.deepEqual(events, ['old-unloaded', 'new-settings', 'new-features']);
});

test('teardown while settings initialization is pending disposes the late persistence once', async () => {
    const fixture = createFixture();
    const loading = fixture.lifecycle.load();
    await settleCurrentTurn();
    const unloading = fixture.lifecycle.unload();

    fixture.settingsReady.resolve(fixture.persistence);
    await Promise.all([loading, unloading]);

    assert.deepEqual(fixture.events, ['dispose-settings']);
});
