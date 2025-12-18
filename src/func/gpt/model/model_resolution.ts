/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/model_resolution.ts
 * @LastEditTime : 2025-12-18 16:09:38
 * @Description  : Model lookup and endpoint resolution logic
 */

import { OPENAI_ENDPONITS, trimTrailingSlash, ensureLeadingSlash } from "./url_utils";
import { defaultModelId, llmProviders } from "./state";

/**
 * 解析 bareId 格式
 * @param bareId - model@provider 或 model@provider:type
 * @returns 解析后的对象
 */
const parseBareId = (bareId: string): {
    modelName: string;
    providerName: string;
    serviceType?: LLMServiceType;
} => {
    const colonIndex = bareId.lastIndexOf(':');
    const atIndex = bareId.lastIndexOf('@');

    if (colonIndex > atIndex && colonIndex !== -1) {
        // 包含 type: model@provider:type
        const modelProvider = bareId.substring(0, colonIndex);
        const serviceType = bareId.substring(colonIndex + 1) as LLMServiceType;
        const [modelName, providerName] = modelProvider.split('@');
        return { modelName, providerName, serviceType };
    } else {
        // 不包含 type: model@provider
        const [modelName, providerName] = bareId.split('@');
        return { modelName, providerName };
    }
};

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
        apiKey: apiKey,
        type: 'chat'  // 思源内置模型默认为 chat 类型
    }
}

const ModelTypeName: Record<LLMServiceType, string> = {
    chat: '对话',
    embeddings: '嵌入',
    'audio-stt': '语音转文字',
    'audio-tts': '文字转语音',
    'image-gen': '图像生成',
    'image-edit': '图像编辑',
    moderation: '内容审核'
}


export const listAvialableModels = (): Record<string, string> => {
    const availableModels: Record<string, string> = {
        'siyuan': '思源内置模型'
    };
    llmProviders().forEach((provider) => {
        if (provider.disabled) return;
        provider.models?.forEach((modelConfig) => {
            if (modelConfig.disabled === true) return;

            // 将 type 统一处理为数组
            const types = Array.isArray(modelConfig.type)
                ? modelConfig.type
                : [modelConfig.type];

            // 遍历每个 type，生成对应的 modelId
            types.forEach(type => {
                if (type === 'embeddings') return;

                // 如果是单 type，使用旧格式；多 type 则附加 :type
                const modelId = types.length === 1
                    ? `${modelConfig.model}@${provider.name}`
                    : `${modelConfig.model}@${provider.name}:${type}`;

                const displayName = modelConfig.displayName ?? modelConfig.model;
                availableModels[modelId] = `(${provider.name}) ${displayName} | ${ModelTypeName[type]}`;
            });
        });
    });
    return availableModels;
}



export const resolveEndpointUrl = (provider: ILLMProviderV2, type: LLMServiceType = 'chat') => {
    const endpoint = provider.endpoints?.[type] || OPENAI_ENDPONITS[type];
    const normalizedBase = trimTrailingSlash(provider.baseUrl || '');
    const normalizedPath = ensureLeadingSlash(endpoint);
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

    // 解析 bareId
    const { modelName, providerName, serviceType } = parseBareId(targetId);

    if (!modelName || !providerName) {
        if (error === 'throw') {
            throw new Error(`Invalid model ID: ${bareId}`);
        } else {
            return null;
        }
    }

    const provider = llmProviders().find(item => item.name === providerName);
    const modelConfig = provider?.models?.find(item => item.model === modelName);

    if (!provider || !modelConfig) {
        if (error === 'throw') {
            throw new Error(`Model not found: ${bareId}`);
        } else {
            return null;
        }
    }

    // 确定实际使用的 type
    let actualType: LLMServiceType;
    const supportedTypes = Array.isArray(modelConfig.type)
        ? modelConfig.type
        : [modelConfig.type];

    if (serviceType) {
        // bareId 中明确指定了 type
        if (!supportedTypes.includes(serviceType)) {
            if (error === 'throw') {
                throw new Error(`Model ${modelName} does not support type ${serviceType}`);
            } else {
                return null;
            }
        }
        actualType = serviceType;
    } else {
        // 未指定 type，使用默认（第一个或唯一的）
        actualType = supportedTypes[0];
    }

    return {
        bareId: targetId,
        model: modelConfig.model,
        type: actualType,
        url: resolveEndpointUrl(provider, actualType),
        apiKey: provider.apiKey,
        config: modelConfig,
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
