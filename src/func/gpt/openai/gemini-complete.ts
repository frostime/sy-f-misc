import { appendLog } from '../MessageLogger';
import { adaptChatOptions, DEFAULT_THINKING_BUDGETS } from './adapter';
import {
    applyGeminiModelPlaceholder,
    buildProtocolHeaders,
    CompleteOptions,
    ensureGeminiEndpointByStream,
    messageContentToText,
    normalizeMessagesWithSystem,
    parseJsonSafe,
    toErrorResult,
} from './protocol-utils';
import { consumeGeminiStream, parseGeminiResponse } from './response-parse';

const pushGeminiContent = (contents: IGeminiContent[], role: IGeminiContent['role'], parts: IGeminiPart[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
        last.parts.push(...parts);
    } else {
        contents.push({ role, parts });
    }
};

const toGeminiContents = (messages: IMessage[]): IGeminiContent[] => {
    const contents: IGeminiContent[] = [];

    // Gemini requires `functionResponse.name`. Tool messages carry `name` (set by toolchain.ts).
    // The map below is kept as a backward-compat fallback for any tool messages without `name`.
    const toolCallIdToName = new Map<string, string>();

    for (const msg of messages) {
        if (msg.role === 'user') {
            const parts: IGeminiPart[] = [];
            const text = messageContentToText(msg.content);
            if (text.trim()) {
                parts.push({ text });
            }
            // Multimodal: convert image_url (data URL only) to Gemini inlineData
            if (Array.isArray(msg.content)) {
                msg.content.forEach((part) => {
                    if (part?.type !== 'image_url') return;
                    const url = part.image_url?.url || '';
                    const matched = url.match(/^data:(.*?);base64,(.*)$/);
                    if (!matched) {
                        console.warn('[Gemini] Remote image URLs are not supported for inline data, skipping. Convert to base64 data URL first.');
                        return;
                    }
                    parts.push({
                        inlineData: {
                            mimeType: matched[1] || 'image/png',
                            data: matched[2] || '',
                        }
                    } as IGeminiPartInlineData);
                });
            }
            if (parts.length > 0) {
                pushGeminiContent(contents, 'user', parts);
            }
            continue;
        }

        if (msg.role === 'assistant') {
            const parts: IGeminiPart[] = [];
            const text = messageContentToText(msg.content);
            if (text.trim()) {
                parts.push({ text });
            }

            if (Array.isArray(msg.tool_calls)) {
                msg.tool_calls.forEach((toolCall) => {
                    const args = parseJsonSafe<Record<string, any>>(toolCall.function.arguments || '{}', {});
                    toolCallIdToName.set(toolCall.id, toolCall.function.name);
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args,
                        }
                    });
                });
            }
            pushGeminiContent(contents, 'model', parts);
            continue;
        }

        if (msg.role === 'tool') {
            // Use msg.name (set by toolchain.ts) as the primary source; fall back to map reconstruction.
            const name = (msg as IMessage & { name?: string }).name
                || toolCallIdToName.get(msg.tool_call_id || '')
                || 'tool';
            const raw = typeof msg.content === 'string' ? msg.content : messageContentToText(msg.content);
            const parsed = parseJsonSafe<Record<string, any>>(raw, { content: raw });
            pushGeminiContent(contents, 'user', [{
                functionResponse: {
                    name,
                    response: parsed,
                }
            }]);
        }
    }

    return contents;
};

const toGeminiTools = (tools?: IToolDefinition[]) => {
    if (!Array.isArray(tools) || tools.length === 0) return undefined;
    return [{
        functionDeclarations: tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: {
                type: 'object',
                properties: tool.function.parameters?.properties || {},
                required: tool.function.parameters?.required || [],
            }
        }))
    }];
};

const toGeminiToolConfig = (toolChoice?: IToolChoice) => {
    if (!toolChoice || toolChoice === 'auto') {
        return { functionCallingConfig: { mode: 'AUTO' } };
    }
    if (toolChoice === 'none') {
        return { functionCallingConfig: { mode: 'NONE' } };
    }
    if (toolChoice === 'required') {
        return { functionCallingConfig: { mode: 'ANY' } };
    }
    if (typeof toolChoice === 'object' && toolChoice.function?.name) {
        return {
            functionCallingConfig: {
                mode: 'ANY',
                allowedFunctionNames: [toolChoice.function.name],
            }
        };
    }
    return { functionCallingConfig: { mode: 'AUTO' } };
};

