import { extractContentText } from '../../chat-utils/msg-content';
import type { ToolChainResult } from '../../tools/toolchain';
import type { ExtendedCompletionResult } from './message-lifecycle';

/** 原生工具消息保存在版本 payload，末条 assistant 单独作为回答正文。 */
export const toolChainToCompletion = (
    result: ToolChainResult,
    initialResponse: ICompletionResult
): ExtendedCompletionResult => {
    const messages = result.messages.toolChain;
    const last = messages[messages.length - 1];
    const hasFinalAssistant = last?.role === 'assistant';

    return {
        ok: result.status === 'completed',
        content: hasFinalAssistant ? extractContentText(last.content)
            : result.status === 'error' ? `[Error] ${result.error || 'Tool chain failed'}` : '',
        reasoning_content: hasFinalAssistant ? last.reasoning_content : undefined,
        extra: hasFinalAssistant ? last.extra : undefined,
        usage: result.usage,
        time: initialResponse.time,
        // Follow-up 失败时可能以 tool(incomplete) 结束；仍保存完整序列，不合成压缩日志。
        toolChainMessages: (hasFinalAssistant ? messages.slice(0, -1) : messages).map(stripReasoning),
        toolChainResult: {
            toolCallHistory: result.toolCallHistory,
            stats: result.stats,
            status: result.status,
            error: result.error
        }
    };
};

function stripReasoning(message: IMessage): IMessage {
    if (message.role === 'assistant' && 'reasoning_content' in message) {
        // Narrow replay references reasoning text by length, so it must survive persistence.
        // Other protocols keep the existing payload reduction.
        const extra = (message as { extra?: IMessageExtra }).extra;
        if (extra != null && 'slots' in extra) return message;
        const { reasoning_content: _reasoning, ...rest } = message;
        return rest;
    }
    return message;
}
