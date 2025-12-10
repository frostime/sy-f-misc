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
} from './state';

// Model resolution
export {
    listAvialableModels,
    resolveEndpointUrl,
    useModel,
    checkSupportsModality
} from './model_resolution';

// Storage
export {
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