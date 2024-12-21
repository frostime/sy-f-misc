export const defaultProvider = (): IGPTProvider => {
    let { apiBaseURL, apiModel, apiKey } = window.siyuan.config.ai.openAI;
    let url = `${apiBaseURL.endsWith('/') ? apiBaseURL : apiBaseURL + '/'}chat/completions`;
    return {
        id: 'default',
        url,
        model: apiModel,
        apiKey: apiKey
    }
}


export const complete = async (input: string | IMessage[], options?: {
    provider?: IGPTProvider,
    systemPrompt?: string,
    returnRaw?: boolean,
    stream?: boolean,
    streamMsg?: (msg: string) => void,
    streamInterval?: number
}) => {
    let provider = options?.provider ?? defaultProvider();

    let { url, model, apiKey } = provider;

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
        "stream": options?.stream ?? false
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(payload),
            // signal: AbortSignal.timeout(options?.timeout ?? 1000 * 12)
        });

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
                throw error;
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