import { thisPlugin } from "@frostime/siyuan-plugin-kits";

// InsertMode is intentionally type-only: it narrows isInsertMode() and is erased at build.
import type { QuickInputConfig, QuickInputTemplate, InsertMode, DeclaredInputType, DeclaredVar } from "./types";

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

const isDeclaredInputType = (type: unknown): type is DeclaredInputType => {
    return type === 'text' || type === 'textarea' || type === 'number' || type === 'checkbox' || type === 'select';
};

const normalizeDeclaredValue = (type: DeclaredInputType, value: unknown) => {
    if (type === 'checkbox') return Boolean(value);
    if (type === 'number') {
        if (value === '' || value === undefined || value === null) return '';
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : '';
    }
    return value === undefined || value === null ? '' : String(value);
};

const normalizeOptions = (value: unknown): Record<string, string> | undefined => {
    if (!isObject(value)) return undefined;
    const entries = Object.entries(value)
        .map(([key, optionValue]) => [key.trim(), String(optionValue ?? key)] as const)
        .filter(([key]) => key.length > 0);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeDeclaredVar = (value: unknown): DeclaredVar | null => {
    if (!isObject(value) || !isDeclaredInputType(value.type)) return null;
    const key = String(value.key ?? '').trim();
    if (!key) return null;

    const field: DeclaredVar = {
        key,
        type: value.type,
        label: value.label ? String(value.label) : undefined,
        value: normalizeDeclaredValue(value.type, value.value),
        placeholder: value.placeholder ? String(value.placeholder) : undefined,
        description: value.description ? String(value.description) : undefined
    };

    if (value.type === 'select') field.options = normalizeOptions(value.options) ?? {};
    if (value.type === 'number') {
        if (typeof value.min === 'number') field.min = value.min;
        if (typeof value.max === 'number') field.max = value.max;
        if (typeof value.step === 'number') field.step = value.step;
    }

    return field;
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
        declaredInputVar: Array.isArray(value.declaredInputVar)
            ? value.declaredInputVar.map(normalizeDeclaredVar).filter((field): field is DeclaredVar => field !== null)
            : [],
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
