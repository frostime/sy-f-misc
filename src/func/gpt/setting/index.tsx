/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:20
 * @FilePath     : /src/func/gpt/setting/index.tsx
 * @LastEditTime : 2024-12-22 13:53:51
 * @Description  : 
 */
import { thisPlugin } from "@frostime/siyuan-plugin-kits";

import { useModel, defaultConfig, providers, save, load } from "./store";
import ChatSetting from "./ChatSetting";


/**
 * 指定设置默认的配置
 */
const GlobalSetting = () => {
    return (
        <div class={'config__tab-container'} data-name="gpt" style={{width: '100%'}}>

            <ChatSetting config={defaultConfig} onClose={() => {
                save(thisPlugin());
            }} />
        </div>
    );
}

export {
    useModel,
    defaultConfig,
    providers,
    save,
    load,
    ChatSetting,
    GlobalSetting
}
