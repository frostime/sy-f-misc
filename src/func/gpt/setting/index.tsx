/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:20
 * @FilePath     : /src/func/gpt/setting/index.tsx
 * @LastEditTime : 2024-12-22 15:03:56
 * @Description  : 
 */
import { thisPlugin } from "@frostime/siyuan-plugin-kits";

// import { useModel, defaultConfig, providers, save, load } from "./store";
import * as store from "./store";
import ChatSetting from "./ChatSetting";
import ProviderSetting from "./ProviderSetting";
import { onCleanup } from "solid-js";


/**
 * 指定设置默认的配置
 */
const GlobalSetting = () => {
    onCleanup(() => {
        store.save(thisPlugin());
    });
    return (
        <div class={'config__tab-container'} data-name="gpt" style={{ width: '100%' }}>
            <ChatSetting config={store.defaultConfig} />
            <ProviderSetting />
        </div>
    );
}

export {
    ChatSetting,
    GlobalSetting
}
export * from "./store";
