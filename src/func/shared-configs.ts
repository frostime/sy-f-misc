import { createSettingAdapter } from "@frostime/siyuan-plugin-kits";
import { importJavascriptFile, createJavascriptFile, thisPlugin } from "@frostime/siyuan-plugin-kits";

export let name = "global-configs";
export let enabled = true;

interface IDefaultConfigs {
    codeEditor: string;
}

const configDefinitions = [
    {
        key: 'codeEditor',
        type: 'textinput' as const,
        value: 'code',
        title: '打开代码编辑器',
        description: '在本地打开代码文件的命令; 默认为 code, 表示使用 vs code 打开',
        devicewise: true
    }
]

const configAdapter = createSettingAdapter(configDefinitions);

// Optional: Declare simple module config
export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "global-configs",
    title: "公用配置",
    load: (itemValues: any) => {
        configAdapter.init(itemValues);
    },
    dump: () => {
        return configAdapter.dump();
    },
    items: configDefinitions.map(item => {
        return {
            ...item,
            get: () => configAdapter.get(item.key),
            set: (value: any) => configAdapter.set(item.key, value)
        }
    }),
};

export const sharedConfigs = (key: keyof IDefaultConfigs) => {
    return configAdapter.get(key);
};

// User custom constants functionality
export const userConstJsName = 'custom.user-constants.js';

const DEFAULT_USER_CONST_CODE = `
/**
 * User custom constants
 * Define your own constants here and they will be merged with the default ones
 */

const userConstants = {
    // Add your custom constants here
};

export default userConstants;
`.trimStart();

// Default constants that will be merged with user constants
export const defaultConstants = {
    promptSummarize: ``
};

// The merged constants that will be used throughout the application
export let userConst: typeof defaultConstants = { ...defaultConstants };

/**
 * Load user custom constants from JS file
 * If the file doesn't exist, create a default one
 */
const reloadUserConstants = async (): Promise<void> => {
    try {
        const module = await importJavascriptFile(userConstJsName);
        if (!module) {
            // Create default JS file if it doesn't exist
            createJavascriptFile(DEFAULT_USER_CONST_CODE, userConstJsName);
            return;
        }
        // Merge user constants with default constants
        const userConstants: Record<string, any> = module.default;
        userConst = { ...defaultConstants, ...userConstants };
        console.log('User constants loaded:', userConst);
    } catch (error) {
        console.error('Failed to load user constants:', error);
    }
};

export const load = async () => {
    await reloadUserConstants();
    // #if [PRIVATE_ADD]
    globalThis.fmisc['reloadUserConstants'] = reloadUserConstants;
    // #endif
};

export const unload = () => {
    // Reset to default constants when unloaded
    userConst = { ...defaultConstants };
};
