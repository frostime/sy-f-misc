import { defaultModelId, useModel } from "../model/store";
import { appendLog } from "../MessageLogger";
import { adpatInputMessage, adaptChatOptions, adaptResponseReferences, userCustomizedPreprocessor } from './adapter';
import { consumeOpenAIStream, parseOpenAINonStream } from './response-parse';
import { bindExtraSource, getCompatibleExtra, getProviderProtocol, parseJsonSafe, toErrorResult, type CompleteOptions } from './protocol-utils';
import { claudeComplete } from './claude-complete';
import { geminiComplete } from './gemini-complete';

const buildReferencesText = (refers: ICompletionResult['references']) => {
    if (!refers) return '';
    return '**References**:\n' + refers.filter(ref => Boolean(ref.url)).map((ref, index) => {
        return `${index + 1}. [${ref.title || ref.url}](${ref.url})`;
    }).join('\n');
}

/** extra.data 中允许回放到 OpenAI 请求的原始 reasoning 字段 */
const OPENAI_REPLAY_FIELDS = ['reasoning_content', 'reasoning', 'reasoning_details'] as const;

/**
 * 构造 OpenAI 请求消息：不发送内部 `extra`；只有与当前运行时兼容的 OpenAI extra
 * 才把原始 reasoning 字段还原到对应 assistant 消息上（不全局放行 reasoning 字段）。
 */
const toOpenAIWireMessages = (messages: IMessage[], runtime: IRuntimeLLM): IMessage[] => {
    return messages.map((message) => {
        const { extra: _extra, ...wire } = message as IMessage & { extra?: IMessageExtra };
        if (wire.role !== 'assistant') return wire as IMessage;
        if (Array.isArray(wire.tool_calls)) {
            wire.tool_calls = wire.tool_calls.map(call => {
                const copy = { ...call };
                delete (copy as IToolCall & { index?: number }).index;
                return copy;
            });
        }
        const extra = getCompatibleExtra(message, runtime);
        if (extra?.protocol !== 'openai') return wire as IMessage;
        const target = wire as Record<string, any>;
        for (const field of OPENAI_REPLAY_FIELDS) {
            if (extra.data[field] !== undefined) {
                target[field] = extra.data[field];
            }
        }
        return target as IMessage;
    });
}

/**
 * 处理流式响应：解析委托给零依赖的 response-parse.consumeOpenAIStream（网络边界可 mock），
 * 此处只负责引用文本注入。耗时/throughput/abort/error 均在 consumeOpenAIStream 内处理。
 */
const handleStreamResponse = async (
    response: Response,
    options: CompleteOptions & { t0: number }
): Promise<ICompletionResult> => {
    const result = await consumeOpenAIStream(response, {
        streamMsg: options.streamMsg,
        abortController: options.abortController,
        t0: options.t0,
        extractReferences: adaptResponseReferences,
        onRawEvent: (data) => appendLog({ type: 'chunk', data }),
    });

    if (result.references?.length) {
        result.content += '\n\n' + buildReferencesText(result.references);
    }
    return result;
}

/**
 * 处理非流式响应
 */
const handleNormalResponse = async (response: Response, options: { t0: number }): Promise<ICompletionResult> => {
    const data = await response.json();

    appendLog({ type: 'response', data });
    if (data.error && !data.data) {
        return {
            usage: null,
            content: JSON.stringify(data.error),
            reasoning_content: '',
            ok: false
        };
    }

    if (!data.choices?.[0]?.message) {
        return {
            usage: null,
            content: `[Error] Unexpected response shape: missing choices[0].message\n${JSON.stringify(data).slice(0, 2000)}`,
            ok: false
        };
    }

    const results = parseOpenAINonStream(data, { extractReferences: adaptResponseReferences });

    if (results.references?.length) {
        results.content += '\n\n' + buildReferencesText(results.references);
    }

    const t1 = new Date().getTime();
    results['time'] = {
        latency: t1 - options.t0
    }
    // throughput = completion_tokens / 实际耗时（秒）；请求耗时缺失时不计算，不伪造数值
    const completionTokens = results.usage?.completion_tokens;
    const elapsedSeconds = (t1 - options.t0) / 1000;
    if (completionTokens && elapsedSeconds > 0) {
        results['time'].throughput = completionTokens / elapsedSeconds;
    }

    results['ok'] = true;

    return results;
}



/**
 * OpenAI 协议请求：先运行 adapter 选项与自定义 preprocessor，再按“最终请求模型”
 * （option.model 覆盖 body.model）建立请求模型。消息/wire 构造、fetch、解析与
 * extra 来源绑定使用同一协议适配边界。
 */
