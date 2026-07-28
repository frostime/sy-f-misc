export type RuntimeLifecycleState =
    | 'created'
    | 'loading-settings'
    | 'loading-features'
    | 'active'
    | 'disposed';

export interface RuntimeSettingsPersistence {
    scheduleReconcileAfterStorageSync(): void;
    dispose(): void | Promise<void>;
}

export interface FMiscRuntimeLifecycleOptions {
    initializeSettings: () => Promise<RuntimeSettingsPersistence>;
    loadFeatures: (signal: AbortSignal) => Promise<void>;
    unloadFeatures: () => Promise<void>;
    logError?: (message: string, error: unknown) => void;
    teardownBarrierKey?: symbol;
}

const DEFAULT_TEARDOWN_BARRIER_KEY = Symbol.for('sy-f-misc.runtime-lifecycle.teardown');
const runtimeGlobals = globalThis as typeof globalThis & Record<symbol, Promise<void> | undefined>;

/** Coordinates settings and feature lifecycles behind SiYuan's synchronous callbacks. */
export class FMiscRuntimeLifecycle {
    private readonly options: FMiscRuntimeLifecycleOptions;
    private readonly teardownBarrierKey: symbol;
    private readonly previousTeardown: Promise<void>;
    private state: RuntimeLifecycleState = 'created';
    private settingsPersistence?: RuntimeSettingsPersistence;
    private storageChangePending = false;
    private featureStartupBegan = false;
    private readonly featureStartupAbort = new AbortController();
    private loadPromise?: Promise<void>;
    private unloadPromise?: Promise<void>;

    constructor(options: FMiscRuntimeLifecycleOptions) {
        this.options = options;
        this.teardownBarrierKey = options.teardownBarrierKey ?? DEFAULT_TEARDOWN_BARRIER_KEY;
        this.previousTeardown = runtimeGlobals[this.teardownBarrierKey] ?? Promise.resolve();
    }

    load(): Promise<void> {
        if (this.loadPromise) return this.loadPromise;
        if (this.state !== 'created') return Promise.resolve();

        this.loadPromise = this.loadRuntime();
        return this.loadPromise;
    }

    notifyStorageDataChanged(): void {
        if (this.state === 'disposed') return;
        if (this.state !== 'active') {
            this.storageChangePending = true;
            return;
        }
        this.settingsPersistence?.scheduleReconcileAfterStorageSync();
    }

    unload(): Promise<void> {
        if (this.unloadPromise) return this.unloadPromise;

        this.state = 'disposed';
        this.storageChangePending = false;
        this.featureStartupAbort.abort();
        const settingsDisposal = Promise.resolve(this.settingsPersistence?.dispose());
        this.settingsPersistence = undefined;

        const teardown = this.unloadAfterStartupSettles(settingsDisposal);
        this.unloadPromise = teardown;
        runtimeGlobals[this.teardownBarrierKey] = teardown;
        const forgetTeardown = () => {
            if (runtimeGlobals[this.teardownBarrierKey] === teardown) {
                runtimeGlobals[this.teardownBarrierKey] = undefined;
            }
        };
        void teardown.then(forgetTeardown, forgetTeardown);
        return teardown;
    }

    getState(): RuntimeLifecycleState {
        return this.state;
    }

    private async loadRuntime(): Promise<void> {
        this.state = 'loading-settings';
        await this.previousTeardown;
        if (this.isDisposed()) return;

        const settingsPersistence = await this.options.initializeSettings();
        if (this.isDisposed()) {
            await settingsPersistence.dispose();
            return;
        }

        this.settingsPersistence = settingsPersistence;
        this.state = 'loading-features';
        this.featureStartupBegan = true;
        await this.options.loadFeatures(this.featureStartupAbort.signal);
        if (this.isDisposed()) return;

        this.state = 'active';
        if (this.storageChangePending) {
            this.storageChangePending = false;
            settingsPersistence.scheduleReconcileAfterStorageSync();
        }
    }

    private async unloadAfterStartupSettles(settingsDisposal: Promise<void>): Promise<void> {
        const [startupResult, settingsResult] = await Promise.allSettled([
            this.loadPromise,
            settingsDisposal
        ]);
        if (startupResult.status === 'rejected') {
            this.logError('Failed to settle fmisc startup before teardown:', startupResult.reason);
        }
        if (settingsResult.status === 'rejected') {
            this.logError('Failed to dispose fmisc settings persistence:', settingsResult.reason);
        }

        if (this.featureStartupBegan) {
            try {
                await this.options.unloadFeatures();
            } catch (error) {
                this.logError('Failed to unload fmisc feature modules:', error);
            }
        }
    }

    private isDisposed(): boolean {
        return this.state === 'disposed';
    }

    private logError(message: string, error: unknown): void {
        (this.options.logError ?? console.error)(message, error);
    }
}
