import { batch, type Accessor } from 'solid-js';
import type { ITreeModel } from './use-tree-model';
import { extractContentText } from '../../chat-utils/msg-content';
import { stripReplayMetadata } from '../../openai/replay-contract';

export type PrepareMode = 'append' | { updateAt: number } | { insertAt: number };

export interface ExtendedCompletionResult extends ICompletionResult {
    toolChainResult?: IMessagePayload['toolChainResult'];
    /** Native tool-turn messages preceding the final assistant response; intermediate reasoning is stripped. */
    toolChainMessages?: IMessage[];
}

/**
 * 用户手写正文创建新版本：正文是唯一所有者，replay 不随版本复制到新版本。
 * 旧版本 payload 不变；`reasoning_content` 等无编辑入口的字段按原值保留。
 */
export const buildUserEditedVersion = (
    current: IMessagePayload,
    content: string,
    versionId: string,
): IMessagePayload => ({
    id: versionId,
    message: stripReplayMetadata({ ...current.message, content }),
    author: 'User',
    timestamp: Date.now(),
    // 整组拷贝内容结构字段，避免版本切换退化丢工具调用结构
    ...(current.toolChainMessages ? { toolChainMessages: current.toolChainMessages } : {}),
    ...(current.toolChainResult ? { toolChainResult: current.toolChainResult } : {}),
    ...(current.userPromptSlice ? { userPromptSlice: current.userPromptSlice } : {}),
});

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
                    extra: result.extra,
                },
                author: preparedPayload.author ?? meta.modelName,
                timestamp: Date.now(),
                usage: result.usage,
                time: result.time,
                token: result.usage?.completion_tokens,
                userPromptSlice: undefined,
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
