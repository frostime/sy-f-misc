/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 01:45:14
 * @FilePath     : /src/func/gpt/tools/toolchain.ts
 * @Description  : 工具调用链执行器
 */
import { complete } from '../openai/complete';
import { ToolExecuteStatus, ToolExecuteResult, ToolExecutor } from '.';

/**
 * 提取消息内容文本（处理 string | array 类型）
 */
function extractContentText(content: string | any[] | undefined | null): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        // 处理 content 数组格式（如包含 text 和 image_url）
        return content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n');
    }
    return '';
}

/**
 * 压缩 JSON 对象中的字符串值
 * 递归遍历，将字符串类型的 leaf 节点截断到 maxLength
 * @param obj 要压缩的对象
 * @param maxLength 字符串最大长度
 * @param excludeKeys 排除的键名（不截断）
 */
function truncateJson(
    obj: any,
    maxLength: number = 50,
    excludeKeys: Set<string> = new Set(['id', 'path'])
): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    // 处理字符串
    if (typeof obj === 'string') {
        if (obj.length <= maxLength) {
            return obj;
        }
        return obj.substring(0, maxLength) + '...';
    }

    // 处理数组
    if (Array.isArray(obj)) {
        return obj.map(item => truncateJson(item, maxLength, excludeKeys));
    }

    // 处理对象
    if (typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && !excludeKeys.has(key)) {
                // 字符串类型且不在排除列表中：截断
                result[key] = value.length > maxLength
                    ? value.substring(0, maxLength) + '...'
                    : value;
            } else {
                // 递归处理
                result[key] = truncateJson(value, maxLength, excludeKeys);
            }
        }
        return result;
    }

    // 其他类型（数字、布尔等）直接返回
    return obj;
}

// ============================================================================
// MessageFlowFormatter - 消息流转换为自然对话格式
// ============================================================================
namespace MessageFlowFormatter {

    /**
     * 格式化单个工具调用为纯 Markdown 块
     */
    function formatToolCallBlock(
        toolCall: IToolCallResponse,
        toolResult: ToolExecuteResult,
        toolExecutor: ToolExecutor
    ): string {
        const toolName = toolCall.function.name;

        // 安全解析参数
        let args: Record<string, any>;
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch {
            args = { _raw: toolCall.function.arguments };
        }

        // 压缩参数（截断长字符串）
        const compressedArgs = truncateJson(args, 50);

        // 构建工具调用块
        const lines: string[] = [];

        // 工具调用头部
        lines.push(`**[System Tool Call Log]**: ${toolName}`);
        lines.push('```json');
        lines.push(JSON.stringify(compressedArgs));
        lines.push('```');
        lines.push('');

        // 响应部分
        lines.push('Response:');

        if (toolResult.status === ToolExecuteStatus.SUCCESS) {
            // 提取 VarID（从 finalText 中匹配）
            const varMatch = toolResult.finalText?.match(/完整结果已保存至变量: (\S+)/);
            const varId = varMatch ? varMatch[1] : null;

            if (varId) {
                // 有 VarID：显示引用和预览
                lines.push('```txt');
                lines.push(`✓ 执行成功`);
                lines.push(`📦 完整结果已保存: $VAR_REF{{${varId}}}`);

                if (toolResult.formattedText) {
                    const preview = toolResult.formattedText.length > 200
                        ? toolResult.formattedText.substring(0, 200) + '...'
                        : toolResult.formattedText;

                    // 清理预览（移除注释）
                    const cleanPreview = preview
                        .replace(/<!--.*?-->/gs, '')
                        .trim();

                    if (cleanPreview) {
                        lines.push('');
                        lines.push('📋 预览:');
                        lines.push(cleanPreview);
                    }
                }
                lines.push('```');
            } else {
                // 无 VarID（小内容）：直接显示
                const content = toolResult.finalText || JSON.stringify(toolResult.data);
                const display = content.length > 300
                    ? content.substring(0, 300) + '...'
                    : content;

                lines.push('```txt');
                lines.push('✓ 执行成功');
                lines.push('');
                lines.push(display);
                lines.push('```');
            }
        } else {
            // 失败或拒绝
            const statusIcon = toolResult.status === ToolExecuteStatus.ERROR ? '✗' : '⚠️';
            const statusText = toolResult.status === ToolExecuteStatus.ERROR ? '执行失败' : '执行被拒绝';
            const errorMsg = toolResult.error || toolResult.rejectReason || '未知错误';

            lines.push('```txt');
            lines.push(`${statusIcon} ${statusText}`);
            lines.push(`💬 原因: ${errorMsg}`);
            lines.push('```');
        }

        lines.push('---');
        lines.push('');

        return lines.join('\n');
    }

