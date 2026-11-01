// Host and network boundaries for the GPT protocol request tests.
//
// The runner replaces only these modules for the bundle:
//   siyuan                    -> showMessage (adapter / protocol-utils UI notices)
//   ../MessageLogger          -> appendLog   (message log side channel)
//   ../setting                -> checkSupportsModality (model capability probe)
//   ../model/store            -> defaultModelId / useModel (global model lookup)
// Everything else (complete, adapters, parsers, native payload builders, toolchain)
// stays production code. Tests always pass an explicit synthetic model, so the fake
// model lookup below only guards against accidental real configuration access.
//
// Test helpers exported here (syntheticModel / mockFetch / response & SSE builders)
// are shared with the native-payload test; keep them free of production imports.

// ---------------------------------------------------------------------------
// Replaced host modules
// ---------------------------------------------------------------------------

type TLogEntry = { type: string; data: any };

/** Replaces MessageLogger.appendLog so tests can inspect what the transport logged. */
export const logEntries: TLogEntry[] = [];
export const appendLog = (entry: TLogEntry) => {
    logEntries.push(entry);
};

/** Replaces SiYuan showMessage; notices must never reach a real UI in tests. */
export const showMessage = (..._args: any[]) => { };

export const defaultModelId = () => '';

export const useModel = (): IRuntimeLLM => {
    throw new Error('Tests must pass an explicit synthetic model');
};

/**
 * Replaces the runtime capability probe. Semantics mirror production: a modality is
 * supported only when the model's own `modalities.input` list contains it. No private
 * configuration or global registry is consulted.
 */
export const checkSupportsModality = (
    modelInput: ILLMConfigV2 | ModelBareId,
    modality: LLMModality,
    direction: 'input' | 'output' = 'input',
): boolean => {
    if (!modelInput || typeof modelInput !== 'object') return false;
    const list = modelInput.modalities?.[direction];
    return Array.isArray(list) && list.includes(modality);
};

// ---------------------------------------------------------------------------
// Synthetic models
// ---------------------------------------------------------------------------

const DEFAULT_MODEL: Record<LLMProviderProtocol, string> = {
    openai: 'gpt-synthetic',
    claude: 'claude-synthetic',
    gemini: 'gemini-synthetic',
};

const DEFAULT_URL: Record<LLMProviderProtocol, string> = {
    openai: 'https://openai.example/v1/chat/completions',
    claude: 'https://claude.example/v1/messages',
    gemini: 'https://gemini.example/v1beta/models/{model}:generateContent',
};

export interface TSyntheticModelOverrides {
    model?: string;
    url?: string;
    apiKey?: string;
    type?: LLMServiceType;
    config?: Partial<Omit<ILLMConfigV2, 'capabilities' | 'modalities' | 'options'>> & {
        capabilities?: Partial<ILLMConfigV2['capabilities']>;
        modalities?: Partial<ILLMConfigV2['modalities']>;
        options?: ILLMConfigV2['options'];
    };
    provider?: Partial<NonNullable<IRuntimeLLM['provider']>>;
}

/**
 * Build a runtime model for one protocol with synthetic credentials and endpoint.
 * Defaults: text+image input, tools and streaming enabled, output limit 4096.
 */
export const syntheticModel = (
    protocol: LLMProviderProtocol,
    overrides: TSyntheticModelOverrides = {},
): IRuntimeLLM => {
    const configOverrides = overrides.config ?? {};
    const model = configOverrides.model ?? overrides.model ?? DEFAULT_MODEL[protocol];
    const apiKey = overrides.apiKey ?? 'synthetic-api-key';
    const type = overrides.type ?? 'chat';

    const config: ILLMConfigV2 = {
        ...configOverrides,
        model,
        displayName: configOverrides.displayName ?? `${model} (synthetic)`,
        type,
        modalities: {
            input: ['text', 'image'],
            output: ['text'],
            ...configOverrides.modalities,
        },
        capabilities: {
            tools: true,
            streaming: true,
            ...configOverrides.capabilities,
        },
        limits: {
            maxContext: 32768,
            maxOutput: 4096,
            ...configOverrides.limits,
        },
        options: { ...configOverrides.options },
    };

    return {
        model,
        url: overrides.url ?? DEFAULT_URL[protocol],
        apiKey,
        bareId: `${model}@synthetic`,
        type,
        protocol,
        config,
        provider: {
            name: 'synthetic',
            baseUrl: 'https://synthetic.example',
            apiKey,
            protocol,
            disabled: false,
            endpoints: {},
            ...overrides.provider,
        },
    };
};

// ---------------------------------------------------------------------------
// Network boundary
// ---------------------------------------------------------------------------

export interface TFetchCall {
    url: string;
    headers: Record<string, string>;
    /** Request body parsed as JSON when possible, otherwise the raw string. */
    body: any;
    rawBody: any;
}

export type TMockFetchReply = Response
    | ((call: TFetchCall) => Response | Promise<Response>);

/** Every request the production code sent during the current mock. */
export const fetchCalls: TFetchCall[] = [];

let savedFetch: typeof fetch | undefined;

/**
 * Install a fake global fetch that answers the queued replies in order and records
 * each request. Replies are `Response` objects or factories receiving the call.
 */
export const mockFetch = (...replies: TMockFetchReply[]) => {
    if (!savedFetch) savedFetch = globalThis.fetch;
    fetchCalls.length = 0;
    const queue = [...replies];

    globalThis.fetch = (async (input: any, init: any = {}) => {
        const url = typeof input === 'string' ? input : String(input?.url ?? input);
        const headers = { ...(init?.headers as Record<string, string> | undefined) };
        const rawBody = init?.body;
        let body = rawBody;
        if (typeof rawBody === 'string') {
            try {
                body = JSON.parse(rawBody);
            } catch {
                body = rawBody;
            }
        }
        const call: TFetchCall = { url, headers, body, rawBody };
        fetchCalls.push(call);

        const reply = queue.shift();
        if (!reply) throw new Error(`Unexpected fetch call: ${url}`);
        return typeof reply === 'function' ? reply(call) : reply;
    }) as typeof fetch;
};

/** Restore the real fetch and drop recorded calls / logs. */
export const restoreFetch = () => {
    if (savedFetch) {
        globalThis.fetch = savedFetch;
        savedFetch = undefined;
    }
    fetchCalls.length = 0;
    logEntries.length = 0;
};

// ---------------------------------------------------------------------------
// Synthetic responses
// ---------------------------------------------------------------------------

/** Frame events as SSE `data:` payloads; objects are JSON-encoded. */
export const sseEvents = (events: Array<Record<string, any> | string>): string =>
    events
        .map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)
        .join('');

export const sseResponse = (
    events: Array<Record<string, any> | string>,
    status = 200,
    statusText = '',
): Response => new Response(sseEvents(events), {
    status,
    statusText,
    headers: { 'Content-Type': 'text/event-stream' },
});

export const jsonResponse = (data: unknown, status = 200, statusText = ''): Response =>
    new Response(JSON.stringify(data), {
        status,
        statusText,
        headers: { 'Content-Type': 'application/json' },
    });

export const textResponse = (text: string, status = 200, statusText = ''): Response =>
    new Response(text, {
        status,
        statusText,
        headers: { 'Content-Type': 'text/plain' },
    });
