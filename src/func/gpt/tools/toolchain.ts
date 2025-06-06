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
 * 工具调用链配置选项
 */
export interface ToolChainOptions {
    // 上下文消息历史
    contextMessages: IMessage[];

    // 最大轮次（LLM-工具调用往返）
    maxRounds?: number;

    // 最大工具调用次数
    maxCalls?: number;

    // 中断控制器
    abortController?: AbortController;

    // 模型配置
    model?: IGPTModel;

    // 系统提示词
    systemPrompt?: string;

    // 聊天选项
    chatOption?: IChatOption;

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
        onLLMResponseComplete?: (response: CompletionResponse) => void;

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
    toolChainContent: string;

    usage: CompletionResponse['usage'];

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

/**
 * 执行工具调用链
 * @param llmResponseWithToolCalls 带有工具调用的 LLM 响应
 * @param options 工具调用链配置
 * @returns 工具调用链执行结果
 */
export async function executeToolChain(
    toolExecutor: ToolExecutor,
    llmResponseWithToolCalls: CompletionResponse,
    options: ToolChainOptions
): Promise<ToolChainResult> {

    // 初始化状态
    const state = {
        roundIndex: 0,
        callCount: 0,
        contextMessages: options.contextMessages || [],
        toolChainMessages: [],
        allMessages: [...(options.contextMessages || [])],
        toolCallHistory: [],
        startTime: Date.now(),
        status: 'running' as 'running' | 'completed' | 'aborted' | 'error' | 'timeout'
    };

    // 设置默认值
    const maxRounds = options.maxRounds ?? 5;
    const maxCalls = options.maxCalls ?? 10;
    const callbacks = options.callbacks || {};
    const checkToolResults = options.checkToolResults ?? false;

    // 添加初始响应
    const initialAssistantMessage = {
        role: 'assistant' as const,
        content: llmResponseWithToolCalls.content,
        reasoning_content: llmResponseWithToolCalls.reasoning_content,
        tool_calls: llmResponseWithToolCalls.tool_calls,
        usage: llmResponseWithToolCalls.usage
    };
    state.toolChainMessages.push(initialAssistantMessage);
    state.allMessages.push(initialAssistantMessage);

    // 当前响应
    let currentResponse = llmResponseWithToolCalls;

    try {
        // 工具调用轮次循环
        while (
            currentResponse.tool_calls?.length > 0 &&
            state.roundIndex < maxRounds &&
            state.callCount < maxCalls &&
            state.status === 'running'
        ) {
            // 增加轮次
            state.roundIndex++;

            // 本轮工具调用结果
            const roundResults = [];

            // 处理所有工具调用
            for (const toolCall of currentResponse.tool_calls) {
                // 检查是否达到最大调用次数
                if (state.callCount >= maxCalls) break;

                // 增加调用次数
                state.callCount++;

                // 解析参数
                let args;
                try {
                    args = JSON.parse(toolCall.function.arguments);
                } catch (error) {
                    console.warn(`Tool Call 调用参数无法正常解析: ${toolCall.function.arguments}`);
                    args = {};
                    callbacks.onError?.(error, 'parse_arguments');
                    const toolResultMessage = {
                        role: 'tool' as const,
                        content: JSON.stringify({ error: `Failed to parse arguments string as json: ${toolCall.function.arguments}` }),
                        tool_call_id: toolCall.id
                    };

                    // 添加工具结果消息
                    state.toolChainMessages.push(toolResultMessage);
                    state.allMessages.push(toolResultMessage);
                }

                // 记录开始时间
                const startTime = Date.now();

                // 通知工具调用开始
                callbacks.onToolCallStart?.(toolCall.function.name, args, toolCall.id);

                // 执行工具
                let toolResult: ToolExecuteResult;
                try {
                    // 执行工具（集成了执行前审批检查和结果审批检查）
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

                // 记录结束时间
                const endTime = Date.now();

                // 通知工具调用完成
                callbacks.onToolCallComplete?.(toolResult, toolCall.id);

                // 记录工具调用历史
                const historyEntry = {
                    callId: toolCall.id,
                    toolName: toolCall.function.name,
                    args,
                    result: toolResult,
                    startTime,
                    endTime,
                    roundIndex: state.roundIndex
                };

                // 如果结果被拒绝，更新历史记录
                if (toolResult.status === ToolExecuteStatus.RESULT_REJECTED) {
                    historyEntry['resultRejected'] = true;
                    historyEntry['resultRejectReason'] = toolResult.rejectReason;
                }

                state.toolCallHistory.push(historyEntry);
                roundResults.push(historyEntry);

                // 如果工具执行被拒绝或结果被拒绝，跳过后续处理
                if (toolResult.status === ToolExecuteStatus.EXECUTION_REJECTED ||
                    toolResult.status === ToolExecuteStatus.RESULT_REJECTED) {

                    // 添加拒绝消息
                    const rejectionMessage = {
                        role: 'tool' as const,
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
                const toolResultContent = JSON.stringify(
                    toolResult.status === ToolExecuteStatus.SUCCESS
                        ? toolResult.data
                        : { error: toolResult.error || 'Tool execution failed' }
                );

                // 创建工具结果消息
                const toolResultMessage = {
                    role: 'tool' as const,
                    content: toolResultContent,
                    tool_call_id: toolCall.id
                };

                // 添加工具结果消息
                state.toolChainMessages.push(toolResultMessage);
                state.allMessages.push(toolResultMessage);
            }

            // 检查中断
            if (options.abortController?.signal.aborted) {
                state.status = 'aborted';
                break;
            }

            // 准备发送给 LLM 的消息
            let messagesToSend = [...state.allMessages];

            // 允许修改发送给 LLM 的消息
            const modifiedMessages = callbacks.onBeforeSendToLLM?.(messagesToSend);
            if (modifiedMessages) {
                messagesToSend = modifiedMessages;
            }

            // 发送更新后的消息给 OpenAI
            try {
                const response = await complete(messagesToSend, {
                    model: options.model,
                    systemPrompt: options.systemPrompt,
                    stream: !!callbacks.onLLMResponseUpdate,
                    streamMsg: callbacks.onLLMResponseUpdate,
                    abortControler: options.abortController,
                    option: options.chatOption
                });

                // 更新当前响应
                currentResponse = response;

                // 通知 LLM 响应完成
                callbacks.onLLMResponseComplete?.(response);

                // 创建 LLM 响应消息
                const llmResponseMessage = {
                    role: 'assistant' as const,
                    content: response.content,
                    reasoning_content: response.reasoning_content,
                    tool_calls: response.tool_calls,
                    usage: response.usage
                };

                // 添加 LLM 响应到消息历史
                state.toolChainMessages.push(llmResponseMessage);
                state.allMessages.push(llmResponseMessage);
            } catch (error) {
                state.status = 'error';
                callbacks.onError?.(error, 'llm_response');
                break;
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

    let toolHistory = state.toolCallHistory.map(call => {
        return call.toolName + `(${call.result.status})`;
    }).join('->');
    let hint = toolHistory ? `<tool-trace>${toolHistory}</tool-trace>\n` : '';

    // 构建结果
    const result: ToolChainResult = {
        toolChainContent: hint,
        responseContent: currentResponse.content,
        usage: currentResponse.usage,
        messages: {
            context: state.contextMessages,
            toolChain: state.toolChainMessages,
            complete: state.allMessages
        },
        toolCallHistory: state.toolCallHistory,
        status: 'completed',
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