    /**
     * 将消息数组转换为自然的对话流
     */
    export function convertMessagesToNaturalFlow(
        messages: IMessage[],
        toolCallHistory: ToolChainResult['toolCallHistory'],
        toolExecutor: ToolExecutor
    ): string {
        const parts: string[] = [];

        // 建立 tool_call_id → 结果的映射
        const toolResultMap = new Map<string, ToolChainResult['toolCallHistory'][number]>();
        toolCallHistory.forEach(call => {
            toolResultMap.set(call.callId, call);
        });

        for (const msg of messages) {
            if (msg.role === 'assistant') {
                // Assistant 的思考内容
                const content = extractContentText(msg.content);
                if (content && content.trim()) {
                    parts.push(content.trim());
                    parts.push('');
                }

                // 格式化工具调用
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    for (const toolCall of msg.tool_calls) {
                        const historyEntry = toolResultMap.get(toolCall.id);
                        if (historyEntry) {
                            const formatted = formatToolCallBlock(
                                toolCall,
                                historyEntry.result,
                                toolExecutor
                            );
                            parts.push(formatted);
                        }
                    }
                }
            }
            // tool 消息已在 assistant.tool_calls 中处理，跳过
        }

        return parts.join('\n').trim();
    }

    /**
     * 生成系统提示（放在最开头）
     */
    export function generateSystemHint(): string {
        return `[System Tool Call Log]: 为了压缩 Token 占用, System 隐藏了中间的 Tool Message，但保留了完整 Tool Call 记录日志。工具结果已保存为变量（VarID），如需完整内容可使用 ReadVar 或 $VAR_REF{{}} 引用。

---

`;
    }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查响应是否为空
 */
const isEmptyResponse = (content: string | undefined | null): boolean => {
    return !content || content.trim().length === 0;
};


// ============================================================================
// 类型定义
// ============================================================================

/**
 * 工具调用链配置选项
 */
export interface ToolChainOptions {
    // 上下文消息历史
    contextMessages: IMessage[];

    // 最大轮次（LLM-工具调用往返）
    maxRounds?: number;

    // 中断控制器
    abortController?: AbortController;

    // 模型配置
    model?: IRuntimeLLM;

    // 系统提示词
    systemPrompt?: string;

    // 聊天选项
    chatOption?: IChatCompleteOption;

    // 是否检查工具结果
    checkToolResults?: boolean;

    // 事件回调
    callbacks?: {
        // 工具调用开始
        onToolCallStart?: (toolName: string, args: any, callId: string) => void;

        // 工具调用完成
        onToolCallComplete?: (result: ToolExecuteResult, callId: string) => void;

        // LLM 响应更新（流式）
        onLLMResponseUpdate?: (content: string, toolCalls?: IToolCallResponse[]) => void;

        // LLM 响应完成
        onLLMResponseComplete?: (response: ICompletionResult) => void;

        // 发送给 LLM 前
        onBeforeSendToLLM?: (messages: IMessage[]) => IMessage[] | void;

        // 错误发生
        onError?: (error: Error, phase: string) => void;
    };
}

/**
 * 工具调用链结果
 */
export interface ToolChainResult {
    // 最终响应内容
    responseContent: string;

    // 工具链内容（新版本为空字符串，保持向后兼容）
    toolChainContent: string;

    // Token 使用统计
    usage: ICompletionResult['usage'];

    // 消息分类
    messages: {
        // 原始上下文消息
        context: IMessage[];
        // 工具调用过程中产生的消息
        toolChain: IMessage[];
        // 合并后的完整消息历史
        complete: IMessage[];
    };

    // 工具调用历史
    toolCallHistory: {
        callId: string;
        toolName: string;
        args: any;
        result: ToolExecuteResult;
        startTime: number;
        endTime: number;
        roundIndex: number;
        resultRejected?: boolean;
        resultRejectReason?: string;
        llmUsage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
    }[];

