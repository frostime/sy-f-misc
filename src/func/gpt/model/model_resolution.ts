/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/model_resolution.ts
 * @LastEditTime : 2025-12-10
 * @Description  : Model lookup and endpoint resolution logic
 */

import { DEFAULT_CHAT_ENDPOINT, trimTrailingSlash, ensureLeadingSlash } from "./url_utils";
import { defaultModelId, llmProviders } from "./state";

const siyuanModel = (): IRuntimeLLM & {
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
export const useModel = (bareId: ModelBareId, error: 'throw' | 'null' = 'throw'): IRuntimeLLM => {
    const targetId = (bareId || '').trim() || defaultModelId();
    if (targetId === 'siyuan') {
        return siyuanModel();
    }
    // const { provider, model } = findModelConfigById(targetId);
    const [modelName, providerName] = targetId.split('@');
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
        url: resolveEndpointUrl(provider, model.type),
        apiKey: provider.apiKey,
        config: model,
        provider: provider
    };
}


export const checkSupportsModality = (modelInput: ILLMConfigV2 | ModelBareId, modality: LLMModality, direction: 'input' | 'output' = 'input') => {
    let modelConfig: ILLMConfigV2 | null = null;
    if (typeof modelInput === 'string') {
        const model = useModel(modelInput, 'null');
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


export const checkSupportToolcall = (modelInput: ILLMConfigV2 | ModelBareId) => {
    let modelConfig: ILLMConfigV2 | null = null;
    if (typeof modelInput === 'string') {
        const model = useModel(modelInput, 'null');
        modelConfig = model?.config || null;
    } else {
        modelConfig = modelInput;
    }
    if (!modelConfig) {
        return false;
    }

    return modelConfig.capabilities?.tools === true;
}
