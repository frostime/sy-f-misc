/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/config_migration.ts
 * @LastEditTime : 2026-02-09 15:50:16
 * @Description  : Schema version comparison and legacy data migration (internal)
 */

import { confirmDialog, deepMerge } from "@frostime/siyuan-plugin-kits";
import { createModelConfig } from "./preset";
import { trimTrailingSlash, ensureLeadingSlash, splitLegacyProviderUrl, DEFAULT_CHAT_ENDPOINT } from "./url_utils";
import { asStorage } from "./config";
import { encodeApiKeyIfPlain } from "./obfuscate";

export const CURRENT_SCHEMA = '3.6';

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
    const originalConfig = (data as any).config;
    const originalMisc = (data as any).globalMiscConfigs;
    const originalPrivacyValues = {
        configEnable: originalConfig?.enablePrivacyMask,
        configFields: originalConfig?.privacyFields,
        miscEnable: originalMisc?.enablePrivacyMask,
        miscFields: originalMisc?.privacyFields,
        miscKeywords: originalMisc?.privacyKeywords,
        miscMask: originalMisc?.privacyMask,
    };
    let migrated = false;

    if (compareSchemaVersion(dataSchema, CURRENT_SCHEMA) === 0) {
        return { data, migrated, privacyMaskRemovalNotice: false };
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
                    protocol: 'openai',
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

    // 3.0 版本: 向后兼容 schema <= 2.1; 变更: 彻底清理工具权限配置，移除所有旧格式字段
    if (compareSchemaVersion(dataSchema, '3.0') < 0) {
        const toolsManagerConfig = (data as any).toolsManager;

        if (toolsManagerConfig && toolsManagerConfig.toolPermissionOverrides) {
            console.log('[工具权限迁移 V3] 开始彻底清理工具权限配置...');

            const overrides = toolsManagerConfig.toolPermissionOverrides;
            let migratedCount = 0;
            let cleanedCount = 0;

            for (const [toolName, config] of Object.entries(overrides) as [string, any][]) {
                // 确定 executionPolicy
                let executionPolicy: 'auto' | 'ask-once' | 'ask-always' = 'auto';

                if (config.executionPolicy !== undefined) {
                    // 如果已有新字段，直接使用
                    executionPolicy = config.executionPolicy;
                } else if (config.requireExecutionApproval === false) {
                    // 旧字段：requireExecutionApproval = false → auto
                    executionPolicy = 'auto';
                } else {
                    // 根据 permissionLevel 转换
                    const level = config.permissionLevel || 'public';
                    switch (level) {
                        case 'public':
                            executionPolicy = 'auto';
                            break;
                        case 'moderate':
                            executionPolicy = 'ask-once';
                            break;
                        case 'sensitive':
                            executionPolicy = 'ask-always';
                            break;
                        default:
                            executionPolicy = 'auto';
                    }
                }

                // 确定 resultApprovalPolicy
                let resultApprovalPolicy: 'never' | 'on-error' | 'always' = 'never';

                if (config.resultApprovalPolicy !== undefined) {
                    // 如果已有新字段，直接使用
                    resultApprovalPolicy = config.resultApprovalPolicy;
                } else if (config.requireResultApproval === true) {
                    // 旧字段：requireResultApproval = true → always
                    resultApprovalPolicy = 'always';
                } else {
                    resultApprovalPolicy = 'never';
                }

                // 彻底替换为纯净的新格式（删除所有旧字段）
                const hadOldFields = config.permissionLevel !== undefined ||
                                    config.requireExecutionApproval !== undefined ||
                                    config.requireResultApproval !== undefined;

                overrides[toolName] = {
                    executionPolicy,
                    resultApprovalPolicy
                };

                if (hadOldFields) {
                    cleanedCount++;
                }
                migratedCount++;
            }

            toolsManagerConfig.toolPermissionOverrides = overrides;

            // 删除旧的 permissionSchemaVersion 字段（不再使用）
            if (toolsManagerConfig.permissionSchemaVersion !== undefined) {
                delete toolsManagerConfig.permissionSchemaVersion;
                console.log('[工具权限迁移 V3] 已删除 permissionSchemaVersion 字段');
            }

            console.log(`[工具权限迁移 V3] 完成: 共处理 ${migratedCount} 个工具，清理旧字段 ${cleanedCount} 个`);
            migrated = true;
        }
    }

    // 3.1 版本: 向后兼容 schema <= 3.0; 变更: Provider 协议字段（protocol/protocal）
    if (compareSchemaVersion(dataSchema, '3.1') < 0) {
        const providers = (data as any).llmProviders as ILLMProviderV2[];
        if (Array.isArray(providers)) {
            providers.forEach((provider) => {
                const raw = (provider.protocol || provider.protocal || 'openai').toLowerCase();
                const normalized = raw === 'anthropic' ? 'claude' : raw;
                const protocol = ['openai', 'claude', 'gemini'].includes(normalized) ? normalized : 'openai';
                provider.protocol = protocol as LLMProviderProtocol;
                provider.protocal = protocol as LLMProviderProtocol;
            });
            migrated = true;
        }
    }

    // 3.2 版本: 向后兼容 schema <= 3.1; 变更:
    //   a. chatOptionToggles: 旧 chatOption 有实值的 key 全部 toggle=true（旧行为不变）
    //   b. capabilities.reasoningEffort → options.compat.thinking.enabled
    //   c. options.unsupported → options.compat.unsupported（不删除旧字段）
    if (compareSchemaVersion(dataSchema, '3.2') < 0) {
        const config = (data as any).config;
        if (config?.chatOption && !config.chatOptionToggles) {
            const toggles: Record<string, boolean> = {};
            for (const key of Object.keys(config.chatOption)) {
                if (config.chatOption[key] !== undefined && config.chatOption[key] !== null) {
                    toggles[key] = true;
                }
            }
            config.chatOptionToggles = toggles;
        }

        const llmProviders = (data as any).llmProviders as ILLMProviderV2[];
        if (Array.isArray(llmProviders)) {
            llmProviders.forEach((provider) => {
                (provider.models || []).forEach((model) => {
                    const modelOptions = (model as any).options;
                    if (!modelOptions) return;

                    // capabilities.reasoningEffort → options.compat.thinking.enabled
                    if ((model as any).capabilities?.reasoningEffort) {
                        modelOptions.compat = modelOptions.compat || {};
                        modelOptions.compat.thinking = modelOptions.compat.thinking || {};
                        modelOptions.compat.thinking.enabled = true;
                        // 保留 capabilities.reasoningEffort，不删除
                    }

                    // options.unsupported → options.compat.unsupported
                    if (Array.isArray(modelOptions.unsupported) && modelOptions.unsupported.length
                        && !(modelOptions.compat?.unsupported?.length)) {
                        modelOptions.compat = modelOptions.compat || {};
                        modelOptions.compat.unsupported = [...modelOptions.unsupported];
                        // 保留旧字段，不删除
                    }
                });
            });
        }

        migrated = true;
    }

    // ========== Add new migration here when schema increase ==========

    // 3.3 版本: 向后兼容 schema <= 3.2; 变更: API key 混淆存储 (见 model/obfuscate.ts)
    // 将明文 key 字段就地加密; 已是密文 (encodeApiKeyIfPlain 内部自校验跳过) 或空值原样通过。
    if (compareSchemaVersion(dataSchema, '3.3') < 0) {
        const misc = (data as any).globalMiscConfigs as Record<string, unknown> | undefined;
        if (misc) {
            for (const key of ['tavilyApiKey', 'bochaApiKey', 'googleApiKey', 'CustomScriptEnvVars'] as const) {
                if (typeof misc[key] === 'string' && misc[key]) {
                    misc[key] = encodeApiKeyIfPlain(misc[key] as string);
                }
            }
        }
        const providers = (data as any).llmProviders as ILLMProviderV2[];
        if (Array.isArray(providers)) {
            providers.forEach((provider) => {
                if (typeof provider.apiKey === 'string' && provider.apiKey) {
                    provider.apiKey = encodeApiKeyIfPlain(provider.apiKey);
                }
            });
        }
        // 值级别转换完成即视为迁移 (无论是否存在 key, 版本号统一推进)
        migrated = true;
    }

    // 3.4 版本: 向后兼容 schema <= 3.3; 变更: 删除旧设置 toolCallMode
    // 新生成统一按 Standard(原生工具消息)持久化与回放。该字段只存在于 gpt.config.json 的 config 中，
    // 会话历史文件不含它，因此这里只清字段，不改动已保存的会话记录与历史 Legacy 记录的读取。
    if (compareSchemaVersion(dataSchema, '3.4') < 0) {
        const config = (data as any).config;
        if (config && config.toolCallMode !== undefined) {
            console.log(`[GPT 配置迁移] 删除旧设置 toolCallMode=${config.toolCallMode}；新生成使用 Standard，历史记录按原内容读取`);
            delete config.toolCallMode;
        }
        // 与 3.3 一致: 即使没有旧字段也推进版本号，避免每次启动重复进入迁移分支
        migrated = true;
    }

    let privacyMaskRemovalNotice = false;
    if (compareSchemaVersion(dataSchema, '3.5') < 0) {
        const config = (data as any).config;
        const misc = (data as any).globalMiscConfigs;
        privacyMaskRemovalNotice = originalPrivacyValues.configEnable === true
            || originalPrivacyValues.miscEnable === true
            || (typeof originalPrivacyValues.miscKeywords === 'string' && originalPrivacyValues.miscKeywords.trim().length > 0)
            || config?.enablePrivacyMask === true
            || (typeof misc?.privacyKeywords === 'string' && misc.privacyKeywords.trim().length > 0);
        // Earlier schema migrations may move or derive these fields. Restore every original value and location.
        const migratedConfig = (data as any).config;
        const migratedMisc = (data as any).globalMiscConfigs;
        for (const [key, configValue, miscValue] of [
            ['enablePrivacyMask', originalPrivacyValues.configEnable, originalPrivacyValues.miscEnable],
            ['privacyFields', originalPrivacyValues.configFields, originalPrivacyValues.miscFields],
        ] as const) {
            if (configValue !== undefined && migratedConfig) migratedConfig[key] = configValue;
            else if (miscValue !== undefined && migratedConfig) delete migratedConfig[key];
        }
        for (const [key, value] of [
            ['enablePrivacyMask', originalPrivacyValues.miscEnable],
            ['privacyFields', originalPrivacyValues.miscFields],
            ['privacyKeywords', originalPrivacyValues.miscKeywords],
            ['privacyMask', originalPrivacyValues.miscMask],
        ] as const) {
            if (value !== undefined && migratedMisc) migratedMisc[key] = value;
        }
        (data as any).removedFeatures = {
            ...((data as any).removedFeatures || {}),
            privacyMask: true,
        };
        migrated = true;
    }

    // 3.6 版本: 向后兼容 schema <= 3.5; 变更: 模型标价的计价单位由「每 1K tokens」改为「每 1M tokens」
    //   a. price.inputPerK / outputPerK → inputPerM / outputPerM（×1000），并删除旧键
    //   b. V2 的价格 UI 一直处于隐藏状态，但 V1→V2 迁移会把当时的预设（部分带 per-K 价目）写进配置，
    //      所以历史配置里确实可能存在旧键；不迁移等于静默丢失标价。
    if (compareSchemaVersion(dataSchema, '3.6') < 0) {
        const providers = (data as any).llmProviders as ILLMProviderV2[] | undefined;
        for (const provider of providers ?? []) {
            for (const model of provider.models ?? []) {
                const price = (model as any).price as Record<string, number> | undefined;
                if (!price) continue;
                const { inputPerK, outputPerK } = price;
                if (inputPerK === undefined && outputPerK === undefined) continue;
                if (typeof inputPerK === 'number' && price.inputPerM === undefined) {
                    price.inputPerM = inputPerK * 1000;
                }
                if (typeof outputPerK === 'number' && price.outputPerM === undefined) {
                    price.outputPerM = outputPerK * 1000;
                }
                delete price.inputPerK;
                delete price.outputPerK;
            }
        }
        // 没有旧字段也推进版本号，避免每次启动重复进入迁移分支
        migrated = true;
    }

    // Guard: 仅当 schema 版本确实低于 CURRENT_SCHEMA 时才写入（防止意外降级）
    if (compareSchemaVersion(dataSchema, CURRENT_SCHEMA) < 0) {
        (data as any).schema = CURRENT_SCHEMA;
    }
    return { data, migrated, privacyMaskRemovalNotice };
}