const buildGeminiPayload = (
    contents: IGeminiContent[],
    systemPrompt: string,
    option: IChatCompleteOption,
    runtimeLLM?: IRuntimeLLM,
): Record<string, any> => {
    const payload: Record<string, any> = {
        contents,
    };

    if (systemPrompt.trim()) {
        payload.systemInstruction = {
            parts: [{ text: systemPrompt }]
        };
    }

    const generationConfig: Record<string, any> = {};
    if (option.temperature !== undefined) generationConfig.temperature = option.temperature;
    if (option.top_p !== undefined) generationConfig.topP = option.top_p;
    if (option.max_completion_tokens !== undefined) generationConfig.maxOutputTokens = option.max_completion_tokens;
    if (option.max_tokens !== undefined && generationConfig.maxOutputTokens === undefined) generationConfig.maxOutputTokens = option.max_tokens;
    if (option.stop !== undefined) generationConfig.stopSequences = Array.isArray(option.stop) ? option.stop : [option.stop];
    if (Object.keys(generationConfig).length > 0) {
        payload.generationConfig = generationConfig;
    }

    const tools = toGeminiTools(option.tools);
    if (tools?.length) {
        payload.tools = tools;
        payload.toolConfig = toGeminiToolConfig(option.tool_choice);
    }

    // 保留用户自定义扩展字段
    const knownKeys = new Set([
        'tools', 'tool_choice', 'temperature', 'top_p', 'stop',
        'stream', 'stream_options', 'max_completion_tokens', 'max_tokens',
        'reasoning_effort',  // Gemini 协议不识别，阻止透传
    ]);
    Object.entries(option || {}).forEach(([key, value]) => {
        if (knownKeys.has(key)) return;
        if (value === undefined || value === null || value === '') return;
        payload[key] = value;
    });

    // Gemini thinking 参数注入
    const compat = runtimeLLM?.config?.options?.compat;
    if (compat?.thinking?.enabled) {
        const effort = option.reasoning_effort as ReasoningEffort | undefined;
        const budget = effort === 'none'
            ? 0
            : (compat.thinking.budgetMap?.[effort] ?? DEFAULT_THINKING_BUDGETS[effort] ?? 8192);
        if (effort) {
            payload.generationConfig = {
                ...payload.generationConfig,
                thinkingConfig: { thinkingBudget: budget },
            };
        }
    }

    return payload;
};

export const geminiComplete = async (
    input: string | IMessage[],
    options: CompleteOptions
): Promise<ICompletionResult> => {
    try {
        const runtimeLLM = options.model;
        if (!runtimeLLM) {
            return {
                ok: false,
                content: '[Error] Gemini complete 缺少模型配置',
                usage: null,
            };
        }
        if (runtimeLLM.type !== 'chat') {
            return {
                ok: false,
                content: `[Error] Gemini 协议当前仅支持 complete(chat)，当前 type=${runtimeLLM.type}`,
                usage: null,
            };
        }

        const { messages, systemPrompt } = normalizeMessagesWithSystem(input, options);
        const chatOption = adaptChatOptions({
            chatOption: options.option || {},
            runtimeLLM,
            toggles: options.toggles,
        });
        if (options.stream !== undefined) {
            chatOption.stream = options.stream;
        }

        const contents = toGeminiContents(messages);
        const payload = buildGeminiPayload(contents, systemPrompt, chatOption, runtimeLLM);
        let url = applyGeminiModelPlaceholder(runtimeLLM.url, runtimeLLM.model);
        url = ensureGeminiEndpointByStream(url, Boolean(chatOption.stream));

        appendLog({ type: 'request', data: { url, payload } });

        const t0 = new Date().getTime();
        const response = await fetch(url, {
            method: 'POST',
            headers: buildProtocolHeaders('gemini', runtimeLLM, Boolean(chatOption.stream)),
            body: JSON.stringify(payload),
            signal: options.abortController?.signal,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            appendLog({ type: 'response', data: text });
            return {
                ok: false,
                content: `[Error] Gemini API error: ${response.status} ${response.statusText}\n${text}`,
                usage: null,
            };
        }

        if (chatOption.stream) {
            return consumeGeminiStream(response, {
                streamMsg: options.streamMsg,
                abortController: options.abortController,
                onRawEvent: (data) => appendLog({ type: 'chunk', data }),
                t0,
            });
        }

        const data = await response.json() as IGeminiResponse;
        appendLog({ type: 'response', data });
        const result = parseGeminiResponse(data);
        result.time = { latency: new Date().getTime() - t0 };
        return result;
    } catch (error) {
        return toErrorResult(error);
    }
};
