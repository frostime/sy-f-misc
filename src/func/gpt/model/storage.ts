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
} from "./state";
import { CURRENT_SCHEMA, 历史版本兼容 } from "./migration";
import { loadCustomPreprocessModule, loadCustomContextProviderModule } from "./module_loading";

const StoreName = 'gpt.config.json';

const save_ = async (plugin?: Plugin) => {
    plugin = plugin ?? thisPlugin();

    let storageData = asStorage(CURRENT_SCHEMA);
    plugin.saveData(StoreName, storageData);
    console.debug('Save GPT config:', storageData);
}

export const save = debounce(save_, 2000);

export const load = async (plugin?: Plugin) => {
    let defaultData = asStorage(CURRENT_SCHEMA);

    plugin = plugin ?? thisPlugin();
    let data = await plugin.loadData(StoreName);
    // data = data;
    let migrated = false;
    if (data) {
        const compatibilityResult = 历史版本兼容(data, StoreName);
        data = compatibilityResult.data;
        migrated = compatibilityResult.migrated;

        let current = deepMerge(defaultData, data);
        current.defaultModel && defaultModelId(current.defaultModel);
        // current.visualModel && visualModel(current.visualModel);
        current.config && defaultConfig(current.config);
        current.globalMiscConfigs && globalMiscConfigs(current.globalMiscConfigs);
        // current.providers && providers(current.providers);
        if (Array.isArray(current.llmProviders)) {
            llmProviders(current.llmProviders);
        }
        current.ui && UIConfig(current.ui)
        current.promptTemplates && promptTemplates(current.promptTemplates)
        console.debug('Load GPT config:', current);
        if (current.toolsManager) {
            // 向后兼容：确保 toolPermissionOverrides 字段存在
            if (!current.toolsManager.toolPermissionOverrides) {
                current.toolsManager.toolPermissionOverrides = {};
            }
            toolsManager(current.toolsManager);
        }
        console.debug('Load GPT config:', current);
    }

    if (migrated) {
        await save_(plugin);
    }

    await Promise.all([
        loadCustomPreprocessModule(),
        loadCustomContextProviderModule()
    ]);

    // 根据开关决定是否加载自定义脚本工具
    if (globalMiscConfigs().enableCustomScriptTools) {
        await loadCustomScriptTools();
    } else {
        console.log('自定义脚本工具功能已禁用，跳过加载');
    }
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