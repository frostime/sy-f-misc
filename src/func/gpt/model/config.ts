/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/state.ts
 * @LastEditTime : 2025-12-10
 * @Description  : Reactive configuration state management
 */

import { useSignalRef, useStoreRef } from "@frostime/solid-signal-ref";
import { IPrivacyField } from '../privacy/types';

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
    enablePrivacyMask: false, // 是否启用隐私屏蔽
    privacyFields: [] as IPrivacyField[], // 隐私字段配置
    chatOption: {
        temperature: 0.7,
        stream: true,
        max_tokens: 4096,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    }
});


//@deprecated; 2.0 之前用这个, 2.0 之后改为 llmProviders
export const providers = useStoreRef<IGPTProvider[]>([]);
//@deprecated; 视觉模型, 可以发送图片; 2.0 之后废弃
export const visualModel = useSignalRef<string[]>(['gpt-4o-mini']);

export const llmProviders = useStoreRef<ILLMProviderV2[]>([]);

export const UIConfig = useStoreRef({
    inputFontsize: 20,
    msgFontsize: 19,
    maxWidth: 1250
});

export const promptTemplates = useStoreRef<IPromptTemplate[]>([]);


const _defaultGlobalMiscConfigs = {
    pinChatDock: false,
    userSelectedContextFormat: `**以下是用户附带的内容**:
------
{{content}}
`.trim(),
    privacyKeywords: '',  // @deprecated 多行隐私关键词，已迁移到 privacyFields
    privacyMask: '***',   // @deprecated 隐私词替换为，已废弃
    defaultSystemPrompt: `You are a helpful assistant.`,
    enableMessageLogger: false,
    maxMessageLogItems: 500,
    tavilyApiKey: '',      // Tavily API Key for web search
    bochaApiKey: '',       // 博查 API Key for web search
    googleApiKey: '',     // Google Custom Search API Key  获取方式：https://console.cloud.google.com/
    googleSearchEngineId: '', // Google Custom Search Engine ID   https://programmablesearchengine.google.com/
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
        // 新格式字段（优先使用）
        executionPolicy?: 'auto' | 'ask-once' | 'ask-always';
        resultApprovalPolicy?: 'never' | 'on-error' | 'always';

        // 旧格式字段（向后兼容）
        permissionLevel?: 'public' | 'moderate' | 'sensitive';
        requireExecutionApproval?: boolean;
        requireResultApproval?: boolean;
    }>;
    // 权限配置 schema 版本
    permissionSchemaVersion?: number;
}>({
    groupDefaults: {},
    toolDefaults: {},
    toolPermissionOverrides: {},
    permissionSchemaVersion: 1  // 1 = 旧格式，2 = 新格式
});

/**
 * 返回可以用于保存为 json 的配置信息
 * @returns
 * @internal - Not exported from index.ts
 */
export const asStorage = (CURRENT_SCHEMA: string) => {
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
