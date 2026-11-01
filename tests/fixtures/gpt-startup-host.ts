/**
 * Host boundary for tests/gpt-startup.test.ts.
 *
 * Real code under test: src/func/gpt/index.ts (startup owner), tools/native-mcp/index.ts
 * and tools/native-mcp/client.ts. Replaced here: SiYuan plugin/window/Tab/Dock APIs,
 * ChatSession + solid render, the GPT settings/persistence/chat-in-doc modules, the
 * extension loader and the /mcp HTTP endpoint.
 */

import type FMiscPlugin from '../../src/index';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

export const deferred = <T = void>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
};

export type FakeContainer = { textContent: string; style: Record<string, string>; closest: () => null };
export const container = (): FakeContainer => ({ textContent: '', style: {}, closest: () => null });

type CustomTabOptions = { tabId: string; render: (target: FakeContainer) => void; beforeDestroy: () => void };

export const host = {
    frontend: 'desktop',
    tabs: [] as CustomTabOptions[],
    windowTabs: [] as any[],
    docks: [] as any[],
    mounts: [] as { container: FakeContainer; disposed: boolean }[],
    messages: [] as string[],
    settingsProps: {} as { onRetryNativeMcp?: () => Promise<void> },
    // Host commands survive the GPT feature toggle; retain registrations between activations/tests.
    commands: [] as { owner: unknown; id: string }[],
};

/** GPT settings read by the startup extension callback. */
export const miscConfig = { pinChatDock: false };

const pluginBoundary = {
    name: 'fixture-plugin',
    app: {},
    eventBus: { on: () => {}, off: () => {} },
    addIcons: () => {},
    addTab: (options: any) => { host.windowTabs.push(options); },
    addDock: (options: any) => { host.docks.push(options); },
    addCommand(options: { langKey: string }) { host.commands.push({ owner: this, id: options.langKey }); },
    registerMenuTopMenu: () => {},
    registerOnClickDocIcon: () => () => {},
    getOpenedTab: () => ({}),
};
/** Startup only touches these host methods; the real instance carries 60+ unrelated members. */
export const plugin = pluginBoundary as unknown as FMiscPlugin;
export const thisPlugin = () => plugin;

export const getFrontend = () => host.frontend;
export const showMessage = (message: string) => { host.messages.push(message); };
export const openTab = async (_options: unknown) => ({ headElement: null });
export const openWindow = () => {};

/** Retains Tab callbacks so a test can invoke them later, as the host does on re-attach. */
export const openCustomTab = async (options: CustomTabOptions) => {
    host.tabs.push(options);
    return { headElement: null };
};

/** A mount record is the "ChatSession was constructed" signal used by the tests. */
export const ChatSession = () => {};
export const render = (factory: () => unknown, target: FakeContainer) => {
    factory();
    const mount = { container: target, disposed: false };
    host.mounts.push(mount);
    return () => { mount.disposed = true; };
};

export const extensionGates: Deferred<void>[] = [];
export const loadStartupExtensions = () => {
    const gate = deferred<void>();
    extensionGates.push(gate);
    return gate.promise;
};
export const lastExtensionGate = () => extensionGates[extensionGates.length - 1];

// Remaining boundaries are unreachable in these startup scenarios; failing loudly beats silence.
export const inputDialog = () => { throw new Error('Unexpected input dialog'); };
export const complete = async () => { throw new Error('Unexpected model request'); };
export const GPT_SETTINGS_FILE = 'gpt-settings.json';
export const getRuntimeSettingsSnapshot = () => ({});
export const applyStoredSettingsToRuntime = () => {};
export const globalMiscConfigs = () => miscConfig;
export const translateHotkey = (hotkey: string) => hotkey;
export const GlobalSetting = (props: typeof host.settingsProps) => { host.settingsProps = props; return null; };
export const solidDialog = () => ({ close: () => {} });
export const HistoryList = () => null;
export default HistoryList; // ./chat/components/HistoryList is the only default-imported boundary
export const showMessageLog = () => {};
export const openManualExecutePanel = () => {};
export const id2block = async () => [];
export const init = () => {};
export const destroy = () => {};
export const ATTR_GPT_EXPORT_DOC = 'custom-gpt-export-doc';
export const restoreCache = async () => {};
export const updateCacheFile = async () => {};
export const getFromJson = async () => undefined;
export const importChatHistoryFile = () => {};
export const parseMarkdownToChatHistory = () => undefined;

export const fetchState = {
    calls: [] as string[],
    initializeGate: null as Deferred<void> | null,
    initializeFailures: 0,
    tools: [{ name: 'system', description: '思源原生工具', inputSchema: { type: 'object', properties: {} } }],
};

/** Holds the initialize response so a test decides when the activation may finish. */
export const holdInitialize = () => {
    fetchState.calls.length = 0;
    const gate = deferred<void>();
    fetchState.initializeGate = gate;
    return gate;
};
export const releaseInitialize = () => { fetchState.initializeGate = null; };

const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

const waitForGate = (signal: AbortSignal): Promise<void> => {
    const gate = fetchState.initializeGate;
    if (!gate) return Promise.resolve();
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(abortError());
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
        void gate.promise.then(resolve);
    });
};

const json = (payload: unknown, sessionId?: string) => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) },
});

const nativeFetch = globalThis.fetch;

const installFetch = () => {
    (globalThis as any).fetch = async (_url: string, init: any) => {
        if (init.method === 'DELETE') {
            fetchState.calls.push('DELETE');
            return new Response(null, { status: 204 });
        }
        const request = JSON.parse(init.body);
        fetchState.calls.push(request.method);
        if (request.method === 'initialize') {
            if (fetchState.initializeFailures > 0) {
                fetchState.initializeFailures--;
                return new Response(null, { status: 503 });
            }
            await waitForGate(init.signal);
            return json({
                jsonrpc: '2.0',
                id: request.id,
                result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'siyuan', version: '3.8.8' } },
            }, 'fixture-session');
        }
        if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
        if (request.method === 'tools/list') return json({ jsonrpc: '2.0', id: request.id, result: { tools: fetchState.tools } });
        throw new Error(`Unexpected MCP request ${request.method}`);
    };
};

export const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export const installHost = () => {
    host.frontend = 'desktop';
    for (const list of [host.tabs, host.windowTabs, host.docks, host.mounts]) list.length = 0;
    miscConfig.pinChatDock = false;
    host.messages.length = 0;
    host.settingsProps = {};
    extensionGates.length = 0;
    fetchState.calls.length = 0;
    fetchState.initializeGate = null;
    fetchState.initializeFailures = 0;

    (globalThis as any).fmisc = {};
    (globalThis as any).window = { getSelection: () => null };
    (globalThis as any).document = { querySelector: () => null, querySelectorAll: () => [] };
    installFetch();
};

/** Call after unloading GPT: restoring fetch first would send the session DELETE to the network. */
export const uninstallHost = () => {
    (globalThis as any).fetch = nativeFetch;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).fmisc;
    for (const list of [host.tabs, host.windowTabs, host.docks, host.mounts]) list.length = 0;
};
