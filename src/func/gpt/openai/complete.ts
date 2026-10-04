import { defaultModelId, useModel } from "../model/store";
import { appendLog } from "../MessageLogger";
import { adpatInputMessage, adaptChatOptions, adaptResponseReferences, userCustomizedPreprocessor } from './adapter';
import { consumeOpenAIStream, parseOpenAINonStream } from './response-parse';
import type { TStreamMsgCallback } from './response-parse';
import { getProviderProtocol } from './protocol-utils';
import { claudeComplete } from './claude-complete';
import { geminiComplete } from './gemini-complete';

const buildReferencesText = (refers: ICompletionResult['references']) => {
    if (!refers) return '';
    return '**References**:\n' + refers.filter(ref => Boolean(ref.url)).map((ref, index) => {
        return `${index + 1}. [${ref.title || ref.url}](${ref.url})`;
    }).join('\n');
}

/**
 * 处理流式响应：解析委托给零依赖的 response-parse.consumeOpenAIStream（网络边界可 mock），
 * 此处只负责引用文本注入。耗时/throughput/abort/error 均在 consumeOpenAIStream 内处理。
 */
const handleStreamResponse = async (
    response: Response,
    options: NonNullable<Parameters<typeof complete>[1]> & { t0: number }
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



export const complete = async (input: string | IMessage[], options?: {
    model?: IRuntimeLLM,
    systemPrompt?: string,
    stream?: boolean,
    streamMsg?: TStreamMsgCallback,
    streamInterval?: number,
    option?: IChatCompleteOption
    /** chatOptionToggles：toggle=false 的字段在 adapter 中被删除 */
    toggles?: Partial<Record<keyof IChatCompleteOption, boolean>>
    abortController?: AbortController
}): Promise<ICompletionResult> => {
    options = options || {};

    let response: Response;

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

    const protocol = getProviderProtocol(options.model);
    if (protocol === 'claude') {
        return claudeComplete(input, options);
    }
    if (protocol === 'gemini') {
        return geminiComplete(input, options);
    }

    try {
        const { url, model, apiKey, config: modelConfig, provider } = options.model;
        const messages = adpatInputMessage(input, { model: options.model });

        if (options?.systemPrompt) {
            messages.unshift({
                role: "system",
                content: options.systemPrompt
            });
        }

        let chatOption = options?.option ?? {};
        chatOption = adaptChatOptions({
            chatOption,
            runtimeLLM: options.model,
            toggles: options.toggles,
        });

        if (options?.stream !== undefined) {
            chatOption.stream = options.stream;
        }

        const chatInputs = {
            model: model,
            modelDisplayName: modelConfig?.displayName || model,
            url: url,
            option: chatOption
        }

        if (options.stream) {
            // 设置 stream options，启用 usage 数据返回
            chatInputs.option.stream_options = {
                include_usage: true
            };
        }


        /**
         * 假如有用户自定义的预处理器, 则使用
         */
        if (userCustomizedPreprocessor?.preprocess) {
            userCustomizedPreprocessor.preprocess(chatInputs);
        }


        const payload = {
            model: chatInputs.model,
            messages: messages,
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
            const errorData = await response.json().catch(() => null);
            if (errorData) {
                appendLog({ type: 'response', data: errorData });
                return {
                    usage: null,
                    content: JSON.stringify(errorData)
                }
            } else {
                const data = await response.text().catch(() => '');
                return {
                    usage: null,
                    content: `[Error] HTTP error! status: ${response.status}\n${data}`,
                    ok: false
                }
            }
        }

        return options?.stream
            ? handleStreamResponse(response, { ...options, t0 })
            : handleNormalResponse(response, { t0 });

    } catch (error) {
        return {
            content: `[Error] Failed to request openai api, ${error}`,
            usage: null,
            ok: false
        };
    }
}
