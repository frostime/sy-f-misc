// 在 src/func/gpt/tools/vars/ 中添加新文件: manager.ts

import { VariableSystem, VAR_TYPE_ENUM } from './core';

/**
 * Vars Manager 的自定义 SDK
 */
export interface VarsManagerSdk {
    getVarTypes(): typeof VAR_TYPE_ENUM;
    listVariables(): Promise<Array<{
        name: string;
        type: typeof VAR_TYPE_ENUM[number];
        length: number;
        desc?: string;
        tags?: string[];
        created: string;
        updated: string;
        lastVisited: string;
        referenceCount: number;
        keep: boolean;
    }>>;
    getVariable(name: string): Promise<{
        ok: boolean;
        data?: {
            name: string;
            type: string;
            value: string;
            desc?: string;
            tags?: string[];
            created: string;
            updated: string;
            lastVisited: string;
            referenceCount: number;
            keep: boolean;
        };
        error?: string;
    }>;
    addVariable(name: string, value: string, type: typeof VAR_TYPE_ENUM[number], desc?: string, tags?: string[]): Promise<{ ok: boolean; error?: string }>;
    updateVariable(name: string, updates: { value?: string; type?: typeof VAR_TYPE_ENUM[number]; desc?: string; tags?: string[]; keep?: boolean; }): Promise<{ ok: boolean; error?: string }>;
    deleteVariable(name: string): Promise<{ ok: boolean; error?: string }>;
    clearByType(type: 'RULE' | 'ToolCallCache' | 'MessageCache' | 'LLMAdd' | 'ALL'): Promise<{ ok: boolean; removed: number; error?: string; }>;
    getStats(): Promise<{ total: number; byType: Record<string, number>; totalSize: number; keepCount: number; }>;
    searchVariables(query: string): Promise<Array<any>>;
}

export function createVarsManagerSdk(varSystem: VariableSystem): VarsManagerSdk {
    return {
        getVarTypes: () => VAR_TYPE_ENUM,
        listVariables: async () => {
            const vars = varSystem.listVariables();
            return vars.map(v => ({
                name: v.name,
                type: v.type,
                length: v.value.length,
                desc: v.desc,
                tags: v.tags,
                created: v.created.toISOString(),
                updated: v.updated.toISOString(),
                lastVisited: v.lastVisited.toISOString(),
                referenceCount: v.referenceCount || 0,
                keep: v.keep || false
            }));
        },
        getVariable: async (name: string) => {
            const variable = varSystem.getVariable(name, false);
            if (!variable) {
                return { ok: false, error: `Variable '${name}' not found` };
            }
            return {
                ok: true,
                data: {
                    name: variable.name,
                    type: variable.type,
                    value: variable.value,
                    desc: variable.desc,
                    tags: variable.tags,
                    created: variable.created.toISOString(),
                    updated: variable.updated.toISOString(),
                    lastVisited: variable.lastVisited.toISOString(),
                    referenceCount: variable.referenceCount || 0,
                    keep: variable.keep || false
                }
            };
        },
        addVariable: async (name: string, value: string, type: typeof VAR_TYPE_ENUM[number], desc?: string, tags?: string[]) => {
            const existing = varSystem.getVariable(name, false);
            if (existing) {
                return { ok: false, error: `Variable '${name}' already exists` };
            }
            varSystem.addVariable(name, value, type, desc, tags);
            return { ok: true };
        },
        updateVariable: async (name: string, updates) => {
            const variable = varSystem.getVariable(name, false);
            if (!variable) {
                return { ok: false, error: `Variable '${name}' not found` };
            }
            varSystem.updateVariable(name, updates);
            return { ok: true };
        },
        deleteVariable: async (name: string) => {
            const variable = varSystem.getVariable(name);
            if (!variable) {
                return { ok: false, error: `Variable '${name}' not found` };
            }
            if (variable.keep) {
                return { ok: false, error: 'Cannot delete protected variable' };
            }
            const success = varSystem.removeVariable(name);
            return success ? { ok: true } : { ok: false, error: 'Failed to delete variable' };
        },
        clearByType: async (type) => {
            let removed = 0;
            if (type === 'ALL') {
                const beforeCount = varSystem.varQueue.length;
                varSystem.varQueue = varSystem.varQueue.filter(v => v.keep);
                removed = beforeCount - varSystem.varQueue.length;
            } else {
                const toRemove = varSystem.searchVariables(v => v.type === type && !v.keep);
                toRemove.forEach(v => varSystem.removeVariable(v.name));
                removed = toRemove.length;
            }
            return { ok: true, removed };
        },
        getStats: async () => {
            const vars = varSystem.listVariables();
            const byType: Record<string, number> = { RULE: 0, ToolCallCache: 0, MessageCache: 0, LLMAdd: 0 };
            let totalSize = 0;
            let keepCount = 0;
            vars.forEach(v => {
                byType[v.type] = (byType[v.type] || 0) + 1;
                totalSize += v.value.length;
                if (v.keep) keepCount++;
            });
            return { total: vars.length, byType, totalSize, keepCount };
        },
        searchVariables: async (query: string) => {
            const lowerQuery = query.toLowerCase();
            const vars = varSystem.listVariables();
            return vars.filter(v => v.name.toLowerCase().includes(lowerQuery) || v.desc?.toLowerCase().includes(lowerQuery) || v.value.toLowerCase().includes(lowerQuery)).map(v => ({
                name: v.name,
                type: v.type,
                length: v.value.length,
                desc: v.desc,
                tags: v.tags,
                created: v.created.toISOString(),
                updated: v.updated.toISOString(),
                lastVisited: v.lastVisited.toISOString(),
                referenceCount: v.referenceCount || 0,
                keep: v.keep || false
            }));
        }
    };
}
