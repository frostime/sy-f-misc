import { thisPlugin } from "@frostime/siyuan-plugin-kits";

import type { QuickInputConfig, QuickInputTemplate, InsertMode } from "./types";

const CONFIG_KEY = 'quick-input';
const STORAGE_FILE = 'custom-module.config.json';

const DEFAULT_CONFIG: QuickInputConfig = {
    templates: []
};

let config: QuickInputConfig = structuredClone(DEFAULT_CONFIG);

const isObject = (value: unknown): value is Record<string, any> => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const isInsertMode = (mode: unknown): mode is InsertMode => {
    return mode === 'append' || mode === 'prepend' || mode === 'before' || mode === 'after';
};

const normalizeTemplate = (value: unknown): QuickInputTemplate | null => {
    if (!isObject(value) || !isObject(value.insertTo)) return null;

    let insertTo: QuickInputTemplate['insertTo'];
    if (value.insertTo.type === 'document') {
        insertTo = {
            type: 'document',
            notebook: String(value.insertTo.notebook ?? ''),
            hpath: String(value.insertTo.hpath ?? '')
        };
    } else if (value.insertTo.type === 'block') {
        insertTo = {
            type: 'block',
            anchorId: String(value.insertTo.anchorId ?? ''),
            mode: isInsertMode(value.insertTo.mode) ? value.insertTo.mode : 'append',
            notebook: value.insertTo.notebook ? String(value.insertTo.notebook) : undefined
        };
    } else {
        return null;
    }

    return {
        id: String(value.id || crypto.randomUUID()),
        name: String(value.name || '未命名模板'),
        icon: value.icon ? String(value.icon) : undefined,
        group: value.group ? String(value.group) : undefined,
        insertTo,
        template: typeof value.template === 'string' ? value.template : '',
        declaredInputVar: Array.isArray(value.declaredInputVar) ? value.declaredInputVar : [],
        openBlock: value.openBlock ?? true,
        preExecuteScript: typeof value.preExecuteScript === 'string' ? value.preExecuteScript : undefined,
        postExecuteScript: typeof value.postExecuteScript === 'string' ? value.postExecuteScript : undefined,
        createdAt: typeof value.createdAt === 'number' ? value.createdAt : undefined,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined
    };
};

export const normalizeConfig = (value?: unknown): QuickInputConfig => {
    const source = Array.isArray(value)
        ? value
        : isObject(value) && Array.isArray(value.templates)
            ? value.templates
            : [];

    return {
        templates: source
            .map(normalizeTemplate)
            .filter((template): template is QuickInputTemplate => template !== null)
    };
};

export const getTemplates = (): QuickInputTemplate[] => {
    return structuredClone(config.templates);
};

export const saveTemplates = async (templates: QuickInputTemplate[]) => {
    config = normalizeConfig({ templates });

    const plugin = thisPlugin();
    let storage = await plugin.loadData(STORAGE_FILE);
    if (!isObject(storage)) storage = {};
    storage[CONFIG_KEY] = structuredClone(config);
    await plugin.saveData(STORAGE_FILE, storage);
};

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: CONFIG_KEY,
    load: (data) => {
        config = normalizeConfig(data);
    },
    dump: () => structuredClone(config)
};
