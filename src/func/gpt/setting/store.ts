/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/setting/store.ts
 * @LastEditTime : 2025-06-06 22:19:35
 * @Description  :
 */
import type { Plugin } from "siyuan";
import { useSignalRef, useStoreRef } from "@frostime/solid-signal-ref";

import { confirmDialog, createJavascriptFile, debounce, deepMerge, importJavascriptFile, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { createModelConfig } from "./preset";
// import { toolExecutorFactory } from "../tools";
import { userCustomizedPreprocessor } from "../openai/adpater";
import { loadAndCacheCustomScriptTools } from "../tools/custom-program-tools";

const CURRENT_SCHEMA = '2.0';

const compareSchemaVersion = (a?: string, b?: string) => {
    const normalize = (version?: string) => {
        return (version ?? '0').split('.')
            .map((part) => {
                const parsed = Number.parseInt(part, 10);
                return Number.isNaN(parsed) ? 0 : parsed;
            });
    };

    const versionA = normalize(a);
    const versionB = normalize(b);
    const maxLen = Math.max(versionA.length, versionB.length);

    for (let i = 0; i < maxLen; i++) {
        const diff = (versionA[i] ?? 0) - (versionB[i] ?? 0);
        if (diff !== 0) {
            return diff > 0 ? 1 : -1;
        }
    }
    return 0;
};

/**
 * `siyuan` or `modelName@providerName`
 */
export const defaultModelId = useSignalRef<ModelBareId>('siyuan');



export const defaultConfig = useStoreRef<IChatSessionConfig>({
    attachedHistory: 3,
    convertMathSyntax: true,
    maxInputLenForAutoTitle: 500,
    // autoTitleModelId: '', // 1.6 版本废除改为 utilityModelId, 承担各种繁琐的小任务
    utilityModelId: '',
    renderInStreamMode: true,
    toolCallMaxRounds: 7,
    chatOption: {
        temperature: 0.7,
        stream: true,
        max_tokens: 4096,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    }
});


//@deprecated
export const providers = useStoreRef<IGPTProvider[]>([]);
//@deprecated; 视觉模型, 可以发送图片
export const visualModel = useSignalRef<string[]>(['gpt-4o-mini']);

export const llmProviders = useStoreRef<ILLMProviderV2[]>([]);

export const UIConfig = useStoreRef({
    inputFontsize: 20,
    msgFontsize: 19,
    maxWidth: 1250
});

export const promptTemplates = useStoreRef<IPromptTemplate[]>([]);


const DEFAULT_CHAT_ENDPOINT = '/chat/completions';


/**
 * 确保 url 末尾没有斜杠 /
 */
const trimTrailingSlash = (url?: string) => {
    if (!url) return url;
    return url.replace(/\/+$/, '');
};


/**
 * 确保路径以 / 开头
 */
const ensureLeadingSlash = (path?: string) => {
    if (!path) return path;
    return path.startsWith('/') ? path : `/${path}`;
};

const splitLegacyProviderUrl = (url?: string) => {
    // 按照插件之前的逻辑，旧版本的 url 末尾应该只会是 /chat/completions
    if (!url) {
        return {
            baseUrl: '',
            endpoint: DEFAULT_CHAT_ENDPOINT
        };
    }
    const normalized = url.trim();
    const marker = '/chat/completions';
    const idx = normalized.lastIndexOf(marker);
    if (idx !== -1) {
        const baseUrl = trimTrailingSlash(normalized.slice(0, idx)) || '';
        return {
            baseUrl,
            endpoint: marker
        };
    }
    try {
        const parsed = new URL(normalized);
        const baseUrl = `${parsed.origin}`;
        return {
            baseUrl: trimTrailingSlash(baseUrl + parsed.pathname) || baseUrl,
            endpoint: DEFAULT_CHAT_ENDPOINT
        };
    } catch (error) {
        return {
            baseUrl: trimTrailingSlash(normalized) || '',
            endpoint: DEFAULT_CHAT_ENDPOINT
        };
    }
};


const _defaultGlobalMiscConfigs = {
    pinChatDock: false,
    userSelectedContextFormat: `**以下是用户附带的内容**:
------
{{content}}
`.trim(),
    privacyKeywords: '',  // 多行隐私关键词
    privacyMask: '***',   // 隐私词替换为
    defaultSystemPrompt: `You are a helpful assistant.`,
    enableMessageLogger: false,
    maxMessageLogItems: 500,
    tavilyApiKey: '',      // Tavily API Key for web search
    bochaApiKey: '',       // 博查 API Key for web search
    exportMDSkipHidden: false, // 导出 Markdown 时是否跳过隐藏的消息
    enableCustomScriptTools: false, // 是否启用自定义脚本工具功能
    CustomScriptEnvVars: '' // 自定义脚本工具的环境变量，格式为 KEY=VALUE，每行一个
}
export const globalMiscConfigs = useStoreRef<typeof _defaultGlobalMiscConfigs>(_defaultGlobalMiscConfigs);

// 工具管理器设置
export const toolsManager = useStoreRef<{
    // 工具组默认启用状态
    groupDefaults: Record<string, boolean>;
    // 工具级别的启用状态（按工具名称）
    toolDefaults: Record<string, boolean>;
    // 工具权限覆盖配置
    toolPermissionOverrides: Record<string, {
        permissionLevel?: 'public' | 'moderate' | 'sensitive';
        requireExecutionApproval?: boolean;
        requireResultApproval?: boolean;
    }>;
}>({
    groupDefaults: {},
    toolDefaults: {},
    toolPermissionOverrides: {}
});

/**
 * 返回可以用于保存为 json 的配置信息
 * @returns
 */
const asStorage = () => {
    return {
        schema: CURRENT_SCHEMA,
        defaultModel: defaultModelId.unwrap(),
        config: { ...defaultConfig.unwrap() },
        globalMiscConfigs: { ...globalMiscConfigs.unwrap() },
        llmProviders: [...llmProviders.unwrap()],
        ui: { ...UIConfig.unwrap() },
        promptTemplates: [...promptTemplates.unwrap()],
        toolsManager: { ...toolsManager.unwrap() }
    }
}

const siyuanModel = (): IGPTModel & {
    baseUrl: string;
} => {
    let { apiBaseURL, apiModel, apiKey } = window.siyuan.config.ai.openAI;
    let url = `${apiBaseURL.endsWith('/') ? apiBaseURL : apiBaseURL + '/'}chat/completions`;
    return {
        bareId: 'siyuan',
        url,
        baseUrl: apiBaseURL,
        model: apiModel,
        apiKey: apiKey
    }
}


export const listAvialableModels = (): Record<string, string> => {
    const availableModels: Record<string, string> = {
        'siyuan': '思源内置模型'
    };
    llmProviders().forEach((provider) => {
        if (provider.disabled) return;
        provider.models?.forEach((modelConfig) => {
            const modelId = `${modelConfig.model}@${provider.name}`;
            const displayName = modelConfig.displayName ?? modelConfig.model;
            availableModels[modelId] = `(${provider.name}) ${displayName}`;
        });
    });
    return availableModels;
}



export const resolveEndpointUrl = (provider: ILLMProviderV2, type: LLMServiceType = 'chat') => {
    const path = provider.endpoints?.[type] || provider.endpoints?.chat || DEFAULT_CHAT_ENDPOINT;
    const normalizedBase = trimTrailingSlash(provider.baseUrl || '');
    const normalizedPath = ensureLeadingSlash(path);
    if (!normalizedBase) return normalizedPath;
    return `${normalizedBase}${normalizedPath}`;
};

/**
 *
 * @param bareId: `modelName@providerName` | 'siyuan'
 * @returns
 */
export const useModel = (bareId: ModelBareId, error: 'throw' | 'null' = 'throw'): IGPTModel => {
    const targetId = (bareId || '').trim() || defaultModelId();
    if (targetId === 'siyuan') {
        return siyuanModel();
    }
    // const { provider, model } = findModelConfigById(targetId);
    const [modelName, providerName] = bareId.split('@');
    if (!modelName || !providerName) {
        // return null;
        if (error === 'throw') {
            throw new Error(`Invalid model ID: ${bareId}`);
        } else {
            return null;
        }
    }
    const provider = llmProviders().find(item => item.name === providerName);
    const model = provider?.models?.find(item => item.model === modelName);

    if (!provider || !model) {
        // throw new Error(`Model not found: ${targetId}`);
        if (error === 'throw') {
            throw new Error(`Model not found: ${bareId}`);
        } else {
            return null;
        }
    }
    return {
        bareId: targetId,
        model: model.model,
        modelToUse: model.model,
        url: resolveEndpointUrl(provider, model.type),
        apiKey: provider.apiKey,
        config: model
    };
}


export const checkSupportsModality = (modelInput: ILLMConfigV2 | ModelBareId, modality: LLMModality, direction: 'input' | 'output' = 'input') => {
    let modelConfig: ILLMConfigV2 | null = null;
    if (typeof modelInput === 'string') {
        const model = useModel(modelInput);
        modelConfig = model?.config || null;
    } else {
        modelConfig = modelInput;
    }

    if (!modelConfig || !modelConfig.modalities) {
        return false;
    }

    const list = modelConfig.modalities?.[direction] ?? [];
    return Array.isArray(list) && list.includes(modality);
}


// ==================== Storage To File ====================
//******************** Data IO ********************

const StoreName = 'gpt.config.json';

const save_ = async (plugin?: Plugin) => {
    plugin = plugin ?? thisPlugin();

    let storageData = asStorage();
    plugin.saveData(StoreName, storageData);
    console.debug('Save GPT config:', storageData);
}

export const preprocessModuleJsName = 'gpt.preprocess.js';
export const contextProviderModuleJsName = 'gpt.context-provider.custom.js';

export const loadCustomPreprocessModule = async () => {
    const DEFAULT_CODE = `
/**
 * 用户自定义的预处理器, 可以在发送 complete 请求之前，对消息进行处理
 *
 * 例如: 实现 Deepseek V3 0324 的默认温度缩放; 特别模型不支持 frequency_penalty 等参数需要删除等
 *
 * @param payload - 选项
 * @param payload.model - 模型
 * @param payload.url - API URL
 * @param payload.option - GPT 请求的 option
 * @returns void
 */
const preprocessor = (payload) => {
    // if (payload.option.max_tokens > 4096) {
    //     payload.option.max_tokens = 4096;
    // }
    return;
}
export default preprocessor;

`.trimStart();
    try {
        const module = await importJavascriptFile(preprocessModuleJsName);
        if (!module) {
            createJavascriptFile(DEFAULT_CODE, preprocessModuleJsName);
            return;
        }
        const preprocessor = module?.default;
        if (!preprocessor) return;
        // 检查是否为函数，以及参数等
        if (typeof preprocessor !== 'function') {
            console.error('Custom preprocessor must be a function');
            return;
        }
        userCustomizedPreprocessor.preprocess = preprocessor;
        console.log('成功导入自定义的 ChatOption 预处理器!')
        return true;
    } catch (error) {
        console.error('Failed to load custom preprocessor:', error);
        return false;
    }
}

export const customContextProviders = {
    preprocessProviders: (_providers: CustomContextProvider[]): CustomContextProvider[] | void => { }
}

export const loadCustomContextProviderModule = async () => {
    const DEFAULT_CODE = `
/**
 * 用户自定义的上下文提供器, 用于提供自定义的上下文内容
 *
 * @returns {CustomContextProvider} 返回一个符合 CustomContextProvider 接口的对象
 */
const customContextProvider = {
    name: "CustomProvider",
    displayTitle: "自定义上下文提供器",
    description: "用户自定义的上下文提供器",
    type: "input-area",
    icon: "iconCode",
    getContextItems: async (options) => {
        // 您可以在这里实现自己的逻辑，例如从外部API获取数据，处理本地文件等
        return [{
            name: "自定义上下文",
            description: "这是一个自定义的上下文示例",
            content: options?.query || "这里是自定义上下文的内容"
        }];
    }
};


/**
 * 加载自定义上下文提供器
 * @param {CustomContextProvider[]} providers - 内置的 Context Provider
 */
const loadProviders = (providers) => {
    // 请在这里添加你的自定义上下文提供器
    // providers.push(customContextProvider); // 添加自定义的 Provider
    // providers = providers.filter(p => p.name !== 'TextSearch');  // 去掉不想要的 Provider
    return providers;
}

export default loadProviders;
`.trimStart();

    try {
        const module = await importJavascriptFile(contextProviderModuleJsName);
        if (!module) {
            createJavascriptFile(DEFAULT_CODE, contextProviderModuleJsName);
            return;
        }

        let loader = module?.default as any[];
        if (loader === undefined || loader === null) return;

        // 检查是否为函数
        if (typeof loader !== 'function') {
            console.error('Custom context provider loader must be a function');
            return;
        }

        customContextProviders.preprocessProviders = loader;

        console.log('成功导入自定义的上下文提供器!');
        return true;
    } catch (error) {
        console.error('Failed to load custom context provider:', error);
        return false;
    }
}

const 历史版本兼容 = (data: object | ReturnType<typeof asStorage>) => {
    const dataSchema = (data as any).schema as string | undefined;
    let migrated = false;

    if (compareSchemaVersion(dataSchema, CURRENT_SCHEMA) === 0) {
        return { data, migrated };
    }

    // 1.5 版本: 向后兼容 schema <= 1.4
    if (compareSchemaVersion(dataSchema, '1.5') < 0) {
        if ((data as any).config && (data as any).config.modelId) {
            (data as any).config.defaultModelId = (data as any).config.modelId;
            console.log('历史版本兼容: 迁移 modelId 到 defaultModelId');
            delete (data as any).config.modelId;
            migrated = true;
        }
    }

    // 1.5 版本: 向后兼)

    // 1.6 版本: 向后兼容 schema <= 1.5
    if (compareSchemaVersion(dataSchema, '1.6') < 0) {
        const hasAutoTitleModelId = (data as any).config && (data as any).config.autoTitleModelId !== undefined;
        const donotHasUtilityModelId = (data as any).config && (data as any).config.utilityModelId === undefined;
        if (hasAutoTitleModelId && donotHasUtilityModelId) {
            (data as any).config.utilityModelId = (data as any).config.autoTitleModelId;
            console.log('历史版本兼容: 迁移 autoTitleModelId 到 utilityModelId');
            delete (data as any).config.autoTitleModelId;
            migrated = true;
        }
    }

    if (compareSchemaVersion(dataSchema, '2.0') < 0) {
        const oldData = JSON.parse(JSON.stringify(data));
        confirmDialog({
            title: '配置版本更新',
            content: `GPT/LLM 功能部分有较大更新，配置文件将自动升级，是否将旧配置备份到本地？(如果存在问题可以将文件粘贴到插件设置目录下覆盖新配置文件)`,
            confirm: () => {
                const name = StoreName;
                const blob = new Blob([JSON.stringify(oldData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backup.${name}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });

        /**
         * Transform from old provider to new provider
         * @returns 
         */
        const migrateLegacyProviders = () => {
            console.log('[GPT 配置迁移] 开始迁移旧版 Provider 配置...');
            const legacyProviders = (data as any).providers as IGPTProvider[];
            const legacyVisualModels = (data as any).visualModel as string[];
            console.log(`[GPT 配置迁移] 发现 ${legacyProviders?.length || 0} 个旧版 Provider`);
            if (!Array.isArray(legacyProviders) || legacyProviders.length === 0) {
                return false;
            }
            const visualModelSet = new Set((legacyVisualModels ?? []).map((name) => name?.trim()).filter(Boolean));
            const convertedProviders: ILLMProviderV2[] = legacyProviders.map((legacy, index) => {
                const { baseUrl, endpoint } = splitLegacyProviderUrl(legacy.url);
                const models: ILLMConfigV2[] = (legacy.models ?? []).map((legacyModelName) => {
                    const redirectedName = legacy.redirect?.[legacyModelName] ?? legacyModelName;
                    const preset = createModelConfig(redirectedName);
                    const config = deepMerge({}, preset) as ILLMConfigV2;
                    config.model = redirectedName;
                    if (legacyModelName !== redirectedName) {
                        config.displayName = legacyModelName;
                    }
                    config.modalities = config.modalities || { input: ['text'], output: ['text'] };
                    config.modalities.input = Array.from(new Set([...(config.modalities.input || []), 'text']));
                    config.modalities.output = Array.from(new Set(config.modalities.output || ['text'])) as LLMModality[];
                    if (visualModelSet.has(legacyModelName) || visualModelSet.has(redirectedName)) {
                        if (!config.modalities.input.includes('image')) {
                            config.modalities.input.push('image');
                        }
                    }
                    config.capabilities = config.capabilities || { tools: true, streaming: true };
                    if (config.capabilities.tools === undefined) config.capabilities.tools = true;
                    if (config.capabilities.streaming === undefined) config.capabilities.streaming = true;
                    config.limits = config.limits || {};
                    config.options = config.options || { customOverride: {}, unsupported: [] };
                    return config;
                }).filter(Boolean);
                return {
                    name: legacy.name || `LegacyProvider-${index + 1}`,
                    baseUrl: trimTrailingSlash(baseUrl || legacy.url || '') || '',
                    endpoints: {
                        chat: ensureLeadingSlash(endpoint ?? DEFAULT_CHAT_ENDPOINT) || DEFAULT_CHAT_ENDPOINT
                    },
                    apiKey: legacy.apiKey ?? '',
                    customHeaders: undefined,
                    disabled: legacy.disabled ?? false,
                    models
                } satisfies ILLMProviderV2;
            }).filter((provider) => provider.models?.length);

            if (!convertedProviders.length) {
                return false;
            }
            (data as any).llmProviders = convertedProviders;
            delete (data as any).providers;
            delete (data as any).visualModel;

            const availableIds = new Set<string>();
            convertedProviders.forEach((provider) => {
                provider.models?.forEach((model) => {
                    availableIds.add(`${model.model}@${provider.name}` as ModelBareId);
                });
            });
            if (!(availableIds.has((data as any).defaultModel) || (data as any).defaultModel === 'siyuan')) {
                console.warn('[GPT] legacy 默认模型已失效，自动回退到思源内置模型');
                (data as any).defaultModel = 'siyuan';
            }
            console.log(`[GPT 配置迁移] 成功迁移 ${convertedProviders.length} 个 Provider`);
            return true;
        };
        migrateLegacyProviders();
    }

    migrated = true;

    (data as any).schema = CURRENT_SCHEMA;

    return { data, migrated };
}

export const save = debounce(save_, 2000);
export const load = async (plugin?: Plugin) => {
    let defaultData = asStorage();

    plugin = plugin ?? thisPlugin();
    let data = await plugin.loadData(StoreName);
    data = data;
    let migrated = false;
    if (data) {
        const compatibilityResult = 历史版本兼容(data);
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

