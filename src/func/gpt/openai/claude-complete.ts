import { appendLog } from '../MessageLogger';
import { adaptChatOptions } from './adpater';
import { buildProtocolHeaders, CompleteOptions, messageContentToText, normalizeMessagesWithSystem, parseJsonSafe, toErrorResult, toOpenAIUsage } from './protocol-utils';

const pushClaudeMessage = (messages: IClaudeMessage[], role: IClaudeMessage['role'], blocks: ClaudeContentBlock[]) => {
    if (!blocks.length) return;
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
        last.content.push(...blocks);
    } else {
        messages.push({ role, content: blocks });
    }
};

const toClaudeMessages = (messages: IMessage[]): IClaudeMessage[] => {
    const claudeMessages: IClaudeMessage[] = [];
    // Claude `tool_result` only needs `tool_use_id`.

    for (const msg of messages) {
        if (msg.role === 'user') {
            const blocks: ClaudeContentBlock[] = [];
            const text = messageContentToText(msg.content);
            if (text.trim()) {
                blocks.push({ type: 'text', text });
            }
            if (Array.isArray(msg.content)) {
                msg.content.forEach((part) => {
                    if (part?.type !== 'image_url') return;
                    const url = part.image_url?.url || '';
                    const matched = url.match(/^data:(.*?);base64,(.*)$/);
                    if (!matched) return;
                    const mediaType = matched[1] || 'image/png';
                    const data = matched[2] || '';
                    if (!data) return;
                    blocks.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data,
                        }
                    } as any);
                });
            }
            pushClaudeMessage(claudeMessages, 'user', blocks);
            continue;
        }

        if (msg.role === 'assistant') {
            const blocks: ClaudeContentBlock[] = [];
            const text = messageContentToText(msg.content);
            if (text.trim()) {
                blocks.push({ type: 'text', text });
            }
            if (Array.isArray(msg.tool_calls)) {
                msg.tool_calls.forEach((toolCall) => {
                    const args = parseJsonSafe<Record<string, any>>(toolCall.function.arguments || '{}', {});
                    blocks.push({
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        input: args,
                    });
                });
            }
            pushClaudeMessage(claudeMessages, 'assistant', blocks);
            continue;
        }

        if (msg.role === 'tool') {
            const raw = typeof msg.content === 'string' ? msg.content : messageContentToText(msg.content);
            const parsed = parseJsonSafe(raw, null);
            const blocks: ClaudeContentBlock[] = [{
                type: 'tool_result',
                tool_use_id: msg.tool_call_id,
                content: raw,
                is_error: Boolean(parsed?.error),
            } as any];
            pushClaudeMessage(claudeMessages, 'user', blocks);
        }
    }

    return claudeMessages;
};

const toClaudeTools = (tools?: IToolDefinition[]): IClaudeTool[] | undefined => {
    if (!Array.isArray(tools) || tools.length === 0) return undefined;
    return tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: {
            type: 'object',
            properties: tool.function.parameters?.properties || {},
            required: tool.function.parameters?.required,
            additionalProperties: tool.function.parameters?.additionalProperties,
        }
    }));
};

const toClaudeToolChoice = (toolChoice?: IToolChoice) => {
    if (!toolChoice || toolChoice === 'auto') {
        return { type: 'auto' };
    }
    if (toolChoice === 'none') {
        return { type: 'none' };
    }
    if (toolChoice === 'required') {
        return { type: 'any' };
    }
    if (typeof toolChoice === 'object' && toolChoice.function?.name) {
        return { type: 'tool', name: toolChoice.function.name };
    }
    return { type: 'auto' };
};

const buildClaudePayload = (
    messages: IClaudeMessage[],
    systemPrompt: string,
    model: IRuntimeLLM,
    option: IChatCompleteOption,
): Record<string, any> => {
    const tools = toClaudeTools(option.tools);
    const payload: Record<string, any> = {
        model: model.model,
        messages,
        stream: Boolean(option.stream),
        max_tokens: option.max_completion_tokens || option.max_tokens || model.config?.limits?.maxOutput || 4096,
    };

    if (systemPrompt) payload.system = systemPrompt;
    if (option.temperature !== undefined) payload.temperature = option.temperature;
    if (option.top_p !== undefined) payload.top_p = option.top_p;
    if (option.stop !== undefined) payload.stop_sequences = Array.isArray(option.stop) ? option.stop : [option.stop];
    if (tools?.length) {
        payload.tools = tools;
        payload.tool_choice = toClaudeToolChoice(option.tool_choice);
    }

    // 保留用户自定义扩展字段
    const knownKeys = new Set([
        'tools', 'tool_choice', 'temperature', 'top_p', 'stop', 'stream',
        'stream_options', 'max_completion_tokens', 'max_tokens',
    ]);
    Object.entries(option || {}).forEach(([key, value]) => {
        if (knownKeys.has(key)) return;
        if (value === undefined || value === null || value === '') return;
        payload[key] = value;
    });

    return payload;
};

const parseClaudeMessage = (message: IClaudeResponse): ICompletionResult => {
    const contentBlocks = message?.content || [];
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const tool_calls: IToolCall[] = [];

    contentBlocks.forEach((block: any, index: number) => {
        if (block.type === 'text') {
            textParts.push(block.text || '');
            return;
        }
        if (block.type === 'thinking') {
            thinkingParts.push(block.thinking || '');
            return;
        }
        if (block.type === 'tool_use') {
            tool_calls.push({
                id: block.id || `claude_call_${index}`,
                type: 'function',
                function: {
                    name: block.name || 'tool',
                    arguments: JSON.stringify(block.input || {}),
                },
            });
        }
    });

    const usage = toOpenAIUsage({
        prompt_tokens: message?.usage?.input_tokens,
        completion_tokens: message?.usage?.output_tokens,
        total_tokens: (message?.usage?.input_tokens || 0) + (message?.usage?.output_tokens || 0),
    });

    return {
        ok: true,
        content: textParts.join(''),
        usage,
        tool_calls,
        reasoning_content: thinkingParts.length > 0 ? thinkingParts.join('') : undefined,
        providerMeta: {
            stop_reason: message?.stop_reason,
        }
    };
};

