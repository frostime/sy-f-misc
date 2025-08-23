/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 01:45:14
 * @FilePath     : /src/func/gpt/tools/toolchain.ts
 * @Description  : 工具调用链执行器
 */
import { complete } from '../openai/complete';
import { ToolExecuteStatus, ToolExecuteResult, ToolExecutor } from '.';
import { adaptIMessageContentAppender } from '../data-utils';


namespace DataCompressor {

    export namespace Text {
        export function truncate(text: string, maxLength: number = 50): string {
            if (!text || text.length <= maxLength) return text;
            return text.substring(0, maxLength) + '...[trunc]';
        }

        export function truncateMiddle(text: string, maxLength: number = 50): string {
            if (!text || text.length <= maxLength) return text;
            const prefixLength = Math.floor(maxLength / 2);
            const suffixLength = maxLength - prefixLength;
            return text.substring(0, prefixLength) + '...[trunc]...' + text.substring(text.length - suffixLength);
        }

        export function truncateStart(text: string, maxLength: number = 50): string {
            if (!text || text.length <= maxLength) return text;
            return '...[trunc]' + text.substring(text.length - maxLength);
        }
    }


    export function compressArgs(args: Record<string, any>): string {
        if (!args || typeof args !== 'object') {
            return '';
        }

        const keys = Object.keys(args);
        if (keys.length === 0) return '';

        return keys.map(k => {
            const value = args[k];
            if (typeof value === 'string') {
                return `${k}="${Text.truncate(value, 50)}"`;
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                return `${k}=${value}`;
            } else if (Array.isArray(value)) {
                return `${k}[${value.length}]`;
            } else {
                return `${k}=${typeof value}`;
            }
        }).join(', ');
    }

    export function compressResult(result: ToolExecuteResult): string {

        if (!result.data) return '';

        // 如果结果很短，直接返回
        const dataStr = JSON.stringify(result.data);
        if (dataStr.length <= 50) {
            return dataStr;
        }

        // 智能压缩：根据数据结构特征进行针对性处理
        return compressDataByType(result.data);
    }

    function compressDataByType(data: any): string {
        // 处理数组类型
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return 'Empty Array';
            }
            const firstElem = data[0];
            if (typeof firstElem === 'object') {
                return `Array[${data.length}]: Object{${Object.keys(firstElem).join(',')}}`;
            } else {
                return `Array[${data.length}]: ${typeof firstElem}`;
            }
        }

        // 处理字符串类型
        if (typeof data === 'string') {
            const preview = Text.truncate(data, 40);
            return `String[${data.length}]: ${preview}`;
        }

        // 处理对象类型
        if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            return `Object{${keys.join(',')}}`;
        }

        return `${typeof data}`;
    }
}


const isEmptyResponse = (content: string): boolean => {
    return !content || content.trim().length === 0;
};

/**
 * 创建工具调用的智能摘要
 * @param call 工具调用历史项
 * @param toolExecutor 工具执行器，用于获取工具定义
 * @returns 压缩后的摘要字符串
 */
