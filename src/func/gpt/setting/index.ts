/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:20
 * @FilePath     : /src/func/gpt/setting/index.ts
 * @LastEditTime : 2024-12-21 12:46:27
 * @Description  : 
 */
import { thisPlugin } from "@frostime/siyuan-plugin-kits";

import { useModel, defaultConfig, providers, save, load } from "./store";
import { ChatSessionSetting } from "./components";


/**
 * 指定设置默认的配置
 */
const ChatSessionDefaultSetting = () => {
    return ChatSessionSetting({
        insideTab: true,
        config: defaultConfig,
        onClose: () => {
            save(thisPlugin());
        }
    });
}

export {
    useModel,
    defaultConfig,
    providers,
    save,
    load,
    ChatSessionSetting,
    ChatSessionDefaultSetting
}
