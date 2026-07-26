/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/storage.ts
 * @LastEditTime : 2025-12-10
 * @Description  : Save/load configuration and custom script tools
 */

import type { Plugin } from "siyuan";
import { debounce, deepMerge, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { loadAndCacheCustomScriptTools } from "../tools/custom-program-tools";
import { 
    defaultModelId, 
    defaultConfig, 
    globalMiscConfigs, 
    llmProviders, 
    UIConfig, 
    promptTemplates, 
    toolsManager,
    asStorage 
} from "./config";
import { CURRENT_SCHEMA, 历史版本兼容 } from "./config_migration";
import { loadCustomPreprocessModule, loadCustomContextProviderModule } from "./module_loading";

export const GPT_SETTINGS_FILE = 'gpt.config.json';

export const getRuntimeSettingsSnapshot = () => asStorage(CURRENT_SCHEMA);

const save_ = async (plugin?: Plugin) => {
    plugin = plugin ?? thisPlugin();
    await plugin.saveData(GPT_SETTINGS_FILE, getRuntimeSettingsSnapshot());
}

export const save = debounce(save_, 2000);

export const applyStoredSettingsToRuntime = async (
    stored: Record<string, unknown> | undefined,
    plugin?: Plugin
) => {
    if (!stored) return;

    const compatibilityResult = 历史版本兼容(stored, GPT_SETTINGS_FILE);
    const current = deepMerge(getRuntimeSettingsSnapshot(), compatibilityResult.data);

    current.defaultModel && defaultModelId(current.defaultModel);
    current.config && defaultConfig(current.config);
    current.globalMiscConfigs && globalMiscConfigs(current.globalMiscConfigs);
    if (Array.isArray(current.llmProviders)) {
        llmProviders(current.llmProviders);
    }
    current.ui && UIConfig(current.ui);
    current.promptTemplates && promptTemplates(current.promptTemplates);
    if (current.toolsManager) {
        current.toolsManager.toolPermissionOverrides ??= {};
        toolsManager(current.toolsManager);
    }

    if (compatibilityResult.migrated) {
        await save_(plugin);
    }
}

export const loadStartupExtensions = async () => {
    await Promise.all([
        loadCustomPreprocessModule(),
        loadCustomContextProviderModule()
    ]);

    if (globalMiscConfigs().enableCustomScriptTools) {
        await loadCustomScriptTools();
    } else {
        console.log('自定义脚本工具功能已禁用，跳过加载');
    }
}

export const load = async (plugin?: Plugin) => {
    plugin = plugin ?? thisPlugin();
    const stored = await plugin.loadData(GPT_SETTINGS_FILE);
    await applyStoredSettingsToRuntime(stored, plugin);
    await loadStartupExtensions();
}

/**
 * 加载自定义脚本工具
 */
export const loadCustomScriptTools = async () => {
    try {
        const result = await loadAndCacheCustomScriptTools();
        if (result.success) {
            if (result.reparsedCount > 0) {
                console.log(`成功加载 ${result.moduleCount} 个自定义脚本模块，包含 ${result.toolCount} 个工具（重新解析了 ${result.reparsedCount} 个脚本）`);
            } else {
                console.log(`成功加载 ${result.moduleCount} 个自定义脚本模块，包含 ${result.toolCount} 个工具（所有脚本都是最新的）`);
            }
        } else {
            console.error('加载自定义脚本工具失败:', result.error);
        }
        return result.success;
    } catch (error) {
        console.error('Failed to load custom script tools:', error);
        return false;
    }
};