const requestOpenAI = async (
    input: string | IMessage[],
    options: CompleteOptions,
    runtime: IRuntimeLLM,
): Promise<ICompletionResult> => {
    const { url, model, apiKey, config: modelConfig, provider } = runtime;

    let chatOption: IChatCompleteOption = { ...(options?.option ?? {}) };
    // 外部 stream 必须在 adapter 之前合并：toggle / capability 过滤才有机会把它关掉。
    if (options.stream !== undefined) {
        chatOption.stream = options.stream;
    }
    chatOption = adaptChatOptions({
        chatOption,
        runtimeLLM: runtime,
        toggles: options.toggles,
    });

    const chatInputs = {
        model: model,
        modelDisplayName: modelConfig?.displayName || model,
        url: url,
        option: chatOption
    }

    // adapter 后的初始流式模式决定是否预置 usage 选项。默认值在 hook 之前注入，
    // hook 可以删除它或改 include_usage；hook 的最终决定不会再被覆盖。
    const initialStream = Boolean(chatInputs.option.stream);
    const defaultStreamOptions: NonNullable<IChatCompleteOption['stream_options']> = {
        include_usage: true
    };
    if (initialStream) {
        chatInputs.option.stream_options = defaultStreamOptions;
    }

    /**
     * 假如有用户自定义的预处理器, 则使用
     */
    if (userCustomizedPreprocessor?.preprocess) {
        userCustomizedPreprocessor.preprocess(chatInputs);
    }

    // 预处理器可以改 stream，所以请求模式取最终值；payload.stream 与响应解析共用它。
    const stream = Boolean(chatInputs.option.stream);
    if (!initialStream && stream && chatInputs.option.stream_options === undefined) {
        // hook 把非流式改成流式：只在 hook 没有提供 usage 选项时补默认值。
        chatInputs.option.stream_options = defaultStreamOptions;
    }
    if (!stream && chatInputs.option.stream_options === defaultStreamOptions) {
        // hook 关掉流式后，删除自动补的 usage 选项，避免非流式请求带上它。
        delete chatInputs.option.stream_options;
    }

    // The preprocessor may redirect the wire model; replay source binding follows it.
    const bodyModel = (chatInputs.option as IChatCompleteOption & { model?: string }).model ?? chatInputs.model;
    const effectiveRuntime: IRuntimeLLM = bodyModel === runtime.model
        ? runtime
        : { ...runtime, model: bodyModel };

    return (async (preparedInput: string | IMessage[]) => {
        let response: Response;

        try {
            const messages = adpatInputMessage(preparedInput, { model: effectiveRuntime });

            if (options?.systemPrompt) {
                messages.unshift({
                    role: "system",
                    content: options.systemPrompt
                });
            }

            const payload = {
                model: chatInputs.model,
                messages: toOpenAIWireMessages(messages, effectiveRuntime),
                ...chatInputs.option
            };

            appendLog({ type: 'request', data: payload });

            const t0 = new Date().getTime();

            response = await fetch(chatInputs.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'text/event-stream',
                    ...(provider?.customHeaders || {})
                },
                body: JSON.stringify(payload),
                signal: options?.abortController?.signal
            });

            if (!response.ok) {
                // 错误正文只读一次：先取文本，再尝试解析 JSON；两条分支都保留提供方原文。
                const text = await response.text().catch(() => '');
                const errorData = parseJsonSafe(text, null);
                appendLog({ type: 'response', data: errorData ?? text });
                return {
                    usage: null,
                    content: `[Error] HTTP error! status: ${response.status}
${text}`,
                    ok: false
                }
            }

            // 解析器内部的异步失败必须落在这里的 try 中，转换为 ok:false 结果。
            const result = stream
                ? await handleStreamResponse(response, { ...options, t0 })
                : await handleNormalResponse(response, { t0 });
            if (result.ok !== false && result.extra) {
                result.extra = bindExtraSource(result.extra, effectiveRuntime);
            }
            return result;

        } catch (error) {
            return {
                content: `[Error] Failed to request openai api, ${error}`,
                usage: null,
                ok: false
            };
        }
    })(input);
};

/**
 * 所有协议请求的统一入口。
 * - 模型只解析一次，入口错误统一转为 ok:false；
 * - 原生协议直接使用各自适配器；
 * - OpenAI 的协议边界在消息/wire/fetch 之前建立。
 */
export const complete = async (
    input: string | IMessage[],
    options?: CompleteOptions,
): Promise<ICompletionResult> => {
    options = options || {};

    try {
        if (!options.model) {
            const model = useModel(defaultModelId() || 'siyuan');
            if (!model) {
                return {
                    ok: false,
                    content: `Error: 无法获取对话模型，请先在设置中添加并选择一个模型。`,
                }
            }
            options.model = model;
        }
        const runtime = options.model;
        const protocol = getProviderProtocol(runtime);

        if (protocol === 'claude') {
            return await claudeComplete(input, options);
        }
        if (protocol === 'gemini') {
            return await geminiComplete(input, options);
        }

        return await requestOpenAI(input, options, runtime);
    } catch (error) {
        return toErrorResult(error);
    }
};