    // 完成状态
    status: 'completed' | 'aborted' | 'error' | 'timeout';

    // 错误信息
    error?: string;

    // 执行统计
    stats: {
        totalRounds: number;
        totalCalls: number;
        totalTime: number;
        startTime: number;
        endTime: number;
    };
}

// ============================================================================
// 主函数：执行工具调用链
// ============================================================================

/**
 * 执行工具调用链
 * @param toolExecutor 工具执行器
 * @param llmResponseWithToolCalls 带有工具调用的 LLM 响应
 * @param options 工具调用链配置
 * @returns 工具调用链执行结果
 */
export async function executeToolChain(
    toolExecutor: ToolExecutor,
    llmResponseWithToolCalls: ICompletionResult,
    options: ToolChainOptions
): Promise<ToolChainResult> {

    // 初始化状态
    const state = {
        roundIndex: 0,
        callCount: 0,
        contextMessages: options.contextMessages || [],
        toolChainMessages: [] as IMessage[],
        allMessages: [...(options.contextMessages || [])],
        toolCallHistory: [] as ToolChainResult['toolCallHistory'],
        startTime: Date.now(),
        status: 'running' as 'running' | 'completed' | 'aborted' | 'error' | 'timeout',
        usage: llmResponseWithToolCalls.usage
    };

    // 设置默认值
    const maxRounds = options.maxRounds ?? 10;
    const callbacks = options.callbacks || {};
    const checkToolResults = options.checkToolResults ?? false;

    // 添加初始响应
    const initialAssistantMessage: IMessage = {
        role: 'assistant',
        content: llmResponseWithToolCalls.content,
        reasoning_content: llmResponseWithToolCalls.reasoning_content,
        tool_calls: llmResponseWithToolCalls.tool_calls
    };
    state.toolChainMessages.push(initialAssistantMessage);
    state.allMessages.push(initialAssistantMessage);

    // 当前响应
    let currentResponse = llmResponseWithToolCalls;
    let stopDueToLimit = false;

    try {
        // ====================================================================
        // 工具调用轮次循环
        // ====================================================================
        while (
            currentResponse.tool_calls?.length > 0 &&
            state.roundIndex < maxRounds &&
            state.status === 'running'
        ) {
            state.roundIndex++;
            const roundResults: ToolChainResult['toolCallHistory'] = [];

            // 处理所有工具调用
            for (const toolCall of currentResponse.tool_calls) {
                state.callCount++;

                // 解析参数
                let args: Record<string, any>;
                try {
                    args = JSON.parse(toolCall.function.arguments);
                } catch (error) {
                    console.warn(`Tool call arguments parse failed: ${toolCall.function.arguments}`);
                    args = {};
                    callbacks.onError?.(error, 'parse_arguments');

                    const toolResultMessage: IMessage = {
                        role: 'tool',
                        content: JSON.stringify({
                            error: `Failed to parse arguments as JSON: ${toolCall.function.arguments}`
                        }),
                        tool_call_id: toolCall.id
                    };

                    state.toolChainMessages.push(toolResultMessage);
                    state.allMessages.push(toolResultMessage);
                    continue;
                }

                // 执行工具
                const startTime = Date.now();
                callbacks.onToolCallStart?.(toolCall.function.name, args, toolCall.id);

                let toolResult: ToolExecuteResult;
                try {
                    toolResult = await toolExecutor.execute(
                        toolCall.function.name,
                        args,
                        {
                            skipExecutionApproval: false,
                            skipResultApproval: !checkToolResults
                        }
                    );
                } catch (error) {
                    toolResult = {
                        status: ToolExecuteStatus.ERROR,
                        error: error.message || 'Tool execution failed'
                    };
                    callbacks.onError?.(error, 'tool_execution');
                }

                const endTime = Date.now();
                callbacks.onToolCallComplete?.(toolResult, toolCall.id);

                // 记录历史
                const historyEntry: ToolChainResult['toolCallHistory'][number] = {
                    callId: toolCall.id,
                    toolName: toolCall.function.name,
                    args,
                    result: toolResult,
                    startTime,
                    endTime,
                    roundIndex: state.roundIndex
                };

                if (toolResult.status === ToolExecuteStatus.RESULT_REJECTED) {
                    historyEntry.resultRejected = true;
                    historyEntry.resultRejectReason = toolResult.rejectReason;
                }

                state.toolCallHistory.push(historyEntry);
                roundResults.push(historyEntry);

                // 处理拒绝情况
                if (
                    toolResult.status === ToolExecuteStatus.EXECUTION_REJECTED ||
                    toolResult.status === ToolExecuteStatus.RESULT_REJECTED
                ) {
                    const rejectionMessage: IMessage = {
                        role: 'tool',
                        content: JSON.stringify({
                            status: 'rejected',
                            message: toolResult.rejectReason || 'Tool execution or result rejected'
                        }),
                        tool_call_id: toolCall.id
                    };

                    state.toolChainMessages.push(rejectionMessage);
                    state.allMessages.push(rejectionMessage);
                    continue;
                }

                // 构建工具结果消息
                const toolResultContent = toolResult.status === ToolExecuteStatus.SUCCESS
                    ? (toolResult.finalText ?? JSON.stringify(toolResult.data))
                    : (toolResult.finalText ?? JSON.stringify({
                        error: toolResult.error || 'Tool execution failed'
                    }));

                const toolResultMessage: IMessage = {
                    role: 'tool',
                    content: toolResultContent,
                    tool_call_id: toolCall.id
                };

                state.toolChainMessages.push(toolResultMessage);
                state.allMessages.push(toolResultMessage);
            }

            // 检查中断
            if (options.abortController?.signal.aborted) {
                state.status = 'aborted';
                break;
            }

            // 准备发送给 LLM
            let messagesToSend = [...state.allMessages];
            const modifiedMessages = callbacks.onBeforeSendToLLM?.(messagesToSend);
            if (modifiedMessages) {
                messagesToSend = modifiedMessages;
            }

            // 调用 LLM
            try {
                const response = await complete(messagesToSend, {
                    model: options.model,
                    systemPrompt: options.systemPrompt,
                    stream: options.chatOption?.stream || false,
                    streamMsg: callbacks.onLLMResponseUpdate,
                    abortController: options.abortController,
                    option: options.chatOption
                });

                currentResponse = response;
                callbacks.onLLMResponseComplete?.(response);

                const llmResponseMessage: IMessage = {
                    role: 'assistant',
                    content: response.content,
                    reasoning_content: response.reasoning_content,
                    tool_calls: response.tool_calls
                };

                state.toolChainMessages.push(llmResponseMessage);
                state.allMessages.push(llmResponseMessage);

                // 累积 token 使用量
                if (response.usage) {
                    if (!state.usage) {
                        state.usage = { ...response.usage };
                    } else {
                        state.usage.prompt_tokens += response.usage.prompt_tokens || 0;
                        state.usage.completion_tokens += response.usage.completion_tokens || 0;
                        state.usage.total_tokens += response.usage.total_tokens || 0;
                    }
                }

                // 记录 LLM usage 到本轮工具调用
                if (response.usage && roundResults.length > 0) {
                    roundResults.forEach(entry => {
                        const historyIndex = state.toolCallHistory.findIndex(h => h.callId === entry.callId);
                        if (historyIndex !== -1) {
                            state.toolCallHistory[historyIndex].llmUsage = response.usage;
                        }
                    });
                }
            } catch (error) {
                state.status = 'error';
                callbacks.onError?.(error, 'llm_response');
                break;
            }
        }

        // ====================================================================
        // 处理结束：检查是否需要生成最终回复
        // ====================================================================
        stopDueToLimit = state.status === 'running' && (
            currentResponse.tool_calls?.length > 0 ||
            isEmptyResponse(currentResponse.content)
        );

        if (stopDueToLimit) {
            console.debug('Requesting final response from LLM', {
                hasUnexecutedToolCalls: currentResponse.tool_calls?.length > 0,
                isContentEmpty: isEmptyResponse(currentResponse.content),
                reason: state.roundIndex >= maxRounds ? 'max_rounds_reached' : 'empty_response'
            });

            // 为未执行的工具调用添加占位符
            if (currentResponse.tool_calls?.length > 0) {
                for (const toolCall of currentResponse.tool_calls) {
                    const placeholderMessage: IMessage = {
                        role: 'tool',
                        content: JSON.stringify({
                            status: 'incomplete',
                            message: 'Tool chain execution stopped due to max rounds limit',
                            reason: 'max_rounds_reached'
                        }),
                        tool_call_id: toolCall.id
                    };

                    state.toolChainMessages.push(placeholderMessage);
                    state.allMessages.push(placeholderMessage);
                }
            }

            // 构建提示
            const promptContent = currentResponse.tool_calls?.length > 0
                ? `[SYSTEM] Tool chain execution stopped: reached maximum rounds (${maxRounds}).

Based on the information gathered so far, please provide a response to the user that:
1. Acknowledges any incomplete investigations due to the limit
2. Summarizes what HAS been accomplished/discovered
3. Provides useful insights based on available information
4. If appropriate, suggests what additional information could not be gathered, how could subsequent agent handovers address it, or what next steps the user might take.

Provide a complete, helpful response even if some planned tool calls could not be executed.`
                : '[SYSTEM] Tool calls completed. Please provide a final response to the user based on the tool results.';

            state.allMessages.push({
                role: 'user',
                content: promptContent
            });

            try {
                const followUpResponse = await complete(state.allMessages, {
                    model: options.model,
                    systemPrompt: options.systemPrompt,
                    stream: options.chatOption?.stream || false,
                    streamMsg: callbacks.onLLMResponseUpdate,
                    abortController: options.abortController,
                    option: options.chatOption
                });

                currentResponse = followUpResponse;
                callbacks.onLLMResponseComplete?.(followUpResponse);

                state.toolChainMessages.push({
                    role: 'assistant',
                    content: followUpResponse.content,
                    reasoning_content: followUpResponse.reasoning_content
                });

                state.allMessages.push({
                    role: 'assistant',
                    content: followUpResponse.content,
                    reasoning_content: followUpResponse.reasoning_content
                });

                // 累积 token
                if (followUpResponse.usage) {
                    if (!state.usage) {
                        state.usage = { ...followUpResponse.usage };
                    } else {
                        state.usage.prompt_tokens += followUpResponse.usage.prompt_tokens || 0;
                        state.usage.completion_tokens += followUpResponse.usage.completion_tokens || 0;
                        state.usage.total_tokens += followUpResponse.usage.total_tokens || 0;
                    }
                }
            } catch (error) {
                console.error('Failed to generate final response:', error);
                callbacks.onError?.(error, 'final_response');
            }
        }

        // 设置完成状态
        if (state.status === 'running') {
            state.status = 'completed';
        }
    } catch (error) {
        state.status = 'error';
        callbacks.onError?.(error, 'chain_execution');
    }

    // ========================================================================
    // 清理工具调用历史数据
    // ========================================================================
    const toolCallHistoryClean = state.toolCallHistory.map(call => {
        const { status, data, error, rejectReason } = call.result;
        const resultClean: any = { status, data, error, rejectReason };

        // 使用实际发送给 LLM 的内容
        if (call.result.finalText !== undefined) {
            resultClean.data = call.result.finalText;
        }

        return {
            ...call,
            result: resultClean
        };
    });

    // ========================================================================
    // 构建最终返回结果
    // ========================================================================

    // toolChainContent 设为空（废弃旧的 hack）
    let toolChainContent = '';

    // responseContent 转换为自然消息流
    let responseContent: string;

    if (state.toolCallHistory.length > 0) {
        // 有工具调用：转换为自然流
        const systemHint = MessageFlowFormatter.generateSystemHint();
        const naturalFlow = MessageFlowFormatter.convertMessagesToNaturalFlow(
            state.toolChainMessages,
            toolCallHistoryClean,
            toolExecutor
        );
        toolChainContent = systemHint;
        responseContent = naturalFlow;
    } else {
        // 无工具调用：直接使用最终回复
        responseContent = currentResponse.content || '';
    }

    const result: ToolChainResult = {
        toolChainContent,
        responseContent,
        usage: state.usage,
        messages: {
            context: state.contextMessages,
            toolChain: state.toolChainMessages,
            complete: state.allMessages
        },
        toolCallHistory: toolCallHistoryClean,
        // @ts-ignore
        status: state.status === 'running' ? 'completed' : state.status,
        error: state.status === 'error' ? 'Error executing tool chain' : undefined,
        stats: {
            totalRounds: state.roundIndex,
            totalCalls: state.callCount,
            totalTime: Date.now() - state.startTime,
            startTime: state.startTime,
            endTime: Date.now()
        }
    };
    return result;
}
