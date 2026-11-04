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
        const { container } = solidDialog({
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
        // 设置面板内部用 --b3-theme-background 作底色（如 GPT 面板的标签栏），
        // 而 dialog 默认底色是 --b3-theme-surface，两种底色拼接会显得脏且割裂。
        container.style.backgroundColor = 'var(--b3-theme-background)';
        // dialog 默认给内容区留 16px/24px 内边距，会在面板四周露出一圈灰边；面板自带内边距，这里去掉。
        container.querySelector<HTMLElement>('.b3-dialog__content')?.style.setProperty('padding', '0');
    };

    return persistence;
}

