/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-04 17:43:26
 * @FilePath     : /src/utils/setting-libs.ts
 * @LastEditTime : 2024-04-18 18:14:54
 * @Description  : 
 */
import type FMiscPlugin from '@/index';
import { SettingGroupsPanel} from '@/components/setting-panels';
// import { Module } from '@/func';
import { selectIconDialog } from '@/func/docky';

// Enable Setting Item 的 key 必须遵守 `Enable${module.name}` 的格式
const Enable: ISettingItem[] = [
    {
        type: 'checkbox',
        title: 'Insert time',
        description: '启用插入时间功能',
        key: 'EnableInsertTime',
        value: true
    },
    {
        type: 'checkbox',
        title: 'New file',
        description: '启用新建文件功能',
        key: 'EnableNewFile',
        value: true
    },
    {
        type: 'checkbox',
        title: 'On paste',
        description: '启用重写粘贴事件功能',
        key: 'EnableOnPaste',
        value: true
    },
    {
        type: 'checkbox',
        title: 'Titled link',
        description: '启用获取标题功能',
        key: 'EnableTitledLink',
        value: true
    },
    {
        type: 'checkbox',
        title: '更换主题',
        description: '启用更换主题功能',
        key: 'EnableChangeTheme',
        value: true
    },
    {
        type: 'checkbox',
        title: 'Run Javascript',
        description: '启用 Run Js 功能',
        key: 'EnableRunJs',
        value: true
    },
    {
        type: 'checkbox',
        title: '中键小窗',
        description: '启用中键点击元素打开独立小窗功能',
        key: 'EnableMiniWindow',
        value: true
    },
    {
        type: 'checkbox',
        title: '侧边栏Protyle',
        description: '启用侧边栏自定义 Protyle 功能',
        key: 'EnableDocky',
        value: true
    }
];

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
        value: ''
    },
];


export const initSetting = async (plugin: FMiscPlugin, onChanged) => {
    //1. 初始化 setting dialog
    const settingDialog = new SettingGroupsPanel();
    settingDialog.addGroup({key: 'Enable', text: '✅ 启用功能'}, Enable);
    settingDialog.addGroup({key: 'Docky', text: '⛩️ 侧边栏显示'}, Docky);
    settingDialog.render();

    settingDialog.bindChangedEvent(({ group, key, value }) => {
        console.log(`Group: ${group}, Key: ${key}, Value: ${value}`);
        const pluginConfigs = plugin.data['configs'];
        if (pluginConfigs[group] && pluginConfigs[group][key] !== undefined) {
            pluginConfigs[group][key] = value;
        }
        plugin.saveConfigs();
        onChanged(group, key, value);
    });

    //2. 初始化 plugin settings 配置
    let configs = {}
    configs['Enable'] = Object.fromEntries(Enable.map(item => [item.key, item.value]));
    configs['Docky'] = Object.fromEntries(Docky.map(item => [item.key, item.value]));
    //@ts-ignore
    plugin.data['configs'] = configs;

    //3. 导入文件并合并配置
    await plugin.loadConfigs(); 
    for (let groupName in plugin.data['configs']) {
        let groupConfig = plugin.data['configs'][groupName];
        settingDialog.updateValues(groupName, groupConfig);
    }

    return settingDialog;
}

