/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-04 17:43:26
 * @FilePath     : /src/settings/index.ts
 * @LastEditTime : 2025-12-20 19:32:05
 * @Description  :
 */
import type FMiscPlugin from '@/index';
import { ModulesAlwaysEnable, ModulesToEnable } from '@/func';

import Settings from "@/settings/settings";
import { solidDialog } from '@/libs/dialog';
import { SettingsPersistence } from './persistence';

// Enable Setting Item 的 key 必须遵守 `Enable${module.name}` 的格式

const Enable: ISettingItem[] = ModulesToEnable.map(module => {
    if (module.declareToggleEnabled === undefined) {
        return {
            type: 'checkbox',
            title: module.name,
            description: `无声明，默认直接启用 ${module.name}`,
            key: `Enable${module.name}`,
            value: true
        }
    }
    return {
        type: 'checkbox',
        title: module.declareToggleEnabled.title,
        description: module.declareToggleEnabled.description,
        key: `Enable${module.name}`,
        value: module.declareToggleEnabled.defaultEnabled ?? false
    };
});

let CustomPanels: {
    key: string;
    title: string;
    element: any;
}[] = [];
[...ModulesAlwaysEnable, ...ModulesToEnable].forEach(module => {
    //@ts-ignore
    if (module?.declareSettingPanel) {
        //@ts-ignore
        CustomPanels.push(...module.declareSettingPanel);
    }
});

let CustomModuleConfigs: IFuncModule['declareModuleConfig'][] = [];
[...ModulesAlwaysEnable, ...ModulesToEnable].forEach(module => {
    if (module?.declareModuleConfig) {
        CustomModuleConfigs.push(module.declareModuleConfig);
    }
});


const Misc: ISettingItem[] = [
    // {
    //     type: 'textinput',
    //     title: 'Zotero Password',
    //     description: 'Zotero Debug-Bridge 的密码',
    //     key: 'zoteroPassword',
    //     value: 'CTT'
    // },
    // {
    //     type: 'textinput',
    //     title: 'Zotero 存储目录',
    //     description: 'Zotero 的数据存储位置',
    //     key: 'zoteroDir',
    //     value: ''
    // },
    // {
    //     type: 'textinput',
    //     title: '代码编辑器',
    //     description: '代码编辑器路径, {{filepath}} 会被替换为真实的文件路径',
    //     key: 'codeEditor',
    //     value: 'code {{filepath}}',
    //     direction: 'row'
    // },
    // {
    //     type: 'textinput',
    //     title: '思源派 Token',
    //     description: '思源派 Token 的发布 Token',
    //     key: 'sypaiToken',
    //     value: ''
    // },
];

export const initSetting = async (plugin: FMiscPlugin) => {
    const persistence = await SettingsPersistence.initialize({
        plugin,
        enabledSettingItems: Enable,
        miscSettingItems: Misc,
        modules: [...ModulesAlwaysEnable, ...ModulesToEnable]
    });

    plugin.openSetting = () => {
        solidDialog({
            title: "F-Misc 设置",
            width: "1200px",
            height: "700px",
            loader: () => Settings({
                GroupEnabled: Enable,
                GroupMisc: Misc,
                changed: event => persistence.updateLegacySetting(event),
                customPanels: CustomPanels,
                customModuleConfigs: CustomModuleConfigs
            })
        });
    };

    return persistence;
}

