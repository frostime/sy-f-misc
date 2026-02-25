import { showMessage } from 'siyuan';
import { adpatInputMessage } from './adpater';

export interface CompleteOptions {
    model?: IRuntimeLLM;
    systemPrompt?: string;
    stream?: boolean;
    streamMsg?: (msg: string, toolCalls?: IToolCallResponse[]) => void;
    streamInterval?: number;
    option?: IChatCompleteOption;
    abortController?: AbortController;
}

export const getProviderProtocol = (runtimeLLM?: IRuntimeLLM): LLMProviderProtocol => {
    const raw = (runtimeLLM?.provider?.protocol || runtimeLLM?.provider?.protocal || runtimeLLM?.protocol || 'openai').toLowerCase();
    if (raw === 'claude' || raw === 'gemini' || raw === 'openai') {
        return raw;
    }
    if (raw === 'anthropic') {
        return 'claude';
    }
    return 'openai';
};

export const normalizeMessagesWithSystem = (
    input: string | IMessage[],
    options: CompleteOptions
): {
    messages: IMessage[];
    systemPrompt: string;
} => {
    const messages = adpatInputMessage(input, { model: options.model });
    let systemPrompt = (options.systemPrompt || '').trim();

    const remainingMessages: IMessage[] = [];
    for (const msg of messages) {
        if (msg.role === 'system') {
            const text = messageContentToText(msg.content);
            if (text.trim()) {
                systemPrompt = systemPrompt ? `${systemPrompt}\n\n${text.trim()}` : text.trim();
            }
        } else {
            remainingMessages.push(msg);
        }
    }

    return {
        messages: remainingMessages,
        systemPrompt,
    };
};

export const messageContentToText = (content: IMessage['content']): string => {
    if (typeof content === 'string') {
        return content;
    }
    if (!Array.isArray(content)) {
        return '';
    }
    return content
        .filter((part) => part?.type === 'text')
        .map((part: ITextContentPart) => part.text || '')
        .join('\n');
};

export const buildProtocolHeaders = (
    protocol: LLMProviderProtocol,
    runtimeLLM: IRuntimeLLM,
    stream = false
): Record<string, string> => {
    const customHeaders = runtimeLLM.provider?.customHeaders || {};

    const providerName = runtimeLLM.provider?.name || runtimeLLM.bareId || 'provider';
    const warnedKey = `${protocol}:${providerName}`;

    const warnOnce = (keys: string[]) => {
        if (keys.length === 0) return;
        if (warnedHeaderOverrides.has(warnedKey)) return;
        warnedHeaderOverrides.add(warnedKey);
        showMessage(
            `WARNING: Provider(${providerName}) customHeaders overrides ignored for: ${keys.join(', ')}`,
            6000,
            'info'
        );
    };

    if (protocol === 'claude') {
        const denied = new Set(['x-api-key', 'anthropic-version']);
        const overridden = Object.keys(customHeaders).filter(k => denied.has(k.toLowerCase()));
        warnOnce(overridden);

        const filtered: Record<string, string> = {};
        Object.entries(customHeaders).forEach(([k, v]) => {
            if (denied.has(k.toLowerCase())) return;
            filtered[k] = v;
        });

        return {
            'Content-Type': 'application/json',
            'x-api-key': runtimeLLM.apiKey,
            'anthropic-version': '2023-06-01',
            ...(stream ? { 'Accept': 'text/event-stream' } : {}),
            // NOTE: user headers override non-sensitive defaults.
            ...filtered,
        };
    }

    if (protocol === 'gemini') {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(stream ? { 'Accept': 'text/event-stream' } : {}),
            ...customHeaders,
        };
        if (!('x-goog-api-key' in headers) && !('authorization' in Object.keys(headers).reduce((acc, key) => {
            acc[key.toLowerCase()] = headers[key];
            return acc;
        }, {} as Record<string, string>))) {
            headers['x-goog-api-key'] = runtimeLLM.apiKey;
        }
        return headers;
    }

    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runtimeLLM.apiKey}`,
        ...(stream ? { 'Accept': 'text/event-stream' } : {}),
        ...customHeaders,
    };
};

// Track warnings per (protocol, provider) to avoid spamming.
const warnedHeaderOverrides = new Set<string>();

export const ensureGeminiEndpointByStream = (url: string, stream: boolean): string => {
    if (!stream) return url;

    let next = url;
    if (next.includes(':generateContent')) {
        next = next.replace(':generateContent', ':streamGenerateContent');
    }
    if (!next.includes(':streamGenerateContent')) {
        return next;
    }
    if (next.includes('alt=sse')) {
        return next;
    }
    return `${next}${next.includes('?') ? '&' : '?'}alt=sse`;
};

export const applyGeminiModelPlaceholder = (url: string, model: string): string => {
    if (!url.includes('{model}')) {
        return url;
    }
    return url.replaceAll('{model}', encodeURIComponent(model));
};

export const parseJsonSafe = <T = any>(text: string, fallback: T = null as T): T => {
    try {
        return JSON.parse(text) as T;
    } catch {
        return fallback;
    }
};

export const toErrorResult = (error: any): ICompletionResult => {
    return {
        ok: false,
        content: `[Error] ${error?.message || String(error)}`,
        usage: null,
    };
};

export const toOpenAIUsage = (usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
} | null | undefined) => {
    if (!usage) return null;
    const prompt_tokens = usage.prompt_tokens || 0;
    const completion_tokens = usage.completion_tokens || 0;
    const total_tokens = usage.total_tokens || (prompt_tokens + completion_tokens);
    return {
        prompt_tokens,
        completion_tokens,
        total_tokens,
    };
};
