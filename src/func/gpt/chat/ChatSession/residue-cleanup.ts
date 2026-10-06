import { createResidueCleanup } from './tree-residue';
import { serializeHistory } from '../../persistence/history-equality';

export interface ResidueCleanupSource {
    snapshot(): IChatSessionHistoryV2;
    apply(history: IChatSessionHistoryV2): void;
    assertEditable(): void;
}
export interface VerifiedResidueBackup {
    history: IChatSessionHistoryV2;
    sourceJson: string;
}

export const prepareResidueBackup = (original: IChatSessionHistoryV2, backupId: string): IChatSessionHistoryV2 => {
    if (!backupId || backupId === original.id) throw new Error('无法创建独立备份');
    const now = Date.now();
    return {
        ...structuredClone(original), id: backupId,
        title: `${original.title} - 残留清理前备份`, timestamp: now, updated: now,
    };
};

const readReviewedSource = (source: ResidueCleanupSource, expected: string) => {
    source.assertEditable();
    const history = source.snapshot();
    if (!history || serializeHistory(history) !== expected) {
        throw new Error('对话已变化，请重新检查残留、保存备份并确认');
    }
    return history;
};

/** Explicit step one: write an independent backup and read back its full body.
 * This does not apply a cleanup, change the source or save its working copy. */
export const saveResidueBackup = async (options: {
    reviewedHistory: IChatSessionHistoryV2;
    backup: IChatSessionHistoryV2;
    source: ResidueCleanupSource;
    persistence: {
        saveBackup(history: IChatSessionHistoryV2): Promise<boolean>;
        readBackup(id: string): Promise<IChatSessionHistoryV2 | null>;
    };
}): Promise<VerifiedResidueBackup> => {
    const sourceJson = serializeHistory(options.reviewedHistory);
    const original = readReviewedSource(options.source, sourceJson);
    const backup = structuredClone(options.backup);
    if (backup.id === original.id || serializeHistory(backup) !== serializeHistory({
        ...original, id: backup.id, title: backup.title, timestamp: backup.timestamp, updated: backup.updated,
    })) throw new Error('备份不是当前完整工作版的独立副本');
    if (!await options.persistence.saveBackup(backup)) throw new Error('完整备份未保存成功，未清理');
    const stored = await options.persistence.readBackup(backup.id);
    if (!stored || serializeHistory(stored) !== serializeHistory(backup)) {
        throw new Error(`备份文件无法读取或内容核验失败，未清理（${backup.id}）`);
    }
    try {
        readReviewedSource(options.source, sourceJson);
    } catch (error) {
        throw new Error(`备份已保存，但来源已变化或不可操作，未清理（${backup.id}）。${(error as Error).message}`);
    }
    return { history: backup, sourceJson };
};

/** Explicit step two: require the host-owned verified backup, recheck its body
 * and source after asynchronous reads, then update only the working copy. */
export const commitResidueCleanup = async (options: {
    reviewedHistory: IChatSessionHistoryV2;
    groupIds: string[];
    verifiedBackup: VerifiedResidueBackup | null;
    source: ResidueCleanupSource;
    persistence: {
        readBackup(id: string): Promise<IChatSessionHistoryV2 | null>;
        saveWorking(history: IChatSessionHistoryV2): boolean;
    };
}): Promise<{ removedCount: number; bytes: number; backupId: string }> => {
    const expected = serializeHistory(options.reviewedHistory);
    const original = readReviewedSource(options.source, expected);
    const receipt = options.verifiedBackup;
    if (!receipt || receipt.sourceJson !== expected || receipt.history.id === original.id) {
        throw new Error('请先为当前工作版保存并核验完整备份');
    }
    const cleanup = createResidueCleanup(original, options.groupIds);
    const stored = await options.persistence.readBackup(receipt.history.id);
    if (!stored || serializeHistory(stored) !== serializeHistory(receipt.history)) {
        throw new Error('备份文件已丢失、变化或无法核验，未清理；请重新保存备份');
    }
    readReviewedSource(options.source, expected);
    try {
        options.source.apply({ ...cleanup.history, updated: Date.now() });
        if (!options.persistence.saveWorking(options.source.snapshot())) throw new Error('清理后的工作版无法写入本地存储');
    } catch (error) {
        options.source.apply(original);
        const restored = options.persistence.saveWorking(original);
        if (!restored) throw new Error(`本地存储失败；内存已恢复，完整备份保留于永久历史（${receipt.history.id}）`);
        throw new Error(`清理未完成，原对话已恢复；完整备份仍保留。${(error as Error).message || ''}`);
    }
    return { removedCount: cleanup.removedCount, bytes: cleanup.bytes, backupId: receipt.history.id };
};