const createToolSummary = (call: ToolChainResult['toolCallHistory'][number], toolExecutor: ToolExecutor): string => {
    const { toolName, args, result } = call;
    const status = result.status === ToolExecuteStatus.SUCCESS ? 'OK' :
        result.status === ToolExecuteStatus.ERROR ? 'ERR' : 'REJ';

    const tool = toolExecutor.getTool(toolName);

    const compressedArgs = tool?.compressArgs ?
        tool.compressArgs(args) :
        DataCompressor.compressArgs(args);

    let resultPart = '';
    if (result.status !== ToolExecuteStatus.SUCCESS) {
        if (result.error) {
            resultPart = `e="${DataCompressor.Text.truncate(result.error)}"`;
        }
        if (result.rejectReason) {
            resultPart = `rejected="${DataCompressor.Text.truncate(result.rejectReason)}"`;
        }
    } else {
        const compressedResult = tool?.compressResult ?
        tool.compressResult(result) :
        DataCompressor.compressResult(result);
        resultPart = `r=${compressedResult}`
    }

    return `${toolName}(${compressedArgs}, s=${status}, ${resultPart})`;
};



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
        status: 'running' as 'running' | 'completed' | 'aborted' | 'error' | 'timeout',
        usage: llmResponseWithToolCalls.usage // 添加 usage 属性以跟踪令牌使用情况
    };

    // 设置默认值
    const maxRounds = options.maxRounds ?? 7;
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

            // 检查是否接近限制，在最后一个 tool 消息中添加警告
            const roundsLeft = maxRounds - state.roundIndex;
            const callsLeft = maxCalls - state.callCount;
            const isNearLimit = roundsLeft <= 1 || callsLeft <= 2;

            if (isNearLimit && messagesToSend.length > 0) {
                // 找到最后一个 tool 消息并添加警告信息
                for (let i = messagesToSend.length - 1; i >= 0; i--) {
                    if (messagesToSend[i].role === 'tool') {
                        const warningText = `\n\n[SYSTEM WARNING] Tool chain approaching limits. Rounds left: ${roundsLeft}, Calls left: ${callsLeft}. Please wrap up and provide final response in next turn.`;

                        messagesToSend[i] = {
                            ...messagesToSend[i],
                            content: adaptIMessageContentAppender(messagesToSend[i].content, warningText)
                        };
                        break;
                    }
                }
            }

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

        // 处理未完成的工具调用（防止消息序列不完整）
        if (state.status === 'running' && currentResponse.tool_calls?.length > 0) {
            console.debug('Adding placeholder responses for incomplete tool calls to maintain message sequence integrity');

            // 为所有未响应的 tool_calls 添加占位符响应
            for (const toolCall of currentResponse.tool_calls) {
                const placeholderMessage = {
                    role: 'tool' as const,
                    content: JSON.stringify({
                        status: 'incomplete',
                        message: 'Tool chain execution stopped due to limits (maxRounds or maxCalls reached)',
                        reason: state.roundIndex >= maxRounds ? 'max_rounds_reached' : 'max_calls_reached'
                    }),
                    tool_call_id: toolCall.id
                };

                state.toolChainMessages.push(placeholderMessage);
                state.allMessages.push(placeholderMessage);
            }
        }

        // 设置完成状态
        if (state.status === 'running') {
            state.status = 'completed';

            // 检查最终响应是否为空，如果为空则请求后续响应
            if (isEmptyResponse(currentResponse.content)) {
                console.debug('Final LLM response is empty, requesting follow-up');

                // 创建后续请求消息
                const followUpMessage = {
                    role: 'user' as const,
                    content: '[system warn]: Tool call procedure completed. Now please review and provider final response to meat the USER\'s requirement.'
                };

                state.allMessages.push(followUpMessage);

                const followUpResponse = await complete(state.allMessages, {
                    model: options.model,
                    systemPrompt: options.systemPrompt,
                    stream: !!callbacks.onLLMResponseUpdate,
                    streamMsg: callbacks.onLLMResponseUpdate,
                    abortControler: options.abortController,
                    option: options.chatOption
                });

                currentResponse = followUpResponse;

                callbacks.onLLMResponseComplete?.(followUpResponse);

                const finalAssistantMessage = {
                    role: 'assistant' as const,
                    content: followUpResponse.content,
                    reasoning_content: followUpResponse.reasoning_content,
                    tool_calls: followUpResponse.tool_calls,
                    usage: followUpResponse.usage
                };

                // 添加后续响应到消息历史
                state.toolChainMessages.push(finalAssistantMessage);
                state.allMessages.push(finalAssistantMessage);

                // 如果 follow-up response 包含 tool_calls，添加占位符响应以保持消息序列完整性
                if (followUpResponse.tool_calls?.length > 0) {
                    delete finalAssistantMessage.tool_calls;
                }
            }
        }
    } catch (error) {
        state.status = 'error';
        callbacks.onError?.(error, 'chain_execution');
    }

    let toolHistory = state.toolCallHistory.map(call => {
        return createToolSummary(call, toolExecutor);
    }).join(' -> ');
    let hint = toolHistory ? `<tool-trace>\n${toolHistory}\n</tool-trace>\n` : '';

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
