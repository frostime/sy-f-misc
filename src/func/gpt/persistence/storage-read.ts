/*
 * @Description: Read-only helpers for GPT persistence files.
 * Desktop uses Node fs first; non-desktop falls back to SiYuan file API.
 * Writes/deletes must still go through SiYuan API.
 */

import { api, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { request } from "@frostime/siyuan-plugin-kits/api";

type StorageDirItem = {
    name: string;
    isDir: boolean;
};

export type StorageDirResult =
    | { status: 'ok'; items: StorageDirItem[] }
    | { status: 'missing'; items: [] }
    | { status: 'failed'; items: [] };

const getNodeModule = <T = any>(name: string): T | null => {
    try {
        return (window as any)?.require?.(name) ?? require(name);
    } catch {
        return null;
    }
};

const escapeRegExp = (text: string): string => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const normalizeStoragePath = (path: string): string | null => {
    const pluginName = thisPlugin().name;
    const normalized = path
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^data\/storage\/petal\/[^/]+\/?/, '')
        .replace(new RegExp(`^storage/petal/${escapeRegExp(pluginName)}/?`), '')
        .replace(/\/+$/, '');

    if (/^[a-zA-Z]:/.test(normalized)) return null;

    const parts = normalized.split('/').filter(Boolean);
    if (parts.some(part => part === '.' || part === '..')) return null;

    return parts.join('/');
};

const toApiPath = (path: string): string | null => {
    const relativePath = normalizeStoragePath(path);
    if (relativePath === null) return null;
    return `data/storage/petal/${thisPlugin().name}/${relativePath}`;
};

const toNodePath = (path: string): string | null => {
    const nodePath = getNodeModule<any>('path');
    const dataDir: string | undefined = (window as any)?.siyuan?.config?.system?.dataDir;
    if (!nodePath || !dataDir) return null;

    const relativePath = normalizeStoragePath(path);
    if (relativePath === null) return null;
    return nodePath.join(dataDir, 'storage', 'petal', thisPlugin().name, ...relativePath.split('/'));
};

const readTextWithNodeFs = (path: string): string | null => {
    const nodeFs = getNodeModule<any>('fs');
    const filePath = toNodePath(path);
    if (!nodeFs || !filePath) return null;

    try {
        if (!nodeFs.existsSync(filePath)) return null;
        return nodeFs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
};

const readTextWithSiyuanApi = async (path: string): Promise<string | null> => {
    try {
        const apiPath = toApiPath(path);
        if (!apiPath) return null;
        const blob = await api.getFileBlob(apiPath);
        if (!blob) return null;
        return await blob.text();
    } catch {
        return null;
    }
};

export const readStorageJson = async <T = unknown>(path: string): Promise<T | null> => {
    const text = readTextWithNodeFs(path) ?? await readTextWithSiyuanApi(path);
    if (!text) return null;

    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
};

const listStorageDirWithNodeFs = (path: string): StorageDirResult | null => {
    const nodeFs = getNodeModule<any>('fs');
    const dirPath = toNodePath(path);
    if (!nodeFs || !dirPath) return null;

    try {
        if (!nodeFs.existsSync(dirPath)) return { status: 'missing', items: [] };
        const stat = nodeFs.statSync(dirPath);
        if (!stat.isDirectory()) return { status: 'failed', items: [] };
        const items = nodeFs.readdirSync(dirPath, { withFileTypes: true }).map((entry: { name: string; isDirectory: () => boolean }) => ({
            name: entry.name,
            isDir: entry.isDirectory()
        }));
        return { status: 'ok', items };
    } catch {
        return { status: 'failed', items: [] };
    }
};

const listStorageDirWithSiyuanApi = async (path: string): Promise<StorageDirResult> => {
    try {
        const apiPath = toApiPath(path);
        if (!apiPath) return { status: 'failed', items: [] };
        const response = await request('/api/file/readDir', { path: `${apiPath}/` }, 'response') as {
            code: number;
            data?: Array<{ name: string; isDir: boolean }>;
        };
        if (response.code === 0) {
            return {
                status: 'ok',
                items: (response.data ?? []).map(f => ({ name: f.name, isDir: f.isDir }))
            };
        }
        if (response.code === 404) return { status: 'missing', items: [] };
        return { status: 'failed', items: [] };
    } catch {
        return { status: 'failed', items: [] };
    }
};

export const listStorageDirResult = async (path: string): Promise<StorageDirResult> => {
    const nodeResult = listStorageDirWithNodeFs(path);
    if (nodeResult?.status === 'ok') return nodeResult;

    const apiResult = await listStorageDirWithSiyuanApi(path);
    if (apiResult.status === 'ok') return apiResult;
    if (apiResult.status === 'missing' && (!nodeResult || nodeResult.status === 'missing')) {
        return { status: 'missing', items: [] };
    }

    return { status: 'failed', items: [] };
};

export const listStorageDir = async (path: string): Promise<StorageDirItem[]> => {
    const result = await listStorageDirResult(path);
    return result.status === 'ok' ? result.items : [];
};
