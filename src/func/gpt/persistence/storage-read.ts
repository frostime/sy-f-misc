/*
 * @Description: Read-only helpers for GPT persistence files.
 * Desktop uses Node fs first; non-desktop falls back to SiYuan file API.
 * Writes/deletes must still go through SiYuan API.
 */

import { api, thisPlugin } from "@frostime/siyuan-plugin-kits";

type StorageDirItem = {
    name: string;
    isDir: boolean;
};

const getNodeModule = <T = any>(name: string): T | null => {
    try {
        return (window as any)?.require?.(name) ?? require(name);
    } catch {
        return null;
    }
};

const normalizeStoragePath = (path: string): string => {
    const pluginName = thisPlugin().name;
    return path
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^data\/storage\/petal\/[^/]+\/?/, '')
        .replace(new RegExp(`^storage/petal/${pluginName}/?`), '')
        .replace(/\/+$/, '');
};

const toApiPath = (path: string): string => {
    const relativePath = normalizeStoragePath(path);
    return `data/storage/petal/${thisPlugin().name}/${relativePath}`;
};

const toNodePath = (path: string): string | null => {
    const nodePath = getNodeModule<any>('path');
    const dataDir: string | undefined = (window as any)?.siyuan?.config?.system?.dataDir;
    if (!nodePath || !dataDir) return null;

    const relativePath = normalizeStoragePath(path);
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
        const blob = await api.getFileBlob(toApiPath(path));
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

const listStorageDirWithNodeFs = (path: string): StorageDirItem[] | null => {
    const nodeFs = getNodeModule<any>('fs');
    const dirPath = toNodePath(path);
    if (!nodeFs || !dirPath) return null;

    try {
        if (!nodeFs.existsSync(dirPath)) return null;
        return nodeFs.readdirSync(dirPath, { withFileTypes: true }).map((entry: { name: string; isDirectory: () => boolean }) => ({
            name: entry.name,
            isDir: entry.isDirectory()
        }));
    } catch {
        return null;
    }
};

const listStorageDirWithSiyuanApi = async (path: string): Promise<StorageDirItem[] | null> => {
    try {
        const files = await api.readDir(`${toApiPath(path)}/`);
        if (!files) return null;
        return files.map(f => ({ name: f.name, isDir: f.isDir }));
    } catch {
        return null;
    }
};

export const listStorageDir = async (path: string): Promise<StorageDirItem[]> => {
    return listStorageDirWithNodeFs(path) ?? await listStorageDirWithSiyuanApi(path) ?? [];
};
