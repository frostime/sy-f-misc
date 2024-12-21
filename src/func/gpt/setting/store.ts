/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:03
 * @FilePath     : /src/func/gpt/setting/store.ts
 * @LastEditTime : 2024-12-21 13:05:58
 * @Description  : 
 */
import type { Plugin } from "siyuan";
import { useStoreRef } from "@frostime/solid-signal-ref";
import { unwrap } from "solid-js/store";

import { debounce, deepMerge, thisPlugin } from "@frostime/siyuan-plugin-kits";


export const defaultConfig = useStoreRef<IChatSessionConfig>({
    attachedHistory: 3,
    temperature: 1
});


export const providers = useStoreRef<IGPTProvider[]>([]);

/**
 * 返回可以用于保存为 json 的配置信息
 * @returns 
 */
const asStorage = () => {
    //BUG 不知道为啥似乎 unwrap 对 ref 不起作用，可能是 lib 的 bug
    let cData = unwrap(defaultConfig.store);
    let pData= unwrap(providers.store);
    return {
        config: {...cData},
        providers: {...pData}
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


/**
 * 
 * @param id: `modelName@providerName` | 'siyuan'
 * @returns 
 */
export const useModel = (id: string) => {
    if (id === 'siyuan') {
        return useStoreRef(siyuanModel());
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
        throw new Error('Model not found');
    }
    return useStoreRef({
        model: modelName,
        url: provider.url,
        apiKey: provider.apiKey
    });
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
        defaultConfig(current.config);
        providers(current.providers);
        console.debug('Load GPT config:', current);
    }
}
