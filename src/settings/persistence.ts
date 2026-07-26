import type FMiscPlugin from '@/index';
import { toggleEnable } from '@/func';
import { debounce } from '@frostime/siyuan-plugin-kits';

const LEGACY_CONFIG_FILE = 'configs.json';
const MODULE_CONFIG_FILE = 'custom-module.config.json';

type SettingsScopeSnapshot = {
    diskExisted: boolean;
    lastSeenDisk: unknown;
    lastAppliedRuntime: unknown;
};

type StorageReadResult =
    | { ok: true; exists: boolean; data: unknown }
    | { ok: false };

type ReconcileDecision =
    | 'unchanged'
    | 'already-current'
    | 'keep-local-dirty'
    | 'apply-stored-settings'
    | 'defer-deletion'
    | 'apply-failed';

const cloneSettingsValue = <T>(value: T): T => {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
};

const settingsEqual = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
        return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        return left.every((value, index) => settingsEqual(value, right[index]));
    }

    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return leftKeys.length === rightKeys.length
        && leftKeys.every(key => Object.prototype.hasOwnProperty.call(rightRecord, key))
        && leftKeys.every(key => settingsEqual(leftRecord[key], rightRecord[key]));
};

const asRecord = (value: unknown): Record<string, any> | undefined => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return value as Record<string, any>;
};

const hasOwn = (record: Record<string, any> | undefined, key: string) =>
    record !== undefined && Object.prototype.hasOwnProperty.call(record, key);

export interface SettingsPersistenceOptions {
    plugin: FMiscPlugin;
    enabledSettingItems: ISettingItem[];
    miscSettingItems: ISettingItem[];
    modules: IFuncModule[];
}

export class SettingsPersistence {
    private readonly plugin: FMiscPlugin;
    private readonly enabledSettingItems: ISettingItem[];
    private readonly miscSettingItems: ISettingItem[];
    private readonly moduleConfigs: NonNullable<IFuncModule['declareModuleConfig']>[];
    private readonly dedicatedSettingsStorages: NonNullable<IFuncModule['declareDedicatedSettingsStorage']>[];

    private readonly legacySnapshots = new Map<string, SettingsScopeSnapshot>();
    private readonly moduleSnapshots = new Map<string, SettingsScopeSnapshot>();
    private readonly dedicatedSettingsSnapshots = new Map<string, SettingsScopeSnapshot>();
    private readonly pendingEnableTransitions = new Map<string, boolean>();
    private readonly restoreModuleSettingSetters: (() => void)[] = [];

    private disposed = false;
    private reconciliationRunning = false;
    private reconciliationPending = false;

    private readonly saveLegacySettingsDebounced = debounce(
        () => this.plugin.saveConfigs(),
        1000 * 10
    );

    private readonly applyLegacySettingSideEffectDebounced = debounce(
        (group: string, key: string, value: any) => {
            this.applyLegacySettingSideEffect(group, key, value);
        },
        1000 * 2
    );

    private readonly saveModuleSettingsDebounced = debounce(
        () => this.saveModuleSettings(),
        1000 * 5
    );

    private constructor(options: SettingsPersistenceOptions) {
        this.plugin = options.plugin;
        this.enabledSettingItems = options.enabledSettingItems;
        this.miscSettingItems = options.miscSettingItems;
        this.moduleConfigs = options.modules.flatMap(module =>
            module.declareModuleConfig ? [module.declareModuleConfig] : []
        );
        this.dedicatedSettingsStorages = options.modules.flatMap(module =>
            module.declareDedicatedSettingsStorage ? [module.declareDedicatedSettingsStorage] : []
        );
    }

    static async initialize(options: SettingsPersistenceOptions): Promise<SettingsPersistence> {
        const persistence = new SettingsPersistence(options);
        await persistence.loadInitialSettings();
        persistence.installModuleSettingSetters();
        return persistence;
    }

    updateLegacySetting(event: { group: string; key: string; value: any }) {
        if (this.disposed) return;
        const { group, key, value } = event;
        const configs = this.plugin.data.configs;
        if (configs[group] && configs[group][key] !== undefined) {
            configs[group][key] = value;
        }
        this.updateSettingItems();

        this.saveLegacySettingsDebounced();
        this.applyLegacySettingSideEffectDebounced(group, key, value);
    }

