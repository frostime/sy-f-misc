import { openIframeDialog } from '@/func/html-pages/core';
import { extractContentText } from '@gpt/chat-utils/msg-content';
import { inspectTreeResidue, createResidueCleanup } from '../tree-residue';
import { commitResidueCleanup, prepareResidueBackup, saveResidueBackup, VerifiedResidueBackup } from '../residue-cleanup';
import { serializeHistory } from '../../../persistence/history-equality';

/** A review belongs to one immutable source snapshot. The iframe holds only its
 * revision number; arbitrary node IDs or old previews cannot authorize deletion. */
export const showTreeResidueReview = (options: {
    source: {
        snapshot(): IChatSessionHistoryV2;
        apply(history: IChatSessionHistoryV2): void;
        assertEditable(): void;
    };
    persistence: {
        saveBackup(history: IChatSessionHistoryV2): Promise<boolean>;
        readBackup(id: string): Promise<IChatSessionHistoryV2 | null>;
        saveWorking(history: IChatSessionHistoryV2): boolean;
    };
    backupPath(id: string): string;
    archiveWorking(history: IChatSessionHistoryV2): Promise<boolean>;
    newId(): string;
}) => {
    let revision = 0;
    let reviewed: IChatSessionHistoryV2 | null = null;
    let reviewedJson = '';
    let cleaning = false;
    let preparedBackup: IChatSessionHistoryV2 | null = null;
    let verifiedBackup: VerifiedResidueBackup | null = null;
    const backupInfo = (backup: IChatSessionHistoryV2) => ({
        id: backup.id, title: backup.title, path: options.backupPath(backup.id),
    });
    const readReview = (expectedRevision: number) => {
        options.source.assertEditable();
        if (!reviewed || revision !== expectedRevision || serializeHistory(options.source.snapshot()) !== reviewedJson) {
            throw new Error('对话已变化，请重新检查后再审查和确认');
        }
        return reviewed;
    };
    const getReport = () => {
        if (cleaning) throw new Error('正在保存备份或清理，请稍候');
        options.source.assertEditable();
        const snapshot = options.source.snapshot();
        if (!snapshot) throw new Error('无法读取对话历史');
        const report = inspectTreeResidue(snapshot);
        const nextJson = serializeHistory(snapshot);
        if (nextJson !== reviewedJson) { preparedBackup = null; verifiedBackup = null; }
        reviewed = snapshot;
        reviewedJson = nextJson;
        return { ...report, revision: ++revision, sessionTitle: snapshot.title };
    };
    return openIframeDialog({
        title: '检查残留与断链',
        width: '1400px',
        height: '900px',
        maxWidth: '95%',
        maxHeight: '92%',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/chat-tree-residue.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk: {
                    getResidueReport: getReport,
                    getResidueNode: (nodeId: string, expectedRevision: number) => {
                        const history = readReview(expectedRevision);
                        const node = history.nodes[nodeId];
                        if (!Object.prototype.hasOwnProperty.call(history.nodes, nodeId)) throw new Error('这条记录不存在');
                        return {
                            id: nodeId,
                            type: node.type,
                            role: node.role,
                            parent: node.parent,
                            children: [...node.children],
                            currentVersionId: node.currentVersionId,
                            versions: Object.entries(node.versions).map(([id, payload]) => ({
                                id,
                                current: id === node.currentVersionId,
                                author: payload.author || '',
                                timestamp: payload.timestamp,
                                content: extractContentText(payload.message?.content ?? ''),
                                reasoning: typeof payload.message?.reasoning_content === 'string' ? payload.message.reasoning_content : '',
                                bytes: new TextEncoder().encode(JSON.stringify(payload)).length,
                            })),
                            rawJson: JSON.stringify(node, null, 2),
                        };
                    },
                    previewResidueCleanup: (groupIds: string[], expectedRevision: number) => {
                        const history = readReview(expectedRevision);
                        const plan = createResidueCleanup(history, groupIds);
                        preparedBackup ??= prepareResidueBackup(history, options.newId());
                        return {
                            groupIds: [...groupIds], nodeIds: plan.nodeIds, bytes: plan.bytes, removedCount: plan.removedCount,
                            backup: backupInfo(verifiedBackup?.history ?? preparedBackup), backupVerified: !!verifiedBackup,
                        };
                    },
                    saveResidueBackup: async (expectedRevision: number) => {
                        if (cleaning) throw new Error('操作正在执行，请稍候');
                        const history = readReview(expectedRevision);
                        if (!preparedBackup) throw new Error('请先预览清理范围和备份文件位置');
                        cleaning = true;
                        try {
                            verifiedBackup = await saveResidueBackup({ ...options, reviewedHistory: history, backup: preparedBackup });
                            return backupInfo(verifiedBackup.history);
                        } catch (error) {
                            verifiedBackup = null;
                            preparedBackup = null;
                            throw error;
                        } finally { cleaning = false; }
                    },
                    archiveResidueWorkingCopy: async (expectedRevision: number) => {
                        if (cleaning) throw new Error('操作正在执行，请稍候');
                        const history = readReview(expectedRevision);
                        cleaning = true;
                        try { return await options.archiveWorking(history); }
                        finally { cleaning = false; }
                    },
                    executeResidueCleanup: async (groupIds: string[], expectedRevision: number) => {
                        if (cleaning) throw new Error('清理正在执行，请勿重复提交');
                        const history = readReview(expectedRevision);
                        cleaning = true;
                        try {
                            const result = await commitResidueCleanup({ ...options, reviewedHistory: history, groupIds: [...groupIds], verifiedBackup });
                            cleaning = false;
                            return { ...result, backupPath: options.backupPath(result.backupId), report: getReport() };
                        } finally {
                            cleaning = false;
                        }
                    },
                },
            },
        },
    });
};
