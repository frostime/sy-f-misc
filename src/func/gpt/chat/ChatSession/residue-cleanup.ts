import { createResidueCleanup } from './tree-residue';

/** Commit only the reviewed graph-external groups. The backup is a separate
 * permanent history, not a replacement for the source's existing saved file.
 * Cache synchronization still follows the normal asynchronous replica path. */
export const commitResidueCleanup = async (options: {
    reviewedHistory: IChatSessionHistoryV2;
    groupIds: string[];
    source: {
        snapshot(): IChatSessionHistoryV2;
        apply(history: IChatSessionHistoryV2): void;
        assertEditable(): void;
    };
    persistence: {
        saveBackup(history: IChatSessionHistoryV2): Promise<boolean>;
        saveWorking(history: IChatSessionHistoryV2): boolean;
    };
    newId(): string;
}): Promise<{ removedCount: number; bytes: number; backupId: string }> => {
    const { source, persistence } = options;
    const expected = JSON.stringify(options.reviewedHistory);
    const readReviewedSource = () => {
        source.assertEditable();
        const history = source.snapshot();
        if (!history || JSON.stringify(history) !== expected) {
            throw new Error('对话已变化，请重新检查残留、审查并确认');
        }
        return history;
    };
    const original = readReviewedSource();
    const cleanup = createResidueCleanup(original, options.groupIds);
    const now = Date.now();
    const backupId = options.newId();
    if (!backupId || backupId === original.id) throw new Error('无法创建独立备份，已取消清理');
    const backup = {
        ...original,
        id: backupId,
        title: `${original.title} - 残留清理前备份`,
        timestamp: now,
        updated: now,
    };
    if (!await persistence.saveBackup(backup)) {
        throw new Error('完整备份未保存成功，已取消清理');
    }
    // Saving the backup awaits platform I/O. Never apply an old plan to a source
    // that changed (including a new session or generation) during that interval.
    readReviewedSource();
    try {
        source.apply({ ...cleanup.history, updated: Date.now() });
        if (!persistence.saveWorking(source.snapshot())) {
            throw new Error('清理后的对话无法写入本地存储');
        }
    } catch (error) {
        source.apply(original);
        const restored = persistence.saveWorking(original);
        if (!restored) {
            throw new Error(`本地存储失败；内存已恢复，完整备份保留于永久历史（${backupId}）`);
        }
        throw new Error(`清理未完成，原对话已恢复；完整备份仍保留。${(error as Error).message || ''}`);
    }
    return { removedCount: cleanup.removedCount, bytes: cleanup.bytes, backupId };
};