    scheduleReconcileAfterStorageSync() {
        if (this.disposed) return;
        if (this.reconciliationRunning) {
            this.reconciliationPending = true;
            return;
        }
        void this.drainReconciliationQueue();
    }

    dispose() {
        this.disposed = true;
        this.reconciliationPending = false;
        this.pendingEnableTransitions.clear();
        this.restoreModuleSettingSetters.splice(0).forEach(restore => restore());
    }

    private async loadInitialSettings() {
        this.plugin.data.configs = {
            Enable: Object.fromEntries(this.enabledSettingItems.map(item => [item.key, item.value])),
            Misc: Object.fromEntries(this.miscSettingItems.map(item => [item.key, item.value]))
        } as FMiscPlugin['data']['configs'];

        const storedLegacySettings = await this.plugin.loadConfigs();
        this.updateSettingItems();
        this.captureInitialLegacySnapshots(storedLegacySettings);

        const storedModuleSettings = asRecord(await this.plugin.loadData(MODULE_CONFIG_FILE)) ?? {};
        for (const config of this.moduleConfigs) {
            try {
                if (hasOwn(storedModuleSettings, config.key) && config.load) {
                    await config.load(storedModuleSettings[config.key]);
                }
                this.moduleSnapshots.set(config.key, {
                    diskExisted: hasOwn(storedModuleSettings, config.key),
                    lastSeenDisk: cloneSettingsValue(storedModuleSettings[config.key]),
                    lastAppliedRuntime: cloneSettingsValue(this.getCurrentModuleSettings(config))
                });
            } catch (error) {
                this.logScopeError(`module:${config.key}`, 'initialize', error);
            }
        }

        for (const storage of this.dedicatedSettingsStorages) {
            try {
                const stored = await this.plugin.loadData(storage.fileName);
                await storage.applyStoredSettingsToRuntime(stored, this.plugin);
                this.dedicatedSettingsSnapshots.set(storage.fileName, {
                    diskExisted: stored !== undefined && stored !== null,
                    lastSeenDisk: cloneSettingsValue(stored),
                    lastAppliedRuntime: cloneSettingsValue(storage.getRuntimeSettingsSnapshot())
                });
            } catch (error) {
                this.logScopeError(`file:${storage.fileName}`, 'initialize', error);
            }
        }
    }

    private captureInitialLegacySnapshots(stored: Record<string, any> | undefined) {
        const configs = this.plugin.data.configs;
        for (const groupName in configs) {
            const storedGroup = asRecord(stored?.[groupName]);
            for (const key in configs[groupName]) {
                this.legacySnapshots.set(`${groupName}.${key}`, {
                    diskExisted: hasOwn(storedGroup, key),
                    lastSeenDisk: cloneSettingsValue(storedGroup?.[key]),
                    lastAppliedRuntime: cloneSettingsValue(configs[groupName][key])
                });
            }
        }
    }

    private async drainReconciliationQueue() {
        if (this.reconciliationRunning || this.disposed) return;
        this.reconciliationRunning = true;
        try {
            do {
                this.reconciliationPending = false;
                await this.reconcileStoredSettings();
            } while (this.reconciliationPending && !this.disposed);
        } catch (error) {
            console.error('Failed to reconcile synchronized settings:', error);
        } finally {
            this.reconciliationRunning = false;
            if (this.reconciliationPending && !this.disposed) {
                this.scheduleReconcileAfterStorageSync();
            }
        }
    }

    private async reconcileStoredSettings() {
        const reads = await this.readKnownSettingsFiles();
        if (this.disposed) return;

        const enableTransitions = new Map(this.pendingEnableTransitions);
        this.pendingEnableTransitions.clear();

        const legacyRead = reads.get(LEGACY_CONFIG_FILE);
        if (legacyRead?.ok) {
            await this.reconcileLegacySettings(legacyRead, enableTransitions);
        }

        const moduleRead = reads.get(MODULE_CONFIG_FILE);
        if (moduleRead?.ok) {
            await this.reconcileModuleSettings(moduleRead);
        }

        for (const storage of this.dedicatedSettingsStorages) {
            const read = reads.get(storage.fileName);
            if (read?.ok) {
                await this.reconcileDedicatedSettings(storage, read);
            }
        }

        this.updateSettingItems();
        if (this.disposed) return;

        for (const [key, enable] of enableTransitions) {
            if (this.plugin.getConfig('Enable', key) !== enable) continue;
            try {
                await toggleEnable(this.plugin, key, enable);
            } catch (error) {
                this.pendingEnableTransitions.set(key, enable);
                this.logScopeError(`legacy:Enable.${key}`, 'transition', error);
            }
        }
    }

