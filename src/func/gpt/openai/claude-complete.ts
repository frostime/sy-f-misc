import { appendLog } from '../MessageLogger';
import { adaptChatOptions, DEFAULT_THINKING_BUDGETS } from './adapter';
import { bindExtraSource, buildProtocolHeaders, CompleteOptions, getCompatibleExtra, messageContentToText, normalizeMessagesWithSystem, parseJsonSafe, toErrorResult } from './protocol-utils';
import { consumeClaudeStream, parseClaudeResponse } from './response-parse';

const pushClaudeMessage = (messages: IClaudeMessage[], role: IClaudeMessage['role'], blocks: ClaudeContentBlock[]) => {
    if (!blocks.length) return;
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
        last.content.push(...blocks);
    } else {
        messages.push({ role, content: blocks });
    }
};

const toClaudeMessages = (messages: IMessage[], runtime: IRuntimeLLM): IClaudeMessage[] => {
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
            // 同源 extra 必须原样回放原始 blocks（thinking / signature / tool_use 顺序不变），
            // 否则 Claude 会拒绝对应的工具续轮。
            const extra = getCompatibleExtra(msg, runtime);
            if (extra?.protocol === 'claude') {
                pushClaudeMessage(claudeMessages, 'assistant', structuredClone(extra.data.content));
                continue;
            }

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
        input_schema: structuredClone(tool.function.parameters || { type: 'object', properties: {} })
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
    /**
     *  Claude API 要求 max_tokens 必须存在，所以这里有个硬编码的 4096 兜底
     */
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
        'reasoning_effort',  // Claude 协议不识别，阻止透传
    ]);
    Object.entries(option || {}).forEach(([key, value]) => {
        if (knownKeys.has(key)) return;
        if (value === undefined || value === null || value === '') return;
        payload[key] = value;
    });

    // Claude thinking 参数注入
    const compat = model?.config?.options?.compat;
    if (compat?.thinking?.enabled) {
        const effort = option.reasoning_effort as ReasoningEffort | undefined;
        const claudeMode = compat.thinking.claudeMode ?? 'adaptive';
        const clearClaudeEffort = () => {
            if (!payload.output_config || typeof payload.output_config !== 'object') return;
            const { effort: _effort, ...rest } = payload.output_config;
            if (Object.keys(rest).length > 0) {
                payload.output_config = rest;
            } else {
                delete payload.output_config;
            }
        };

        if (effort && effort !== 'none') {
            const claudeEffort = compat.thinking.effortMap?.[effort]
                ?? (effort === 'minimal' ? 'low' : effort);

            if (claudeMode === 'manual-budget') {
                const budget = compat.thinking.budgetMap?.[effort] ?? DEFAULT_THINKING_BUDGETS[effort] ?? 8192;
                const betaHeader = Object.entries(model.provider?.customHeaders || {})
                    .find(([key]) => key.toLowerCase() === 'anthropic-beta')?.[1] || '';
                const interleavedThinking = betaHeader.split(',').some(value => value.trim() === 'interleaved-thinking-2025-05-14');
                if (!interleavedThinking && budget >= payload.max_tokens) {
                    throw new Error(`Claude thinking budget_tokens (${budget}) must be less than max_tokens (${payload.max_tokens}). Increase the output limit or lower the thinking budget.`);
                }
                payload.thinking = { type: 'enabled', budget_tokens: budget };
                clearClaudeEffort();
            } else {
                payload.output_config = {
                    ...(payload.output_config ?? {}),
                    effort: claudeEffort,
                };
                payload.thinking = { type: 'adaptive' };
            }

            // Claude thinking 开启时 temperature/top_p 不再发送
            delete payload.temperature;
            delete payload.top_p;
        } else {
            // 未启用 reasoning 时，省略 thinking/effort 字段，保留其他 output_config 配置
            delete payload.thinking;
            clearClaudeEffort();
        }
    }

    return payload;
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

        const chatOption = adaptChatOptions({
            chatOption: {
                ...options.option,
                ...(options.stream !== undefined ? { stream: options.stream } : {}),
            },
            runtimeLLM,
            toggles: options.toggles,
        });

        const targetModel = (chatOption as IChatCompleteOption & { model?: string }).model ?? runtimeLLM.model;
        const targetRuntime: IRuntimeLLM = targetModel === runtimeLLM.model
            ? runtimeLLM
            : { ...runtimeLLM, model: targetModel };

        const { messages, systemPrompt } = normalizeMessagesWithSystem(input, options);
        const claudeMessages = toClaudeMessages(messages, targetRuntime);
        const payload = buildClaudePayload(claudeMessages, systemPrompt, targetRuntime, chatOption);

        appendLog({ type: 'request', data: payload });

        const t0 = new Date().getTime();
        const response = await fetch(runtimeLLM.url, {
            method: 'POST',
            headers: buildProtocolHeaders('claude', targetRuntime, Boolean(chatOption.stream)),
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
            const result = await consumeClaudeStream(response, {
                streamMsg: options.streamMsg,
                abortController: options.abortController,
                onRawEvent: (data) => appendLog({ type: 'chunk', data }),
                t0,
            });
            if (result.ok !== false && result.extra) {
                result.extra = bindExtraSource(result.extra, targetRuntime);
            }
            return result;
        }

        const data = await response.json() as IClaudeResponse;
        appendLog({ type: 'response', data });
        const result = parseClaudeResponse(data);
        result.time = { latency: new Date().getTime() - t0 };
        if (result.ok !== false && result.extra) {
            result.extra = bindExtraSource(result.extra, targetRuntime);
        }
        return result;
    } catch (error) {
        return toErrorResult(error);
    }
};
