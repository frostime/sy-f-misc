/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/config_migration.ts
 * @LastEditTime : 2025-12-31 18:35:57
 * @Description  : Schema version comparison and legacy data migration (internal)
 */

import { confirmDialog, deepMerge } from "@frostime/siyuan-plugin-kits";
import { createModelConfig } from "./preset";
import { trimTrailingSlash, ensureLeadingSlash, splitLegacyProviderUrl, DEFAULT_CHAT_ENDPOINT } from "./url_utils";
import { asStorage } from "./config";

export const CURRENT_SCHEMA = '2.1';

export const compareSchemaVersion = (a?: string, b?: string) => {
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

export const 历史版本兼容 = (data: object | ReturnType<typeof asStorage>, StoreName: string) => {
    const dataSchema = (data as any).schema as string | undefined;
    let migrated = false;

    if (compareSchemaVersion(dataSchema, CURRENT_SCHEMA) === 0) {
        return { data, migrated };
    }

    // 1.5 版本: 向后兼容 schema <= 1.4; 变更:  modelId -> defaultModelId
    if (compareSchemaVersion(dataSchema, '1.5') < 0) {
        if ((data as any).config && (data as any).config.modelId) {
            (data as any).config.defaultModelId = (data as any).config.modelId;
            console.log('历史版本兼容: 迁移 modelId 到 defaultModelId');
            delete (data as any).config.modelId;
            migrated = true;
        }
    }

    // 1.6 版本: 向后兼容 schema <= 1.5; 变更: autoTitleModelId -> utilityModelId
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

    // 2.0 版本: 向后兼容 schema < 2.0; 变更: provider 和 model 配置大改, IGPTProvider --> ILLMProviderV2
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

        /**
         * Migrate legacy privacy configuration (privacyKeywords) to new IPrivacyField[]
         */
        const migrateLegacyPrivacy = () => {
            const globalMiscConfigs = (data as any).globalMiscConfigs;
            if (!globalMiscConfigs) return false;

            const legacyKeywords = globalMiscConfigs.privacyKeywords;
            if (!legacyKeywords || typeof legacyKeywords !== 'string') return false;

            console.log('[GPT 配置迁移] 开始迁移旧版隐私配置...');

            const keywords = legacyKeywords.trim().split('\n').filter((k: string) => k.trim());
            if (keywords.length === 0) return false;

            // 转换为新格式 - 所有关键词合并到一个 Field
            const privacyFields: any[] = [{
                patterns: keywords.map((k: string) => k.trim()),
                isRegex: false,
                maskType: 'custom' as const,
                enabled: true,
                description: `从旧配置迁移 (${keywords.length} 个关键词)`
            }];

            globalMiscConfigs.privacyFields = privacyFields;
            globalMiscConfigs.enablePrivacyMask = keywords.length > 0; // 如果有关键词，默认启用

            console.log(`[GPT 配置迁移] 成功迁移 ${keywords.length} 个隐私关键词到新格式`);
            // 保留旧字段以防降级，但标记已迁移
            return true;
        };
        migrateLegacyPrivacy();
    }

    // 2.1 版本: 向后兼容 schema <= 2.0; 变更: 隐私配置从 globalMiscConfigs 移到 defaultConfig
    if (compareSchemaVersion(dataSchema, '2.1') < 0) {
        const globalMiscConfigs = (data as any).globalMiscConfigs;
        const config = (data as any).config;

        if (globalMiscConfigs && config) {
            // 迁移隐私配置到会话级别
            if (globalMiscConfigs.enablePrivacyMask !== undefined) {
                config.enablePrivacyMask = globalMiscConfigs.enablePrivacyMask;
                delete globalMiscConfigs.enablePrivacyMask;
            }
            if (globalMiscConfigs.privacyFields !== undefined) {
                config.privacyFields = globalMiscConfigs.privacyFields;
                delete globalMiscConfigs.privacyFields;
            }

            console.log('[GPT 配置迁移] 隐私配置已从全局移至会话级别');
        }
    }
    migrated = true;
    (data as any).schema = CURRENT_SCHEMA;
    return { data, migrated };
}