    private async readKnownSettingsFiles(): Promise<Map<string, StorageReadResult>> {
        const fileNames = Array.from(new Set([
            LEGACY_CONFIG_FILE,
            MODULE_CONFIG_FILE,
            ...this.dedicatedSettingsStorages.map(storage => storage.fileName)
        ]));
        const entries = await Promise.all(fileNames.map(async (fileName): Promise<[string, StorageReadResult]> => {
            try {
                const data = await this.plugin.loadData(fileName);
                return [fileName, {
                    ok: true,
                    exists: data !== undefined && data !== null,
                    data
                }];
            } catch (error) {
                this.logScopeError(`file:${fileName}`, 'read', error);
                return [fileName, { ok: false }];
            }
        }));
        return new Map(entries);
    }

    private async reconcileLegacySettings(
        read: Extract<StorageReadResult, { ok: true }>,
        enableTransitions: Map<string, boolean>
    ) {
        const stored = asRecord(read.data);
        const configs = this.plugin.data.configs;

        for (const groupName in configs) {
            const storedGroup = asRecord(stored?.[groupName]);
            for (const key in configs[groupName]) {
                const scope = `${groupName}.${key}`;
                const current = () => configs[groupName][key];
                const snapshot = this.getSnapshot(this.legacySnapshots, scope, current());
                const nextExists = read.exists && hasOwn(storedGroup, key);
                const nextValue = storedGroup?.[key];
                const previousValue = current();

                const decision = await this.reconcileScope({
                    scope: `legacy:${scope}`,
                    snapshot,
                    nextExists,
                    nextDisk: nextValue,
                    getCurrentRuntime: current,
                    apply: value => {
                        configs[groupName][key] = value;
                        if (groupName !== 'Enable') {
                            this.applyLegacySettingSideEffect(groupName, key, value);
                        }
                    }
                });

                if (decision === 'apply-stored-settings'
                    && groupName === 'Enable'
                    && !Object.is(previousValue, current())) {
                    enableTransitions.set(key, current());
                }
            }
        }
    }

    private async reconcileModuleSettings(read: Extract<StorageReadResult, { ok: true }>) {
        const stored = asRecord(read.data);
        for (const config of this.moduleConfigs) {
            try {
                const current = () => this.getCurrentModuleSettings(config);
                const snapshot = this.getSnapshot(this.moduleSnapshots, config.key, current());
                await this.reconcileScope({
                    scope: `module:${config.key}`,
                    snapshot,
                    nextExists: read.exists && hasOwn(stored, config.key),
                    nextDisk: stored?.[config.key],
                    getCurrentRuntime: current,
                    apply: async value => {
                        if (!config.load) {
                            throw new Error('Module settings declaration has no load operation');
                        }
                        await config.load(value as Record<string, any>);
                    }
                });
            } catch (error) {
                this.logScopeError(`module:${config.key}`, 'reconcile', error);
            }
        }
    }

    private async reconcileDedicatedSettings(
        storage: NonNullable<IFuncModule['declareDedicatedSettingsStorage']>,
        read: Extract<StorageReadResult, { ok: true }>
    ) {
        try {
            const current = storage.getRuntimeSettingsSnapshot;
            const snapshot = this.getSnapshot(
                this.dedicatedSettingsSnapshots,
                storage.fileName,
                current()
            );
            await this.reconcileScope({
                scope: `file:${storage.fileName}`,
                snapshot,
                nextExists: read.exists,
                nextDisk: read.data,
                getCurrentRuntime: current,
                apply: value => storage.applyStoredSettingsToRuntime(
                    value as Record<string, unknown>,
                    this.plugin
                )
            });
        } catch (error) {
            this.logScopeError(`file:${storage.fileName}`, 'reconcile', error);
        }
    }

