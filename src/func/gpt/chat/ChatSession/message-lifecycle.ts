import { batch, type Accessor } from 'solid-js';
import type { ITreeModel } from './use-tree-model';
import { extractContentText } from '../../chat-utils/msg-content';

export type PrepareMode = 'append' | { updateAt: number } | { insertAt: number };

export interface ExtendedCompletionResult extends ICompletionResult {
    hintSize?: number;
    toolChainResult?: IMessagePayload['toolChainResult'];
    /** Native tool-turn messages preceding the final assistant response; intermediate reasoning is stripped. */
    toolChainMessages?: IMessage[];
}

interface FinalizeMeta {
    msgToSend: IMessage[];
    modelName: string;
}

/** One request writes to its prepared version, never whichever version the user happens to view. */
export const createMessageLifecycle = (
    treeModel: ITreeModel,
    model: Accessor<IRuntimeLLM>,
    newID: () => string
) => {
    const targetVersions = new Map<string, string>();

    const prepareSlot = (mode: PrepareMode): string => {
        const timestamp = Date.now();
        const versionId = `v${newID()}`;
        const payload: IMessagePayload = {
            id: versionId,
            message: { role: 'assistant', content: '' },
            author: model().model,
            timestamp,
        };
        // A rerun starts with fresh metadata. Old usage/reasoning/tool results remain only in the old version.
        if (mode !== 'append' && 'updateAt' in mode) {
            const id = treeModel.getWorldLine()[mode.updateAt];
            if (!treeModel.getNodeById(id)) throw new Error(`Invalid updateAt index: ${mode.updateAt}`);
            batch(() => {
                treeModel.addVersion(id, payload);
                treeModel.updateNode(id, { loading: true });
            });
            targetVersions.set(id, versionId);
            return id;
        }

        const id = newID();
        const node = {
            id,
            type: 'message' as const,
            role: 'assistant' as const,
            currentVersionId: versionId,
            versions: { [versionId]: payload },
            loading: true,
        };
        if (mode === 'append') {
            treeModel.appendNode(node);
        } else {
            const afterId = treeModel.getWorldLine()[mode.insertAt - 1];
            if (!afterId) throw new Error(`Invalid insertAt index: ${mode.insertAt}`);
            treeModel.insertAfter(afterId, node);
        }
        targetVersions.set(id, versionId);
        return id;
    };

    const updateContent = (
        id: string,
        content: string,
        snapshot?: Pick<ICompletionResult, 'content' | 'reasoning_content' | 'usage'>
    ): void => {
        const versionId = targetVersions.get(id);
        if (!versionId) return;
        treeModel.updatePayload(id, {
            message: {
                role: 'assistant',
                content: snapshot?.content ?? content,
                reasoning_content: snapshot?.reasoning_content,
            },
            ...(snapshot?.usage ? { usage: snapshot.usage } : {}),
        }, versionId);
    };

    const finalize = (id: string, result: ExtendedCompletionResult, meta: FinalizeMeta): void => {
        const versionId = targetVersions.get(id);
        const preparedPayload = treeModel.getNodeById(id)?.versions[versionId];
        if (!versionId || !preparedPayload) {
            throw new Error(`Response version no longer exists: ${id}`);
        }
        batch(() => {
            treeModel.updatePayload(id, {
                message: {
                    role: 'assistant',
                    content: result.content,
                    reasoning_content: result.reasoning_content,
                },
                author: preparedPayload.author ?? meta.modelName,
                timestamp: Date.now(),
                usage: result.usage,
                time: result.time,
                token: result.usage?.completion_tokens,
                userPromptSlice: result.toolChainMessages
                    ? undefined
                    : (result.hintSize ? [result.hintSize, result.content.length] : undefined),
                toolChainResult: result.toolChainResult,
                toolChainMessages: result.toolChainMessages,
            }, versionId);
            treeModel.updateNode(id, {
                loading: false,
                attachedItems: meta.msgToSend.length,
                attachedChars: meta.msgToSend.reduce((sum, m) => sum + extractContentText(m.content || '').length, 0),
            });
        });
        // Input usage describes the entire request context, not the preceding user message.
        targetVersions.delete(id);
    };

    const markError = (id: string, error: Error | string): void => {
        const versionId = targetVersions.get(id);
        if (!versionId) return;
        const message = error instanceof Error ? error.message : error;
        batch(() => {
            treeModel.updateNode(id, { loading: false });
            treeModel.updatePayload(id, {
                message: { role: 'assistant', content: `**[Error]** ${message}` },
            }, versionId);
        });
        targetVersions.delete(id);
    };

    return { prepareSlot, updateContent, finalize, markError };
};
