/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 01:45:14
 * @FilePath     : /src/func/gpt/tools/toolchain.ts
 * @Description  : 工具调用链执行器
 */
import { complete } from '../openai/complete';
import { ToolExecuteStatus, ToolExecuteResult, ToolExecutor } from '.';


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
    const maxRounds = options.maxRounds ?? 10;
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
    let stopDueToLimit = false;

    try {
        // 工具调用轮次循环
        while (
            currentResponse.tool_calls?.length > 0 &&
            state.roundIndex < maxRounds &&
            state.status === 'running'
        ) {
            // 增加轮次
            state.roundIndex++;

            // 本轮工具调用结果
            const roundResults = [];

            // 处理所有工具调用
            for (const toolCall of currentResponse.tool_calls) {
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

                // 将 LLM usage 附加到本轮的工具调用历史中
                if (response.usage && roundResults.length > 0) {
                    // 将 usage 平均分配给本轮的所有工具调用
                    // 或者只记录在第一个工具调用上
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

        // 检查是否需要生成最终回复
        // 情况1: 因限制而中止（还有未执行的 tool_calls）
        // 情况2: 工具调用完成但 LLM 没有给出文字回复
        stopDueToLimit = state.status === 'running' && (
            currentResponse.tool_calls?.length > 0 ||  // 还有未执行的工具调用
            isEmptyResponse(currentResponse.content)    // 或者没有文字回复
        );

        if (stopDueToLimit) {
            console.debug('Requesting final response from LLM', {
                hasUnexecutedToolCalls: currentResponse.tool_calls?.length > 0,
                isContentEmpty: isEmptyResponse(currentResponse.content),
                reason: state.roundIndex >= maxRounds ? 'max_rounds_reached' : 'empty_response'
            });
            console.debug(currentResponse);

            // 处理未完成的工具调用（添加占位符以保持消息序列完整性）
            if (currentResponse.tool_calls?.length > 0) {
                for (const toolCall of currentResponse.tool_calls) {
                    const placeholderMessage = {
                        role: 'tool' as const,
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

            // 构建适当的提示消息
            let promptContent: string;
            if (currentResponse.tool_calls?.length > 0) {
                // 因限制而中止的情况
                promptContent = `[SYSTEM] Tool chain execution stopped: reached maximum rounds (${maxRounds}).

Based on the information gathered so far, please provide a response to the user that:
1. Acknowledges any incomplete investigations due to the limit
2. Summarizes what HAS been accomplished/discovered
3. Provides useful insights based on available information
4. If appropriate, suggests what additional information could not be gathered

Provide a complete, helpful response even if some planned tool calls could not be executed.

NOTE: Since the tool integration is not yet complete, your response will inevitably be incomplete. Please acknowledge this limitation instead of pretending everything is working normally.
`;
            } else {
                // 只是没有文字回复的情况
                promptContent = '[SYSTEM] Tool calls completed. Please provide a final response to the user based on the tool results.';
            }

            const followUpMessage = {
                role: 'user' as const,
                content: promptContent
            };

            state.allMessages.push(followUpMessage);

            try {
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
                    // 不保留新的 tool_calls（避免再次触发工具调用）
                    usage: followUpResponse.usage
                };

                state.toolChainMessages.push(finalAssistantMessage);
                state.allMessages.push(finalAssistantMessage);

                // 累积 token 使用量
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
                // 即使失败也继续，使用现有的响应
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

    // ---------- 生成工具调用总结 ----------
    // 只在工具调用足够复杂时生成总结（避免简单调用的额外开销）
    let summaryContent = '';
    const shouldGenerateSummary =
        state.toolCallHistory.length >= 3 || state.roundIndex >= 3;

    if (shouldGenerateSummary) {
        try {
            // 检测是否有失败的工具调用
            // const hasFailures = state.toolCallHistory.some(
            //     call => call.result.status !== ToolExecuteStatus.SUCCESS
            // );

            // 根据成功/失败情况使用不同的 prompt
            let prompt = `[system] 工具调用链完成。请生成**工具使用经验总结**（关注工具调用应用在任务上）；可以关注这些：

-  **总结**：设计调用逻辑是怎么涉及的
-  **工具失败经验**: 哪些数据源/网站/参数设置无效或有问题？（如"知乎反爬严重，web_search无法获取内容"）
-  **调用策略**: 什么样的工具组合或调用顺序更高效？（如"先list_notes确认ID，再get_note获取内容"）
-  **参数技巧**: 哪些参数设置影响结果质量？（如"web_search关键词需要中英混合"）
-  **失败模式**: 工具返回错误或空结果的典型原因？（如"tavily检索失败可能是关键词过于具体"）
-  **有用的技巧**: 本次发现了什么操作，下次可直接学习，避免绕弯路
- etc. (注：请根据实际调用情况调整，不必须也不局限于示例)

要求：
- 聚焦工具调用技术细节，不要总结对话内容(对话里已经体现的冗余信息不用重复生成)
- 记录可复用的操作经验（下次遇到类似工具使用场景时有用）
- 如果工具调用非常顺利无特殊经验，简短说明即可; 不生成无用的废话
- 不要重复列举工具调用序列顺序（系统会做 trace），聚焦于可复用的经验
- 不用重复记录之前已经记录过的经验信息
- 生成的经验通常 500 字内，最多700字；高信息密度信噪比 !IMPORTANT!

示例：
✅ "WebPage获取遇到知乎链接时建议跳过（反爬严重）；XX 目录下的 README 前 200 行都是废话，可以跳过不看" -> 对Assistant调用工具的建议
❌ "经过调研后发现原型学习天然适合few-shot学习和跨域问题" -> 对User有用，但是对调用工具没用`;

            // 如果因限制而中止，添加额外的提示要求总结未完成的调研
            if (stopDueToLimit) {
                prompt += `

[IMPORTANT] 本次工具调用链因达到最大轮次限制 (${maxRounds}) 而提前终止，**调研未完全完成**。
除了上述经验总结外，还需要额外生成：

**未完成调研说明**：
- 简要说明哪些调研/信息获取未能完成（基于最后未执行的 tool_calls 推断）
- 如果用户需要更完整的信息，后续应该从哪里继续调研
- 建议的下一步工具调用策略（如调整参数、换用其他工具等）

格式示例：
"""
## 工具使用经验
[正常的经验总结]

## 调研状态
⚠️ 因达到限制而提前终止。已完成 X 项调研，未完成：[具体说明]
建议后续：[具体建议]
"""`;
            }

            // 清理消息：移除可能导致 API 错误的字段
            const cleanedMessages = state.allMessages.map(msg => {
                const cleaned = { ...msg };
                // 移除空的 tool_calls 数组（OpenAI API 不接受空数组）
                if (cleaned.tool_calls && Array.isArray(cleaned.tool_calls) && cleaned.tool_calls.length === 0) {
                    delete cleaned.tool_calls;
                }
                // 移除 usage 字段（不是标准的 message 字段）
                if ('usage' in cleaned) {
                    delete cleaned.usage;
                }
                return cleaned;
            });

            const payload = [...cleanedMessages, {
                role: 'user' as const,
                content: prompt
            }];

            const summaryResponse = await complete(payload, {
                model: options.model,
                systemPrompt: options.systemPrompt,
                stream: false,
                option: options.chatOption
            });

            summaryContent = summaryResponse.content;

            // 累积总结生成的 token 统计
            if (summaryResponse.usage) {
                if (!state.usage) {
                    state.usage = { ...summaryResponse.usage };
                } else {
                    state.usage.prompt_tokens += summaryResponse.usage.prompt_tokens || 0;
                    state.usage.completion_tokens += summaryResponse.usage.completion_tokens || 0;
                    state.usage.total_tokens += summaryResponse.usage.total_tokens || 0;
                }
            }
        } catch (error) {
            console.warn('Failed to generate tool chain summary:', error);
            // 降级方案：使用简单的描述
            summaryContent = `工具调用链完成：${state.toolCallHistory.length} 次调用，${state.roundIndex} 轮对话`;
        }
    }

    // ---------- 构建 toolcall-history-log ----------
    let toolHistory = state.toolCallHistory.map(call => {
        return createToolSummary(call, toolExecutor);
    }).join(' -> ');

    // 添加状态信息（如果是不正常结束）
    let statusInfo = '';
    if (stopDueToLimit) {
        statusInfo = `\n\nStatus: INCOMPLETE - stopped due to max_rounds(${maxRounds})`;
    }

    let hint = '';
    if (toolHistory) {
        if (summaryContent) {
            // 有总结时，提供结构化的信息
            hint = `<toolcall-history-log>
Summary:
${summaryContent}

Trace:
${toolHistory}${statusInfo}

</toolcall-history-log>
[system warn]: <toolcall-history-log> 标签内的信息为系统自动生成的工具调用记录，仅供 Assistant 查看，对 User 隐藏。Assistant 不得提及、模仿生成或伪造此类信息！!!IMPORTANT!!

以下是给User的回答:
---
`;
        } else {
            // 简单调用，只提供 trace
            hint = `<toolcall-history-log>
${toolHistory}${statusInfo}
</toolcall-history-log>
[system warn]: <toolcall-history-log> 标签内的信息为系统自动生成的工具调用记录，仅供 Assistant 查看，对 User 隐藏。Assistant 不得提及、模仿生成或伪造此类信息！!!IMPORTANT!!

以下是给User的回答:
---
`;
        }
    }

    // 构建结果
    const result: ToolChainResult = {
        toolChainContent: hint,
        responseContent: currentResponse.content,
        usage: state.usage, // 使用累积的 token 统计
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
