/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-04 17:43:26
 * @FilePath     : /src/utils/setting-libs.ts
 * @LastEditTime : 2024-04-04 21:42:08
 * @Description  : 
 */
import type FMiscPlugin from '@/index';
import { SettingGroupsPanel} from '@/components/setting-panels';
// import { Module } from '@/func';

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
        title: '中键小窗',
        description: '启用中键点击元素打开独立小窗功能',
        key: 'EnableMiniWindow',
        value: true
    }
];


export const initSetting = async (plugin: FMiscPlugin, onChanged) => {
    const settingDialog = new SettingGroupsPanel();
    settingDialog.addGroup('启用功能', Enable);
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

    let configs = {}
    configs['启用功能'] = Object.fromEntries(Enable.map(item => [item.key, item.value]));
    //@ts-ignore
    plugin.data['configs'] = configs;

    await plugin.loadConfigs(); //导入并合并配置

    for (let groupName in plugin.data['configs']) {
        let groupConfig = plugin.data['configs'][groupName];
        settingDialog.updateValues(groupName, groupConfig);
    }

    return settingDialog;
}

