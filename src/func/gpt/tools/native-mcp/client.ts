/**
 * The native SiYuan HTTP/JSON MCP branch. No SDK, remote endpoint or reconnect policy.
 *
 * Only the verified stateful 2025-03-26 flow exists here:
 * initialize -> notifications/initialized -> paged tools/list -> tools/call -> DELETE.
 * A response is either JSON or an explicit error; SSE is never parsed.
 */
export interface NativeMcpTool {
    name: string;
    description?: string;
    inputSchema: unknown;
}

const ENDPOINT = '/mcp';
const PROTOCOL_VERSION = '2025-03-26';
const CLIENT_INFO = { name: 'sy-f-misc-gpt', version: '1' };
const CLEANUP_TIMEOUT_MS = 1000;
const CLOSED_MESSAGE = 'Native MCP client is closed';

type JsonRpcReply = {
    result: unknown;
    sessionId: string | null;
};

type RequestScope = {
    signal: AbortSignal;
    release: () => void;
};

const isRecord = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const abortError = (message: string): Error => {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
};

export class NativeMcpClient {
    private readonly lifetime: AbortSignal;
    private readonly pendingRequests = new Set<AbortController>();
    private readonly onLifetimeAbort = () => this.dispose();

    private disposed = false;
    private initialized = false;
    private sessionId: string | null = null;
    private protocolVersion: string | null = null;
    private nextRequestId = 1;
    private initializePromise: Promise<NativeMcpTool[]> | null = null;
    private closePromise: Promise<void> | null = null;

    constructor(lifetime: AbortSignal) {
        this.lifetime = lifetime;
        if (lifetime.aborted) {
            this.dispose();
        } else {
            lifetime.addEventListener('abort', this.onLifetimeAbort, { once: true });
        }
    }

    initialize(startupSignal: AbortSignal): Promise<NativeMcpTool[]> {
        if (this.disposed) return Promise.reject(new Error(CLOSED_MESSAGE));
        // Discovery is one startup task: callers that arrive later wait on the same attempt.
        if (!this.initializePromise) {
            this.initializePromise = this.discoverTools(startupSignal);
        }
        return this.initializePromise;
    }

    async callTool(name: string, args: Record<string, any>): Promise<unknown> {
        if (this.disposed) throw new Error(CLOSED_MESSAGE);
        if (!this.initialized) throw new Error('Native MCP client is not initialized');

        const scope = this.beginRequest();
        try {
            const reply = await this.postJsonRpc('tools/call', { name, arguments: args }, scope.signal);
            if (this.disposed) throw new Error(CLOSED_MESSAGE);
            return reply.result;
        } finally {
            scope.release();
        }
    }

    close(): Promise<void> {
        if (!this.closePromise) this.closePromise = this.finish();
        return this.closePromise;
    }

    private async discoverTools(startupSignal: AbortSignal): Promise<NativeMcpTool[]> {
        this.assertCanDiscover(startupSignal);
        const scope = this.beginRequest(startupSignal);
        try {
            const initializeReply = await this.postJsonRpc('initialize', {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: CLIENT_INFO,
            }, scope.signal);
            // The server may have created a session even when the remaining metadata is rejected.
            // Keep it before validation and disposal checks so close() can still delete this exact session.
            if (initializeReply.sessionId) this.sessionId = initializeReply.sessionId;
            if (this.disposed) throw new Error(CLOSED_MESSAGE);

            const negotiatedVersion = this.readNegotiatedVersion(initializeReply.result);
            if (!initializeReply.sessionId) {
                throw new Error('Native MCP initialize returned no Mcp-Session-Id; sessionless servers are unsupported');
            }
            this.protocolVersion = negotiatedVersion;
            this.assertCanDiscover(startupSignal);

            await this.postNotification('notifications/initialized', scope.signal);
            this.assertCanDiscover(startupSignal);

            const tools = await this.listAllTools(scope.signal, startupSignal);
            this.assertCanDiscover(startupSignal);
            this.initialized = true;
            return tools;
        } finally {
            scope.release();
        }
    }

    private async listAllTools(signal: AbortSignal, startupSignal: AbortSignal): Promise<NativeMcpTool[]> {
        const tools: NativeMcpTool[] = [];
        const seenCursors = new Set<string>();
        let cursor: string | undefined;

        for (;;) {
            this.assertCanDiscover(startupSignal);
            const reply = await this.postJsonRpc(
                'tools/list',
                cursor === undefined ? {} : { cursor },
                signal,
            );
            this.assertCanDiscover(startupSignal);

            if (!isRecord(reply.result) || !Array.isArray(reply.result.tools)) {
                throw new Error('Native MCP tools/list returned a malformed result');
            }
            for (const entry of reply.result.tools) {
                tools.push(this.readToolMetadata(entry));
            }

            const nextCursor = reply.result.nextCursor;
            if (nextCursor === undefined || nextCursor === null || nextCursor === '') break;
            if (typeof nextCursor !== 'string') {
                throw new Error('Native MCP tools/list returned an invalid cursor');
            }
            if (seenCursors.has(nextCursor)) {
                throw new Error('Native MCP tools/list pagination repeated a cursor');
            }
            seenCursors.add(nextCursor);
            cursor = nextCursor;
        }
        return tools;
    }

