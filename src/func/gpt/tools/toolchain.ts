/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 01:45:14
 * @FilePath     : /src/func/gpt/tools/toolchain.ts
 * @Description  : 工具调用链执行器
 */
import { complete } from '../openai/complete';
import { sumReportedUsage } from './usage-sum';
import type { TStreamMsgCallback } from '../openai/response-parse';
import { ToolExecuteStatus, type ToolExecuteResult } from './types';
import type { ToolExecutor } from './executor';

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

    // Chat option 开关；toggle=false 的字段不发送给模型
    toggles?: Partial<Record<keyof IChatCompleteOption, boolean>>;

    // 是否检查工具结果
    checkToolResults?: boolean;

    // 事件回调
    callbacks?: {
        // 工具调用开始
        onToolCallStart?: (toolName: string, args: any, callId: string) => void;

        // 工具调用完成
        onToolCallComplete?: (result: ToolExecuteResult, callId: string) => void;

        // LLM 响应更新（流式）
        onLLMResponseUpdate?: TStreamMsgCallback;

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
        llmUsage?: ICompletionUsage;
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
        error: undefined as string | undefined,
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
        extra: llmResponseWithToolCalls.extra,
        tool_calls: llmResponseWithToolCalls.tool_calls
    };
    state.toolChainMessages.push(initialAssistantMessage);
    state.allMessages.push(initialAssistantMessage);

    // 当前响应
    let currentResponse = llmResponseWithToolCalls;
    let stopDueToLimit = false;
    if (currentResponse.ok === false) {
        state.status = 'error';
        state.error = currentResponse.content || 'Initial model request failed';
    }

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
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                    };

                    state.toolChainMessages.push(toolResultMessage);
                    state.allMessages.push(toolResultMessage);
                    continue;
                }

                // 执行工具
                const startTime = Date.now();
                callbacks.onToolCallStart?.(toolCall.function.name, args, toolCall.id);

                callbacks.onLLMResponseUpdate(`[Executing tool]: ${toolCall.function.name}`);
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
                    callbacks.onLLMResponseUpdate(`[Executing Error]: ${toolCall.function.name}\n${toolResult.error}`);
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
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                    };

                    state.toolChainMessages.push(rejectionMessage);
                    state.allMessages.push(rejectionMessage);
                    callbacks.onLLMResponseUpdate(`[Executing Rejected]: ${toolCall.function.name}, reason=${toolResult.rejectReason}`);

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
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
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
                    option: options.chatOption,
                    toggles: options.toggles,
                });

                currentResponse = response;
                callbacks.onLLMResponseComplete?.(response);

                const llmResponseMessage: IMessage = {
                    role: 'assistant',
                    content: response.content,
                    reasoning_content: response.reasoning_content,
                    extra: response.extra,
                    tool_calls: response.tool_calls
                };

                state.toolChainMessages.push(llmResponseMessage);
                state.allMessages.push(llmResponseMessage);

                // 累积 token 使用量
                state.usage = sumReportedUsage(state.usage, response.usage);

                // 记录 LLM usage 到本轮工具调用
                if (response.usage && roundResults.length > 0) {
                    roundResults.forEach(entry => {
                        const historyIndex = state.toolCallHistory.findIndex(h => h.callId === entry.callId);
                        if (historyIndex !== -1) {
                            state.toolCallHistory[historyIndex].llmUsage = response.usage;
                        }
                    });
                }
                if (response.ok === false) {
                    state.status = 'error';
                    state.error = response.content || 'Model request failed';
                    break;
                }
            } catch (error) {
                state.status = 'error';
                state.error = error.message || String(error);
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
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
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
                    option: options.chatOption,
                    toggles: options.toggles,
                });

                currentResponse = followUpResponse;
                callbacks.onLLMResponseComplete?.(followUpResponse);

                const finalAssistant: IMessage = {
                    role: 'assistant',
                    content: followUpResponse.content,
                    reasoning_content: followUpResponse.reasoning_content,
                    extra: followUpResponse.extra,
                };
                state.toolChainMessages.push(finalAssistant);
                state.allMessages.push(finalAssistant);

                // 累积 token
                state.usage = sumReportedUsage(state.usage, followUpResponse.usage);
                if (followUpResponse.ok === false) {
                    state.status = 'error';
                    state.error = followUpResponse.content || 'Final model request failed';
                }
            } catch (error) {
                state.status = 'error';
                state.error = error.message || String(error);
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
        state.error = error.message || String(error);
        callbacks.onError?.(error, 'chain_execution');
    }

    // ========================================================================
    // 清理工具调用历史数据
    // ========================================================================
    const toolCallHistoryClean = state.toolCallHistory.map(call => {
        const { status, data, error, rejectReason } = call.result;
        const resultClean: ToolExecuteResult = {
            status,
            data: call.result.finalText ?? data,
            error,
            rejectReason
        };

        return {
            ...call,
            result: resultClean,
        };
    });

    // ========================================================================
    // 构建最终返回结果
    // ========================================================================

    const result: ToolChainResult = {
        responseContent: currentResponse.content || '',
        usage: state.usage,
        messages: {
            context: state.contextMessages,
            toolChain: state.toolChainMessages,
            complete: state.allMessages
        },
        toolCallHistory: toolCallHistoryClean,
        // @ts-ignore
        status: state.status === 'running' ? 'completed' : state.status,
        error: state.error,
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
