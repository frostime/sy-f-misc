/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/setting/store.ts
 * @LastEditTime : 2024-12-31 15:39:29
 * @Description  : 
 */
import type { Plugin } from "siyuan";
import { useSignalRef, useStoreRef } from "@frostime/solid-signal-ref";

import { debounce, deepMerge, thisPlugin } from "@frostime/siyuan-plugin-kits";


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
    chatOption: {
        temperature: 0.7,
        stream: true,
        max_tokens: 4096,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    }
});


export const providers = useStoreRef<IGPTProvider[]>([]);


export const UIConfig = useStoreRef({
    inputFontsize: 20,
    msgFontsize: 19,
    maxWidth: 1250
});

export const promptTemplates = useStoreRef<IPromptTemplate[]>([]);

/**
 * 返回可以用于保存为 json 的配置信息
 * @returns 
 */
const asStorage = () => {
    return {
        defaultModel: defaultModelId.unwrap(),
        visualModel: visualModel.unwrap(),
        config: { ...defaultConfig.unwrap() },
        providers: [...providers.unwrap()],
        ui: { ...UIConfig.unwrap() },
        promptTemplates: [...promptTemplates.unwrap()]
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
        provider.models.forEach((model) => {
            availableModels[`${model}@${provider.name}`] = `(${provider.name}) ${model}`;
        });
    });
    return availableModels;
}


/**
 * 
 * @param id: `modelName@providerName` | 'siyuan'
 * @returns 
 */
export const useModel = (id: string) => {
    if (id === 'siyuan') {
        return siyuanModel();
    }
    const [modelName, providerName] = id.trim().split('@');
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
    return {
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
        current.providers && providers(current.providers);
        current.ui && UIConfig(current.ui)
        current.promptTemplates && promptTemplates(current.promptTemplates)
        console.debug('Load GPT config:', current);
    }
}
