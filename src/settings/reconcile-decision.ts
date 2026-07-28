/**
 * @SpecDoc src/settings/SETTINGS-LIFECYCLE.SPEC.md
 */
export type SettingsScopeSnapshot = {
    diskExisted: boolean;
    lastSeenDisk: unknown;
    lastAppliedRuntime: unknown;
};

export type SettingsReconcileDecision =
    | 'unchanged'
    | 'already-current'
    | 'keep-local-dirty'
    | 'apply-stored-settings'
    | 'defer-deletion';

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

export const decideSettingsReconciliation = (options: {
    snapshot: SettingsScopeSnapshot;
    nextExists: boolean;
    nextDisk: unknown;
    currentRuntime: unknown;
}): SettingsReconcileDecision => {
    const { snapshot, nextExists, nextDisk, currentRuntime } = options;
    if (!nextExists) {
        return snapshot.diskExisted ? 'defer-deletion' : 'unchanged';
    }
    if (snapshot.diskExisted && settingsEqual(nextDisk, snapshot.lastSeenDisk)) {
        return 'unchanged';
    }
    if (settingsEqual(nextDisk, currentRuntime)) {
        return 'already-current';
    }
    if (!settingsEqual(currentRuntime, snapshot.lastAppliedRuntime)) {
        return 'keep-local-dirty';
    }
    return 'apply-stored-settings';
};