    private async reconcileScope(options: {
        scope: string;
        snapshot: SettingsScopeSnapshot;
        nextExists: boolean;
        nextDisk: unknown;
        getCurrentRuntime: () => unknown;
        apply: (value: unknown) => MaybePromise<void>;
    }): Promise<ReconcileDecision> {
        const { scope, snapshot, nextExists, nextDisk, getCurrentRuntime, apply } = options;
        if (!nextExists) {
            return snapshot.diskExisted ? 'defer-deletion' : 'unchanged';
        }
        if (snapshot.diskExisted && settingsEqual(nextDisk, snapshot.lastSeenDisk)) {
            return 'unchanged';
        }

        const currentRuntime = getCurrentRuntime();
        if (settingsEqual(nextDisk, currentRuntime)) {
            snapshot.diskExisted = true;
            snapshot.lastSeenDisk = cloneSettingsValue(nextDisk);
            snapshot.lastAppliedRuntime = cloneSettingsValue(currentRuntime);
            return 'already-current';
        }
        if (!settingsEqual(currentRuntime, snapshot.lastAppliedRuntime)) {
            return 'keep-local-dirty';
        }
        if (this.disposed) return 'unchanged';

        try {
            await apply(cloneSettingsValue(nextDisk));
            snapshot.diskExisted = true;
            snapshot.lastSeenDisk = cloneSettingsValue(nextDisk);
            snapshot.lastAppliedRuntime = cloneSettingsValue(getCurrentRuntime());
            return 'apply-stored-settings';
        } catch (error) {
            this.logScopeError(scope, 'apply', error);
            return 'apply-failed';
        }
    }

    private getSnapshot(
        snapshots: Map<string, SettingsScopeSnapshot>,
        key: string,
        currentRuntime: unknown
    ) {
        let snapshot = snapshots.get(key);
        if (!snapshot) {
            snapshot = {
                diskExisted: false,
                lastSeenDisk: undefined,
                lastAppliedRuntime: cloneSettingsValue(currentRuntime)
            };
            snapshots.set(key, snapshot);
        }
        return snapshot;
    }

    private getCurrentModuleSettings(config: NonNullable<IFuncModule['declareModuleConfig']>) {
        if (config.dump) return config.dump();
        return Object.fromEntries((config.items ?? []).map(item => [item.key, item.get()]));
    }

    private updateSettingItems() {
        const updateGroup = (items: ISettingItem[], group: string) => {
            items.forEach(item => {
                item.value = this.plugin.getConfig(group, item.key);
            });
        };

        updateGroup(this.enabledSettingItems, 'Enable');
        updateGroup(this.miscSettingItems, 'Misc');
    }

    private applyLegacySettingSideEffect(group: string, key: string, value: any) {
        if (group === 'Enable') {
            void toggleEnable(this.plugin, key, value).catch(error => {
                this.logScopeError(`legacy:Enable.${key}`, 'transition', error);
            });
            return;
        }

        if (group !== 'Docky' || key === 'DockyProtyle') return;

        const enable = this.plugin.getConfig('Docky', 'DockyEnableZoom');
        const factor = this.plugin.getConfig('Docky', 'DockyZoomFactor');
        document.documentElement.style.setProperty(
            '--plugin-docky-zoom',
            enable === false ? 'unset' : `${factor}`
        );
    }

    private installModuleSettingSetters() {
        this.moduleConfigs.forEach(config => {
            config.items?.forEach(item => {
                const originalSet = item.set;
                const wrappedSet = (value: any) => {
                    originalSet.call(item, value);
                    this.saveModuleSettingsDebounced();
                };
                item.set = wrappedSet;
                this.restoreModuleSettingSetters.push(() => {
                    if (item.set === wrappedSet) item.set = originalSet;
                });
            });
        });
    }

    private async saveModuleSettings() {
        try {
            const settings = Object.fromEntries(this.moduleConfigs.map(config => [
                config.key,
                this.getCurrentModuleSettings(config)
            ]));
            await this.plugin.saveData(MODULE_CONFIG_FILE, settings);
        } catch (error) {
            console.error('Failed to save module configs:', error);
        }
    }

    private logScopeError(scope: string, operation: string, error: unknown) {
        console.error(`Settings ${operation} failed for ${scope}:`, error);
    }
}
