import { useModel } from "./setting/store";

export const complete = async (input: string | IMessage[], options?: {
    model?: IGPTModel,
    systemPrompt?: string,
    returnRaw?: boolean,
    stream?: boolean,
    streamMsg?: (msg: string) => void,
    streamInterval?: number,
    option?: IChatOption
    abortControler?: AbortController
}) => {
    let { url, model, apiKey } = options?.model ?? useModel('siyuan')();

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

    const payload = {
        "model": model,
        "messages": messages,
        "stream": options?.stream ?? false,
        ...(options?.option ?? {})
    };

    try {
        // const controller = new AbortController();
        // const signal = controller.signal;

        const response = await fetch(url, {
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
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (options?.stream) {
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Failed to get response reader');
            }

            options.streamInterval = options.streamInterval ?? 1;

            const decoder = new TextDecoder();
            let fullText = '';

            try {
                let chunkIndex = 0;
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');

                    for (const line of lines) {
                        if (line.includes('[DONE]')) {
                            continue;
                        }
                        if (!line.startsWith('data: ')) continue;

                        try {
                            const data = JSON.parse(line.slice(6));
                            if (!data.choices[0].delta?.content) continue;

                            const content = data.choices[0].delta.content;
                            fullText += content;
                            // options.streamMsg?.(fullText);
                        } catch (e) {
                            console.warn('Failed to parse stream data:', e);
                        }
                    }
                    if (chunkIndex % options.streamInterval === 0) {
                        options.streamMsg?.(fullText);
                    }
                    chunkIndex++;
                }
            } catch (error) {
                console.error('Stream reading error:', error);
                return fullText + '\n' + `[Error] Failed to request openai api, ${error}`;
            } finally {
                reader.releaseLock();
            }
            return fullText;
        }

        const data = await response.json();
        return options?.returnRaw ? data : data.choices[0].message.content;
    } catch (error) {
        return `[Error] Failed to request openai api, ${error}`;
    }
}