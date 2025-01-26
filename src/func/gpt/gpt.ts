import { useModel } from "./setting/store";

export const complete = async (input: string | IMessage[], options?: {
    model?: IGPTModel,
    systemPrompt?: string,
    stream?: boolean,
    streamMsg?: (msg: string) => void,
    streamInterval?: number,
    option?: IChatOption
    abortControler?: AbortController
}): Promise<{ content: string, usage: any | null }> => {
    let { url, model, apiKey } = options?.model ?? useModel('siyuan');

    options.option = options.option && {};

    let messages: IMessage[] = [];
    if (typeof input === 'string') {
        messages = [{
            "role": "user",
            "content": input
        }];
    } else {
        messages = [...input];
    }

    if (options?.systemPrompt) {
        messages.unshift({
            "role": "system",
            "content": options.systemPrompt
        });
    }

    if (options?.stream !== undefined && options?.stream !== null) {
        options.option.stream = options.stream;
    }
    const payload = {
        "model": model,
        "messages": messages,
        ...options.option
    };
    let response: Response;
    try {
        // const controller = new AbortController();
        // const signal = controller.signal;

        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(payload),
            signal: options?.abortControler?.signal // 添加 signal 以支持中断
        });

        // 在需要中断请求时调用
        // controller.abort();

        if (!response.ok) {
            try {
                const data = await response.json();
                if (data.error && !data.data) {
                    return {
                        usage: null,
                        content: JSON.stringify(data.error)
                    };
                }
            } catch {

            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (options?.stream) {
            // --- 替换位置开始 ---
            if (!response.body) {
                throw new Error('Response body is null');
            }

            let usage: Record<string, any> | null = null;

            const transformStream = new TransformStream({
                transform: (chunk, controller) => {
                    const lines = chunk.split('\n').filter((line: string) => line.trim() !== '');
                    for (const line of lines) {
                        if (line.includes('[DONE]')) {
                            return;
                        }
                        if (!line.startsWith('data: ')) continue;
                        try {
                            let responseData = JSON.parse(line.slice(6));
                            if (responseData.error && !responseData.choices) {
                                // fullText += JSON.stringify(responseData.error);
                                const errorMessage = JSON.stringify(responseData.error);
                                controller.enqueue(`**[Error]** \`\`\`json\n${errorMessage}\`\`\``);
                                continue;
                            }
                            usage = responseData.usage ?? usage;
                            if (!responseData.choices[0].delta?.content) continue;
                            const content = responseData.choices[0].delta.content;
                            controller.enqueue(content);
                        } catch (e) {
                            console.warn('Failed to parse stream data:', e);
                        }
                    }
                }
            });

            const stream = response.body
                .pipeThrough(new TextDecoderStream())
                .pipeThrough(transformStream);

            const reader = stream.getReader();
            let fullText = '';
            let readResult: ReadableStreamReadResult<string>;
            const checkAbort = options?.abortControler?.signal ? () => options.abortControler.signal.aborted : () => false;
            while (true) {
                try {
                    readResult = await reader.read();
                    if (readResult.done) break;

                    if (checkAbort()) {
                        try {
                            await reader.cancel();
                        } catch (error) {
                            if (error.name !== 'AbortError') {
                                console.error('Error during reader.cancel():', error);
                            }
                        }
                        fullText += `\n **[Error]** Request aborted`;
                        break;
                    }
                    fullText += readResult.value;
                    options.streamMsg?.(fullText);
                } catch (error) {
                    fullText += `\n **[Error]** ${error}\n`;
                    break;
                }
            }

            return { content: fullText, usage: usage };
        } else {
            // 非流式处理部分保持不变
            const data = await response.json();
            if (data.error && !data.data) {
                return {
                    usage: null,
                    content: JSON.stringify(data.error)
                };
            }
            return { content: data.choices[0].message.content, usage: data.usage };
        }

    } catch (error) {
        return { content: `[Error] Failed to request openai api, ${error}`, usage: null };
    }
}