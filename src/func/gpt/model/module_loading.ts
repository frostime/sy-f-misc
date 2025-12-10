/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/model/module_loading.ts
 * @LastEditTime : 2025-12-10
 * @Description  : Custom preprocessor and context provider loading
 */

import { createJavascriptFile, importJavascriptFile } from "@frostime/siyuan-plugin-kits";
import { userCustomizedPreprocessor } from "../openai/adpater";

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