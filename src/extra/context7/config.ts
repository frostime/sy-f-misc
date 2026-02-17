import { thisPlugin } from "@frostime/siyuan-plugin-kits";

export type Context7ResponseType = 'json' | 'txt';

export interface IContext7ClientConfig {
    apiKey: string;
    baseUrl: string;
    defaultType: Context7ResponseType;
    timeoutMs: number;
    histories: Array<{ libraryId: string; usage: number; }>;
}

const STORAGE_NAME = 'context7.config.json';

const defaultConfig: IContext7ClientConfig = {
    apiKey: '',
    baseUrl: 'https://context7.com/api/v2',
    defaultType: 'json',
    timeoutMs: 20000,
    histories: [],
};

let cache: IContext7ClientConfig = { ...defaultConfig };
let loaded = false;
let loadingPromise: Promise<void> | null = null;

const normalizeBaseUrl = (baseUrl: string) => {
    const value = String(baseUrl || '').trim();
    if (!value) return defaultConfig.baseUrl;
    return value.replace(/\/+$/, '');
};

const normalize = (partial: Partial<IContext7ClientConfig>): Partial<IContext7ClientConfig> => {
    const next: Partial<IContext7ClientConfig> = {};

    if (partial.apiKey !== undefined) {
        next.apiKey = String(partial.apiKey || '').trim();
    }
    if (partial.baseUrl !== undefined) {
        next.baseUrl = normalizeBaseUrl(partial.baseUrl);
    }
    if (partial.defaultType !== undefined) {
        next.defaultType = partial.defaultType === 'txt' ? 'txt' : 'json';
    }
    if (partial.timeoutMs !== undefined) {
        const timeout = Number(partial.timeoutMs);
        next.timeoutMs = Number.isFinite(timeout) && timeout >= 1000 ? Math.floor(timeout) : defaultConfig.timeoutMs;
    }

    if (partial.histories !== undefined) {
        const raw = Array.isArray(partial.histories) ? partial.histories : [];
        const merged = new Map<string, number>();

        for (const item of raw) {
            const libraryId = String(item?.libraryId || '').trim();
            if (!libraryId) continue;
            const usage = Number(item?.usage);
            const prev = merged.get(libraryId) ?? 0;
            const nextUsage = Number.isFinite(usage) && usage > 0 ? Math.floor(usage) : 1;
            merged.set(libraryId, prev + nextUsage);
        }

        next.histories = Array.from(merged.entries())
            .map(([libraryId, usage]) => ({ libraryId, usage }))
            .sort((a, b) => b.usage - a.usage)
            .slice(0, 10);
    }

    return next;
};

const ensureLoaded = async () => {
    if (loaded) return;
    if (loadingPromise) {
        await loadingPromise;
        return;
    }

    const plugin = thisPlugin();
    loadingPromise = (async () => {
        const stored = await plugin.loadData(STORAGE_NAME);
        if (stored && typeof stored === 'object') {
            cache = {
                ...defaultConfig,
                ...normalize(stored as Partial<IContext7ClientConfig>),
            };
        } else {
            cache = { ...defaultConfig };
        }
        loaded = true;
    })();

    try {
        await loadingPromise;
    } finally {
        loadingPromise = null;
    }
};

export const loadContext7ClientConfig = async (): Promise<IContext7ClientConfig> => {
    await ensureLoaded();
    return { ...cache };
};

export const patchContext7ClientConfig = async (partial: Partial<IContext7ClientConfig>, persist = true) => {
    await ensureLoaded();
    cache = {
        ...cache,
        ...normalize(partial),
    };

    if (persist) {
        const plugin = thisPlugin();
        await plugin.saveData(STORAGE_NAME, cache);
    }

    return { ...cache };
};

export const recordContext7LibraryHistory = async (libraryId: string) => {
    const cleanId = String(libraryId || '').trim();
    if (!cleanId) {
        const config = await loadContext7ClientConfig();
        return config.histories;
    }

    const config = await loadContext7ClientConfig();
    const merged = new Map<string, number>();

    for (const item of config.histories) {
        const id = String(item?.libraryId || '').trim();
        if (!id) continue;
        merged.set(id, Math.max(1, Number(item?.usage) || 1));
    }

    merged.set(cleanId, (merged.get(cleanId) ?? 0) + 1);

    const histories = Array.from(merged.entries())
        .map(([libraryId, usage]) => ({ libraryId, usage }))
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 10);

    await patchContext7ClientConfig({ histories }, true);
    return histories;
};
