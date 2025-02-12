import { useModel } from "./setting/store";

/**
 * 适配即将发给 GPT 的消息
 */
const adpatInputMessage = (input: Parameters<typeof complete>[0], modelName?: string) => {
    let messages: IMessage[] = [];
    if (typeof input === 'string') {
        messages = [{
            "role": "user",
            "content": input
        }];
    } else {
        // 去掉可能的不需要的字段
        messages = input.map(item => ({
            role: item.role,
            content: item.content
        }));
    }

    return messages;
}

interface CompletionResponse {
    content: string;
    usage: any | null;
    reasoning_content?: string;
}

interface StreamChunkData {
    content: string;
    reasoning_content: string;
}

/**
 * 处理流式响应的数据块
 */
const handleStreamChunk = (line: string): StreamChunkData | null => {
    if (line.includes('[DONE]') || !line.startsWith('data: ')) {
        return null;
    }

    try {
        const responseData = JSON.parse(line.slice(6));
        if (responseData.error && !responseData.choices) {
            return {
                content: `**[Error]** \`\`\`json\n${JSON.stringify(responseData.error)}\`\`\``,
                reasoning_content: ''
            };
        }

        const delta = responseData.choices[0].delta;
        return {
            content: delta.content || '',
            reasoning_content: delta.reasoning_content || ''
        };
    } catch (e) {
        console.warn('Failed to parse stream data:', e);
        return null;
    }
}

/**
 * 处理流式响应
 */
const handleStreamResponse = async (
    response: Response,
    options: NonNullable<Parameters<typeof complete>[1]>
): Promise<CompletionResponse> => {
    if (!response.body) {
        throw new Error('Response body is null');
    }

    const responseContent: CompletionResponse = {
        content: '',
        reasoning_content: '',
        usage: null
    };

    const transformStream = new TransformStream({
        transform: (chunk, controller) => {
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                const result = handleStreamChunk(line);
                if (result) {
                    controller.enqueue(result);
                }
            }
        }
    });

    const stream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(transformStream);

    const reader = stream.getReader();
    const checkAbort = options?.abortControler?.signal 
        ? () => options.abortControler.signal.aborted 
        : () => false;

    try {
        while (true) {
            const readResult = await reader.read();
            if (readResult.done) break;

            if (checkAbort()) {
                await reader.cancel();
                responseContent.content += `\n **[Error]** Request aborted`;
                break;
            }

            const { content, reasoning_content } = readResult.value as StreamChunkData;
            responseContent.reasoning_content += reasoning_content;
            responseContent.content += content;
            let streamingMsg = '';
            if (responseContent.reasoning_content) {
                streamingMsg += `<think>\n${responseContent.reasoning_content}\n</think>\n`;
            }
            if (responseContent.content) {
                streamingMsg += responseContent.content;
            }
            options.streamMsg?.(streamingMsg);
        }
    } catch (error) {
        responseContent.content += `\n **[Error]** ${error}`;
    }

    return responseContent;
}

/**
 * 处理非流式响应
 */
const handleNormalResponse = async (response: Response): Promise<CompletionResponse> => {
    const data = await response.json();
    if (data.error && !data.data) {
        return {
            usage: null,
            content: JSON.stringify(data.error),
            reasoning_content: ''
        };
    }
    return {
        content: data.choices[0].message.content,
        usage: data.usage,
        reasoning_content: data.choices[0].message?.reasoning_content
    };
}

export const complete = async (input: string | IMessage[], options?: {
    model?: IGPTModel,
    systemPrompt?: string,
    stream?: boolean,
    streamMsg?: (msg: string) => void,
    streamInterval?: number,
    option?: IChatOption
    abortControler?: AbortController
}): Promise<CompletionResponse> => {
    try {
        const { url, model, apiKey } = options?.model ?? useModel('siyuan');
        const messages = adpatInputMessage(input, model);

        if (options?.systemPrompt) {
            messages.unshift({
                role: "system",
                content: options.systemPrompt
            });
        }

        const payload = {
            model: model,
            messages: messages,
            ...options?.option,
            stream: options?.stream
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(payload),
            signal: options?.abortControler?.signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            if (errorData?.error) {
                return {
                    usage: null,
                    content: JSON.stringify(errorData.error)
                };
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return options?.stream 
            ? handleStreamResponse(response, options)
            : handleNormalResponse(response);

    } catch (error) {
        return {
            content: `[Error] Failed to request openai api, ${error}`,
            usage: null
        };
    }
}