    private readToolMetadata(entry: unknown): NativeMcpTool {
        if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.length === 0) {
            throw new Error('Native MCP tools/list returned a tool without a valid name');
        }
        if (entry.description !== undefined && typeof entry.description !== 'string') {
            throw new Error(`Native MCP tool ${entry.name} has an invalid description`);
        }
        if (entry.inputSchema === undefined) {
            throw new Error(`Native MCP tool ${entry.name} is missing inputSchema`);
        }
        return {
            name: entry.name,
            ...(entry.description === undefined ? {} : { description: entry.description }),
            // Schema support belongs to the bridge; this layer only keeps the server value intact.
            inputSchema: entry.inputSchema,
        };
    }

    private readNegotiatedVersion(result: unknown): string {
        if (!isRecord(result) || typeof result.protocolVersion !== 'string') {
            throw new Error('Native MCP initialize returned a malformed result');
        }
        if (result.protocolVersion !== PROTOCOL_VERSION) {
            throw new Error(`Native MCP initialize negotiated unsupported protocol ${result.protocolVersion}`);
        }
        return result.protocolVersion;
    }

    private async postNotification(method: string, signal: AbortSignal): Promise<void> {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: this.jsonHeaders(),
            body: JSON.stringify({ jsonrpc: '2.0', method }),
            credentials: 'same-origin',
            signal,
        });
        if (response.status !== 202) {
            throw new Error(`Native MCP ${method} failed: HTTP ${response.status}`);
        }
    }

    private async postJsonRpc(method: string, params: unknown, signal: AbortSignal): Promise<JsonRpcReply> {
        const id = this.nextRequestId++;
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: this.jsonHeaders(),
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
            credentials: 'same-origin',
            signal,
        });

        if (response.status !== 200) {
            throw new Error(`Native MCP ${method} failed: HTTP ${response.status}`);
        }
        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        if (contentType.includes('text/event-stream')) {
            throw new Error(`Native MCP ${method} returned an SSE response; this client supports only JSON responses`);
        }
        if (!contentType.includes('application/json')) {
            throw new Error(`Native MCP ${method} returned a non-JSON response`);
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new Error(`Native MCP ${method} returned malformed JSON`);
        }
        if (!isRecord(payload) || payload.jsonrpc !== '2.0') {
            throw new Error(`Native MCP ${method} returned a malformed JSON-RPC envelope`);
        }
        if (payload.id !== id) {
            throw new Error(`Native MCP ${method} returned a response for a different request id`);
        }
        if (payload.error !== undefined && payload.error !== null) {
            const error = isRecord(payload.error) ? payload.error : {};
            const code = typeof error.code === 'number' ? ` (${error.code})` : '';
            const message = typeof error.message === 'string' ? error.message : 'unknown error';
            throw new Error(`Native MCP ${method} failed${code}: ${message}`);
        }
        if (!('result' in payload)) {
            throw new Error(`Native MCP ${method} returned neither result nor error`);
        }
        return {
            result: payload.result,
            sessionId: response.headers.get('mcp-session-id'),
        };
    }

    private jsonHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        };
        if (this.sessionId) Object.assign(headers, this.lifecycleHeaders(this.sessionId));
        return headers;
    }

    private lifecycleHeaders(sessionId: string): Record<string, string> {
        const headers: Record<string, string> = { 'Mcp-Session-Id': sessionId };
        if (this.protocolVersion) headers['MCP-Protocol-Version'] = this.protocolVersion;
        return headers;
    }

    /** One request owns the abort listeners it adds; release removes them and stops tracking it. */
    private beginRequest(startupSignal?: AbortSignal): RequestScope {
        const controller = new AbortController();
        const sources = startupSignal ? [this.lifetime, startupSignal] : [this.lifetime];
        const cancel = () => controller.abort(abortError('Native MCP request was cancelled'));

        for (const source of sources) {
            if (source.aborted) cancel();
            else source.addEventListener('abort', cancel, { once: true });
        }
        this.pendingRequests.add(controller);

        return {
            signal: controller.signal,
            release: () => {
                for (const source of sources) source.removeEventListener('abort', cancel);
                this.pendingRequests.delete(controller);
            },
        };
    }

    private assertCanDiscover(startupSignal: AbortSignal): void {
        if (this.disposed) throw new Error(CLOSED_MESSAGE);
        if (startupSignal.aborted) throw abortError('Native MCP startup was cancelled');
    }

    private dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.initialized = false;
        this.lifetime.removeEventListener('abort', this.onLifetimeAbort);
        for (const pending of this.pendingRequests) {
            pending.abort(abortError(CLOSED_MESSAGE));
        }
        this.pendingRequests.clear();
    }

    private async finish(): Promise<void> {
        this.dispose();

        // dispose() keeps the session; capture it before clearing so cleanup can use it after a lifetime abort.
        const sessionId = this.sessionId;
        this.sessionId = null;
        if (!sessionId) return;

        // Cleanup is independent of the already-aborted lifetime and must not delay startup readiness.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(abortError('Native MCP cleanup timed out')), CLEANUP_TIMEOUT_MS);
        try {
            await fetch(ENDPOINT, {
                method: 'DELETE',
                headers: this.lifecycleHeaders(sessionId),
                credentials: 'same-origin',
                signal: controller.signal,
            });
        } catch {
            // Best effort: the host may already be shutting down, and no retry is safe here.
        } finally {
            clearTimeout(timer);
        }
    }
}
