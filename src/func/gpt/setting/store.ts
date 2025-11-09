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

import { createJavascriptFile, debounce, deepMerge, importJavascriptFile, thisPlugin } from "@frostime/siyuan-plugin-kits";
// import { toolExecutorFactory } from "../tools";
import { userCustomizedPreprocessor } from "../openai/adpater";


/**
 * `siyuan` or `modelName@providerName`
 */
export const defaultModelId = useSignalRef<string>('siyuan');

/**
 * 视觉模型, 可以发送图片
 */
export const visualModel = useSignalRef<string[]>(['gpt-4o-mini']);

export const defaultConfig = useStoreRef<IChatSessionConfig>({
    attachedHistory: 3,
    convertMathSyntax: true,
    maxInputLenForAutoTitle: 500,
    autoTitleModelId: '',
    renderInStreamMode: true, // 默认在 stream 模式下渲染 markdown
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
    exportMDSkipHidden: false // 导出 Markdown 时是否跳过隐藏的消息
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

const CURRENT_SCHEMA = '1.0';

/**
 * 返回可以用于保存为 json 的配置信息
 * @returns
 */
const asStorage = () => {
    return {
        schema: CURRENT_SCHEMA,
        defaultModel: defaultModelId.unwrap(),
        visualModel: visualModel.unwrap(),
        config: { ...defaultConfig.unwrap() },
        globalMiscConfigs: { ...globalMiscConfigs.unwrap() },
        providers: [...providers.unwrap()],
        ui: { ...UIConfig.unwrap() },
        promptTemplates: [...promptTemplates.unwrap()],
        toolsManager: { ...toolsManager.unwrap() }
    }
}

const siyuanModel = (): IGPTModel => {
    let { apiBaseURL, apiModel, apiKey } = window.siyuan.config.ai.openAI;
    let url = `${apiBaseURL.endsWith('/') ? apiBaseURL : apiBaseURL + '/'}chat/completions`;
    return {
        url,
        model: apiModel,
        apiKey: apiKey
    }
}


export const listAvialableModels = (): Record<string, string> => {
    let availableModels = {
        'siyuan': '思源内置模型'
    };
    providers().forEach((provider) => {
        if (provider.disabled !== true) {
            provider.models.forEach((model) => {
                availableModels[`${model}@${provider.name}`] = `(${provider.name}) ${model}`;
            });
        }
    });
    return availableModels;
}


/**
 *
 * @param id: `modelName@providerName` | 'siyuan'
 * @returns
 */
export const useModel = (id: string): IGPTModel => {
    if (id === 'siyuan') {
        return siyuanModel();
    }
    let [modelName, providerName] = id.trim().split('@');
    if (!modelName || !providerName) {
        throw new Error('Invalid model name');
    }
    // 在 providers 中查找
    let provider = providers().find(p => p.name === providerName);
    if (!provider) {
        throw new Error('Provider not found');
    }
    if (!provider.models.includes(modelName)) {
        console.warn(`Model ${modelName} not found in provider ${providerName}`);
    }

    let modelToUse = modelName;
    if (provider.redirect && provider.redirect[modelName]) {
        modelToUse = provider.redirect[modelName];
    }
    return {
        modelToUse,
        model: modelName,
        url: provider.url,
        apiKey: provider.apiKey
    };
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
    preprocessProviders: (providers: CustomContextProvider[]): CustomContextProvider[] | void => { }
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

export const save = debounce(save_, 2000);
export const load = async (plugin?: Plugin) => {
    let defaultData = asStorage();

    plugin = plugin ?? thisPlugin();
    let data = await plugin.loadData(StoreName);
    data = data;
    if (data) {
        let current = deepMerge(defaultData, data);
        current.defaultModel && defaultModelId(current.defaultModel);
        current.visualModel && visualModel(current.visualModel);
        current.config && defaultConfig(current.config);
        current.globalMiscConfigs && globalMiscConfigs(current.globalMiscConfigs);
        current.providers && providers(current.providers);
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

    await Promise.all([
        loadCustomPreprocessModule(),
        loadCustomContextProviderModule()
    ]);
}

export const providers = useStoreRef<IGPTProvider[]>([]);
export const UIConfig = useStoreRef({
    inputFontsize: 20,
    msgFontsize: 19,
    maxWidth: 1250
});

export const promptTemplates = useStoreRef<IPromptTemplate[]>([]);
