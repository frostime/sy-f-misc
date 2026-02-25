import { appendLog } from '../MessageLogger';
import { adaptChatOptions } from './adpater';
import {
    applyGeminiModelPlaceholder,
    buildProtocolHeaders,
    CompleteOptions,
    ensureGeminiEndpointByStream,
    messageContentToText,
    normalizeMessagesWithSystem,
    parseJsonSafe,
    toErrorResult,
    toOpenAIUsage,
} from './protocol-utils';

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

    // Tool result messages only include `tool_call_id` (see `src/func/gpt/tools/toolchain.ts`).
    // Gemini requires `functionResponse.name`, so we reconstruct name from prior assistant `tool_calls`.
    const toolCallIdToName = new Map<string, string>();

    for (const msg of messages) {
        if (msg.role === 'user') {
            const text = messageContentToText(msg.content);
            if (text.trim()) {
                pushGeminiContent(contents, 'user', [{ text }]);
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
            const name = toolCallIdToName.get(msg.tool_call_id || '') || 'tool';
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
): Record<string, any> => {
    const payload: Record<string, any> = {
        contents,
    };

    if (systemPrompt.trim()) {
        payload.systemInstruction = {
            role: 'system',
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
        'stream', 'stream_options', 'max_completion_tokens', 'max_tokens'
    ]);
    Object.entries(option || {}).forEach(([key, value]) => {
        if (knownKeys.has(key)) return;
        if (value === undefined || value === null || value === '') return;
        payload[key] = value;
    });

    return payload;
};

const parseGeminiResponse = (data: IGeminiResponse): ICompletionResult => {
    const first = data?.candidates?.[0];
    const parts = first?.content?.parts || [];

    const textParts: string[] = [];
    const tool_calls: IToolCall[] = [];
    parts.forEach((part, idx) => {
        if ((part as IGeminiPartText).text) {
            textParts.push((part as IGeminiPartText).text || '');
            return;
        }
        const fcall = (part as IGeminiPartFunctionCall).functionCall;
        if (fcall?.name) {
            tool_calls.push({
                id: `gemini_call_${idx}_${Date.now()}`,
                type: 'function',
                function: {
                    name: fcall.name,
                    arguments: JSON.stringify(fcall.args || {}),
                }
            });
        }
    });

    const usage = toOpenAIUsage({
        prompt_tokens: data?.usageMetadata?.promptTokenCount,
        completion_tokens: data?.usageMetadata?.candidatesTokenCount,
        total_tokens: data?.usageMetadata?.totalTokenCount,
    });

    return {
        ok: true,
        content: textParts.join(''),
        usage,
        tool_calls,
        providerMeta: {
            safetyRatings: first?.safetyRatings,
            promptFeedback: data?.promptFeedback,
            finishReason: first?.finishReason,
        }
    };
};

const parseGeminiStream = async (response: Response, options: CompleteOptions): Promise<ICompletionResult> => {
    if (!response.body) {
        return {
            ok: false,
            content: '[Error] Gemini stream response body is null',
            usage: null,
        };
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    let content = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let providerMeta: Record<string, any> = {};

    const toolCalls = new Map<string, IToolCall>();

    const parseEventBlock = (eventBlock: string) => {
        // Gemini streaming is served as SSE (`data: {json}` blocks separated by blank lines).
        const lines = eventBlock.split('\n');
        const dataLines = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .filter(Boolean);
        if (!dataLines.length) return;

        const rawData = dataLines.join('\n');
        if (rawData === '[DONE]') return;

        const payload = parseJsonSafe<IGeminiResponse>(rawData, null as any);
        if (!payload) return;
        appendLog({ type: 'chunk', data: payload });

        const first = payload?.candidates?.[0];
        const parts = first?.content?.parts || [];
        parts.forEach((part, partIndex) => {
            const text = (part as IGeminiPartText).text;
            if (text) {
                content += text;
                return;
            }
            const functionCall = (part as IGeminiPartFunctionCall).functionCall;
            if (functionCall?.name) {
                const id = `gemini_call_${partIndex}_${functionCall.name}`;
                const prev = toolCalls.get(id);
                const mergedArgs = {
                    ...(parseJsonSafe<Record<string, any>>(prev?.function.arguments || '{}', {})),
                    ...(functionCall.args || {})
                };
                toolCalls.set(id, {
                    id,
                    index: partIndex,
                    type: 'function',
                    function: {
                        name: functionCall.name,
                        arguments: JSON.stringify(mergedArgs),
                    }
                });
            }
        });

        if (payload.usageMetadata) {
            promptTokens = payload.usageMetadata.promptTokenCount || promptTokens;
            completionTokens = payload.usageMetadata.candidatesTokenCount || completionTokens;
            totalTokens = payload.usageMetadata.totalTokenCount || totalTokens;
        }

        if (first?.safetyRatings) {
            providerMeta.safetyRatings = first.safetyRatings;
        }
        if (payload.promptFeedback) {
            providerMeta.promptFeedback = payload.promptFeedback;
        }
        if (first?.finishReason) {
            providerMeta.finishReason = first.finishReason;
        }

        options.streamMsg?.(content);
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
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens || (promptTokens + completionTokens),
    });

    return {
        ok: true,
        content,
        usage,
        tool_calls: Array.from(toolCalls.values()),
        providerMeta,
    };
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
        });
        if (options.stream !== undefined) {
            chatOption.stream = options.stream;
        }

        const contents = toGeminiContents(messages);
        const payload = buildGeminiPayload(contents, systemPrompt, chatOption);
        let url = applyGeminiModelPlaceholder(runtimeLLM.url, runtimeLLM.model);
        url = ensureGeminiEndpointByStream(url, Boolean(chatOption.stream));

        appendLog({ type: 'request', data: { url, payload } });

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
            return parseGeminiStream(response, options);
        }

        const data = await response.json() as IGeminiResponse;
        appendLog({ type: 'response', data });
        return parseGeminiResponse(data);
    } catch (error) {
        return toErrorResult(error);
    }
};
