/**
 * Send GPT request, use AI configuration in `siyuan.config.ai.openAI` by default
 * @param prompt - Prompt
 * @param options - Options
 * @param options.url - Custom API URL
 * @param options.model - Custom API model
 * @param options.apiKey - Custom API key
 * @param options.returnRaw - Whether to return raw response (default: false)
 * @param options.history - Chat history
 * @param options.stream - Whether to use streaming mode, default: false
 * @param options.streamMsg - Callback function for streaming messages, only works when options.stream is true
 * @param options.streamInterval - Interval for calling options.streamMsg on each chunk, default: 1
 * @returns GPT response
 */
export const complete = async (prompt: string, options?: {
    url?: string,
    model?: string,
    apiKey?: string,
    systemPrompt?: string,
    returnRaw?: boolean,
    history?: { role: 'user' | 'assistant', content: string }[],
    stream?: boolean,
    streamMsg?: (msg: string) => void,
    streamInterval?: number
}) => {
    let { apiBaseURL, apiModel, apiKey } = window.siyuan.config.ai.openAI;
    apiModel = options?.model ?? apiModel;
    apiKey = options?.apiKey ?? apiKey;
    let url;
    if (options?.url) {
        url = options.url;
    } else {
        url = `${apiBaseURL.endsWith('/') ? apiBaseURL : apiBaseURL + '/'}chat/completions`;
    }

    let messages = [{
        "role": "user",
        "content": prompt
    }];

    if (options?.systemPrompt) {
        messages.unshift({
            "role": "system",
            "content": options.systemPrompt
        });
    }
    if (options?.history) {
        messages = [...messages, ...options.history];
    }

    const payload = {
        "model": apiModel,
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