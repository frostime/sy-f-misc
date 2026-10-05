import { openIframeDialog } from '@/func/html-pages/core';
import { extractContentText } from '@gpt/chat-utils/msg-content';
import { inspectTreeResidue, createResidueCleanup } from '../tree-residue';
import { commitResidueCleanup } from '../residue-cleanup';

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
        saveWorking(history: IChatSessionHistoryV2): boolean;
    };
    newId(): string;
}) => {
    let revision = 0;
    let reviewed: IChatSessionHistoryV2 | null = null;
    let reviewedJson = '';
    let cleaning = false;
    const readReview = (expectedRevision: number) => {
        options.source.assertEditable();
        if (!reviewed || revision !== expectedRevision || JSON.stringify(options.source.snapshot()) !== reviewedJson) {
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
        reviewed = snapshot;
        reviewedJson = JSON.stringify(snapshot);
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
                        return { groupIds: [...groupIds], nodeIds: plan.nodeIds, bytes: plan.bytes, removedCount: plan.removedCount };
                    },
                    executeResidueCleanup: async (groupIds: string[], expectedRevision: number) => {
                        if (cleaning) throw new Error('清理正在执行，请勿重复提交');
                        const history = readReview(expectedRevision);
                        cleaning = true;
                        try {
                            const result = await commitResidueCleanup({ ...options, reviewedHistory: history, groupIds: [...groupIds] });
                            cleaning = false;
                            return { ...result, report: getReport() };
                        } finally {
                            cleaning = false;
                        }
                    },
                },
            },
        },
    });
};
