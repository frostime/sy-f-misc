/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-04 17:43:26
 * @FilePath     : /src/settings/index.ts
 * @LastEditTime : 2025-01-02 20:44:54
 * @Description  : 
 */
import type FMiscPlugin from '@/index';
import { selectIconDialog } from '@/func/docky';
import { toggleEnable, ModulesAlwaysEnable, ModulesToEnable } from '@/func';

import Settings from "@/settings/settings";
import { solidDialog } from '@/libs/dialog';
import { debounce } from '@frostime/siyuan-plugin-kits';

// Enable Setting Item 的 key 必须遵守 `Enable${module.name}` 的格式

const Enable: ISettingItem[] = ModulesToEnable.filter(module => module.declareToggleEnabled !== undefined).map(module => ({
    type: 'checkbox',
    title: module.declareToggleEnabled.title,
    description: module.declareToggleEnabled.description,
    key: `Enable${module.name}`,
    value: module.declareToggleEnabled.defaultEnabled ?? false
}));

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


//侧边栏
const Docky: ISettingItem[] = [
    {
        type: 'checkbox',
        title: '缩放 Protyle',
        description: '是否缩放侧边栏 Protyle',
        key: 'DockyEnableZoom',
        value: true
    },
    {
        type: 'slider',
        title: '缩放因子',
        description: '对 Protyle 缩放的 zoom 因子',
        key: 'DockyZoomFactor',
        value: 0.75,
        slider: {
            min: 0.5,
            max: 1,
            step: 0.01,
        }
    },
    {
        type: 'button',
        title: '选择图标',
        description: '选择图标',
        key: 'DockySelectIcon',
        value: '',
        button: {
            label: '选择图标',
            callback: selectIconDialog
        }
    },
    {
        type: 'textarea',
        title: 'Protyle 配置',
        description: '加入侧边栏的 Protyle, 用换行符分割<br/>e.g. id: xxx, name: xxx, position: xxx, icon?: xxx, hotkey?: xxx',
        key: 'DockyProtyle',
        direction: 'row',
        value: ''
    },
];

const Misc: ISettingItem[] = [
    {
        type: 'textinput',
        title: 'Zotero Password',
        description: 'Zotero Debug-Bridge 的密码',
        key: 'zoteroPassword',
        value: 'CTT'
    },
    {
        type: 'textinput',
        title: 'Zotero 存储目录',
        description: 'Zotero 的数据存储位置',
        key: 'zoteroDir',
        value: ''
    },
    {
        type: 'textinput',
        title: '代码编辑器',
        description: '代码编辑器路径, {{filepath}} 会被替换为真实的文件路径',
        key: 'codeEditor',
        value: 'code {{filepath}}',
        direction: 'row'
    },
    // {
    //     type: 'textinput',
    //     title: '思源派 Token',
    //     description: '思源派 Token 的发布 Token',
    //     key: 'sypaiToken',
    //     value: ''
    // },
];


const onSettingChanged = (plugin: FMiscPlugin, group: string, key: string, value: string) => {
    //动态启用或禁用功能
    if (group === 'Enable') {
        //@ts-ignore
        toggleEnable(plugin, key, value);
    } else if (group == 'Docky') {
        if (key === 'DockyProtyle') return;
        let enable = plugin.getConfig('Docky', 'DockyEnableZoom');
        let factor = plugin.getConfig('Docky', 'DockyZoomFactor');
        if (enable === false) {
            document.documentElement.style.setProperty('--plugin-docky-zoom', 'unset');
        } else {
            document.documentElement.style.setProperty('--plugin-docky-zoom', `${factor}`);
        }
    }
}


export const initSetting = async (plugin: FMiscPlugin) => {
    //1. 初始化 plugin settings 配置
    let configs = {}
    configs['Enable'] = Object.fromEntries(Enable.map(item => [item.key, item.value]));
    configs['Docky'] = Object.fromEntries(Docky.map(item => [item.key, item.value]));
    configs['Misc'] = Object.fromEntries(Misc.map(item => [item.key, item.value]));
    //@ts-ignore
    plugin.data['configs'] = configs;

    //3. 导入文件并合并配置
    await plugin.loadConfigs();

    const updateConfigs = () => {
        const UpdateConfig = (setting: ISettingItem[], key: string) => {
            setting.forEach(item => {
                item.value = plugin.getConfig(key, item.key);
            });
        }
        UpdateConfig(Enable, 'Enable');
        UpdateConfig(Docky, 'Docky');
        UpdateConfig(Misc, 'Misc');
    }

    updateConfigs();

    const saveConfigDebounced = debounce(() => plugin.saveConfigs(), 1000 * 10);
    const settingChangedDebounced = debounce(onSettingChanged, 1000 * 2);

    const onChanged = (e: { group: string, key: string, value: any }) => {
        let { group, key, value } = e;
        console.debug(`Group: ${group}, Key: ${key}, Value: ${value}`);
        const pluginConfigs = plugin.data['configs'];
        if (pluginConfigs[group] && pluginConfigs[group][key] !== undefined) {
            pluginConfigs[group][key] = value;
        }
        updateConfigs();

        saveConfigDebounced();
        settingChangedDebounced(plugin, group, key, value);
    }

    // ====== Module Configs ======
    // 由于历史原因，之前把各个模块的配置存储管理全部耦合在 plugin 里面了
    // customModuleConfigs 是新的做法, plugin 只管 load/save，各个模块的配置自行负责
    const storageName = 'customModuleConfigs.json';
    // 导入并初始化配置
    let storage = await plugin.loadData(storageName);
    storage = storage || {};
    if (storage) {
        CustomModuleConfigs.forEach(config => {
            if (!storage[config.key]) return;
            config.init(storage[config.key]);
        });
    }

    const saveModuleConfig = async () => {
        try {
            let configs = Object.fromEntries(CustomModuleConfigs.map(config => [
                config.key,
                Object.fromEntries(config.items.map(item => [item.key, item.get()]))
            ]));
            await plugin.saveData(storageName, configs);
            console.debug('Module configs saved:', configs);
        } catch (e) {
            console.error('Failed to save module configs:', e);
        }
    }
    let saveModuleConfigDebounced = debounce(saveModuleConfig, 1000 * 5);
    // inject set function, to get the change event
    const onModuleConfigChanged = (moduleKey: string, key: string, value: any) => {
        if (!storage[moduleKey]) storage[moduleKey] = {};
        storage[moduleKey][key] = value;
        saveModuleConfigDebounced();
    }
    /**
     * Inject set function, to get the change event
     */
    CustomModuleConfigs.forEach(config => {
        config.items.forEach(item => {
            let initialSetCb = item.set.bind(item);
            item.set = (value: any) => {
                initialSetCb(value);
                onModuleConfigChanged(config.key, item.key, value);
            }
        });
    });

    // ====== Open Setting ======

    plugin.openSetting = () => {
        solidDialog({
            title: "F-Misc 设置",
            width: "1200px",
            height: "700px",
            loader: () => Settings({
                GroupEnabled: Enable,
                GroupDocky: Docky,
                GroupMisc: Misc,
                changed: onChanged,
                customPanels: CustomPanels,
                customModuleConfigs: CustomModuleConfigs
            })
        });
        // const container = dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
    }
}

