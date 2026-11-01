import { appendLog } from '../MessageLogger';
import { adaptChatOptions, DEFAULT_THINKING_BUDGETS } from './adapter';
import {
    applyGeminiModelPlaceholder,
    bindExtraSource,
    buildProtocolHeaders,
    CompleteOptions,
    ensureGeminiEndpointByStream,
    messageContentToText,
    normalizeMessagesWithSystem,
    parseJsonSafe,
    toErrorResult,
} from './protocol-utils';
import { consumeGeminiStream, parseGeminiResponse } from './response-parse';
import { prepareGeminiReplayParts } from './replay-contract';

const pushGeminiContent = (contents: IGeminiContent[], role: IGeminiContent['role'], parts: IGeminiPart[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
        last.parts.push(...parts);
    } else {
        contents.push({ role, parts });
    }
};

const toGeminiContents = (messages: IMessage[], runtime: IRuntimeLLM): IGeminiContent[] => {
    const contents: IGeminiContent[] = [];
    const toolCallIdToName = new Map<string, string>();
    const serverFunctionCallIdByToolCallId = new Map<string, string>();

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
            // 同源 replay 只提供 native-only 数据（thought / 签名 / 服务端 id / 顺序）；正文取 `content`。
            const replayed = prepareGeminiReplayParts(msg, runtime);
            if (replayed) {
                pushGeminiContent(contents, 'model', replayed.parts);
                replayed.calls.forEach((call) => {
                    toolCallIdToName.set(call.toolCallId, call.name);
                    if (call.serverId !== undefined) {
                        serverFunctionCallIdByToolCallId.set(call.toolCallId, call.serverId);
                    }
                });
                continue;
            }

            const parts: IGeminiPart[] = [];
            const text = messageContentToText(msg.content);
            if (text.trim()) {
                parts.push({ text });
            }

            if (Array.isArray(msg.tool_calls)) {
                msg.tool_calls.forEach((toolCall) => {
                    // canonical 名字供后续 functionResponse.name 解析；不伪造任何 wire id。
                    toolCallIdToName.set(toolCall.id, toolCall.function.name);
                    const args = parseJsonSafe<Record<string, any>>(toolCall.function.arguments || '{}', {});
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
            const functionResponse: IGeminiPartFunctionResponse['functionResponse'] = {
                name,
                response: parsed,
            };
            // 只有原始调用带服务端 id 时才回传 id；本地 synthetic id 不发。
            const serverFunctionCallId = serverFunctionCallIdByToolCallId.get(msg.tool_call_id || '');
            if (serverFunctionCallId !== undefined) {
                functionResponse.id = serverFunctionCallId;
            }
            pushGeminiContent(contents, 'user', [{ functionResponse }]);
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
            // This input is JSON Schema, not Gemini's separate OpenAPI Schema message.
            parametersJsonSchema: structuredClone(tool.function.parameters || { type: 'object', properties: {} })
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

        const chatOption = adaptChatOptions({
            chatOption: {
                ...options.option,
                ...(options.stream !== undefined ? { stream: options.stream } : {}),
            },
            runtimeLLM,
            toggles: options.toggles,
        });

        // Gemini 的模型由 URL 决定；option.model 不是合法的模型选择器，保持既有 API 处理。
        const { messages, systemPrompt } = normalizeMessagesWithSystem(input, options);
        const contents = toGeminiContents(messages, runtimeLLM);
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
            const result = await consumeGeminiStream(response, {
                streamMsg: options.streamMsg,
                abortController: options.abortController,
                onRawEvent: (data) => appendLog({ type: 'chunk', data }),
                t0,
            });
            if (result.ok !== false && result.extra) {
                result.extra = bindExtraSource(result.extra, runtimeLLM);
            }
            return result;
        }

        const data = await response.json() as IGeminiResponse;
        appendLog({ type: 'response', data });
        const result = parseGeminiResponse(data);
        result.time = { latency: new Date().getTime() - t0 };
        if (result.ok !== false && result.extra) {
            result.extra = bindExtraSource(result.extra, runtimeLLM);
        }
        return result;
    } catch (error) {
        return toErrorResult(error);
    }
};
