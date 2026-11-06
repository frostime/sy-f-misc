/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/index.ts
 * @LastEditTime : 2025-12-10
 * @Description  : Barrel export file - public API
 */

// State management
export {
    defaultModelId,
    defaultConfig,
    providers,
    visualModel,
    llmProviders,
    UIConfig,
    promptTemplates,
    globalMiscConfigs,
    toolsManager
} from './config';

// Model resolution
export {
    listAvialableModels,
    listAvailableModelEntries,
    entryLabel,
    resolveEndpointUrl,
    useModel,
    checkSupportsModality
} from './model_resolution';
export type { IAvailableModelEntry } from './model_resolution';

// 展示层纯函数（价格文本 / 分组 / 比价），ModelPicker 与设置页共用
export {
    formatModelPrice,
    fullPriceText,
    compactPriceText,
    currencySymbol,
    groupModelEntries,
    filterModelEntries,
    compareSameModel,
    capabilitiesOf,
    contextText,
    hasPrice
} from './model_entry_view';

// Storage
export {
    GPT_SETTINGS_FILE,
    getRuntimeSettingsSnapshot,
    applyStoredSettingsToRuntime,
    loadStartupExtensions,
    save,
    load,
    loadCustomScriptTools
} from './storage';

// Module loading
export {
    preprocessModuleJsName,
    contextProviderModuleJsName,
    loadCustomPreprocessModule,
    customContextProviders,
    loadCustomContextProviderModule
} from './module_loading';

// Re-export preset for convenience
export { createModelConfig } from './preset';