const parseClaudeStream = async (response: Response, options: CompleteOptions): Promise<ICompletionResult> => {
    if (!response.body) {
        return {
            ok: false,
            content: '[Error] Claude stream response body is null',
            usage: null,
        };
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    let content = '';
    let thinking = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = '';
    const toolCallsById = new Map<string, IToolCall>();
    const toolIndexToId = new Map<number, string>();
    const thinkingIndexes = new Set<number>();  // indexes of 'thinking' content blocks

    const parseEventBlock = (eventBlock: string) => {
        // Claude stream uses SSE-like framing: each event contains one JSON payload in `data:` lines.
        const lines = eventBlock.split('\n');
        const dataLines = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .filter(Boolean);
        if (!dataLines.length) return;

        const rawData = dataLines.join('\n');
        if (rawData === '[DONE]') return;

        const payload = parseJsonSafe<any>(rawData, null);
        if (!payload) return;
        appendLog({ type: 'chunk', data: payload });

        if (payload.type === 'message_start') {
            inputTokens = payload.message?.usage?.input_tokens || 0;
            outputTokens = payload.message?.usage?.output_tokens || 0;
            return;
        }

        if (payload.type === 'message_delta') {
            stopReason = payload.delta?.stop_reason || stopReason;
            outputTokens = payload.usage?.output_tokens || outputTokens;
            return;
        }

        if (payload.type === 'content_block_start') {
            const idx = payload.index;
            const block = payload.content_block;
            if (block?.type === 'thinking') {
                thinkingIndexes.add(idx);
            }
            if (block?.type === 'tool_use') {
                const id = block.id || `claude_call_${idx}`;
                toolIndexToId.set(idx, id);
                toolCallsById.set(id, {
                    id,
                    index: idx,
                    type: 'function',
                    function: {
                        name: block.name || 'tool',
                        // Fix C: initialize to '' (not JSON.stringify({})), so delta appends work correctly
                        arguments: Object.keys(block.input || {}).length > 0 ? JSON.stringify(block.input) : '',
                    }
                });
            }
            return;
        }

        if (payload.type === 'content_block_delta') {
            const delta = payload.delta || {};
            if (delta.type === 'text_delta') {
                content += delta.text || '';
                options.streamMsg?.(content);
                return;
            }
            if (delta.type === 'thinking_delta') {
                thinking += delta.thinking || '';
                return;
            }
            if (delta.type === 'input_json_delta') {
                const id = toolIndexToId.get(payload.index);
                if (!id) return;
                const toolCall = toolCallsById.get(id);
                if (!toolCall) return;
                // Fix C: unconditional append — no special-casing of '{}' or 'null'
                toolCall.function.arguments += (delta.partial_json || '');
            }
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (options.abortController?.signal?.aborted) {
            await reader.cancel();
            return {
                ok: false,
                content: `${content}\n[Error] Request aborted`,
                usage: null,
            };
        }

        buffer += value;
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        events.forEach(parseEventBlock);
    }

    if (buffer.trim()) {
        parseEventBlock(buffer);
    }

    const usage = toOpenAIUsage({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
    });

    return {
        ok: true,
        content,
        usage,
        tool_calls: Array.from(toolCallsById.values()),
        reasoning_content: thinking || undefined,
        providerMeta: {
            stop_reason: stopReason,
        }
    };
};

export const claudeComplete = async (
    input: string | IMessage[],
    options: CompleteOptions
): Promise<ICompletionResult> => {
    try {
        const runtimeLLM = options.model;
        if (!runtimeLLM) {
            return {
                ok: false,
                content: '[Error] Claude complete 缺少模型配置',
                usage: null,
            };
        }
        if (runtimeLLM.type !== 'chat') {
            return {
                ok: false,
                content: `[Error] Claude 协议当前仅支持 complete(chat)，当前 type=${runtimeLLM.type}`,
                usage: null,
            };
        }

        const { messages, systemPrompt } = normalizeMessagesWithSystem(input, options);
        const chatOption = adaptChatOptions({
            chatOption: options.option || {},
            runtimeLLM,
        });
        if (options.stream !== undefined) {
            chatOption.stream = options.stream;
        }

        const claudeMessages = toClaudeMessages(messages);
        const payload = buildClaudePayload(claudeMessages, systemPrompt, runtimeLLM, chatOption);

        appendLog({ type: 'request', data: payload });

        const response = await fetch(runtimeLLM.url, {
            method: 'POST',
            headers: buildProtocolHeaders('claude', runtimeLLM, Boolean(chatOption.stream)),
            body: JSON.stringify(payload),
            signal: options.abortController?.signal,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            appendLog({ type: 'response', data: text });
            return {
                ok: false,
                content: `[Error] Claude API error: ${response.status} ${response.statusText}\n${text}`,
                usage: null,
            };
        }

        if (chatOption.stream) {
            return parseClaudeStream(response, options);
        }

        const data = await response.json() as IClaudeResponse;
        appendLog({ type: 'response', data });
        return parseClaudeMessage(data);
    } catch (error) {
        return toErrorResult(error);
    }
};
