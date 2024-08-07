/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-04 17:43:26
 * @FilePath     : /src/settings/index.ts
 * @LastEditTime : 2024-08-07 14:56:46
 * @Description  : 
 */
import type FMiscPlugin from '@/index';
import { selectIconDialog } from '@/func/docky';
import { toggleEnable } from '@/func';

import Settings from "@/settings/settings";
import { solidDialog } from '@/libs/dialog';
import { debounce } from '@/utils';

// Enable Setting Item 的 key 必须遵守 `Enable${module.name}` 的格式
const Enable: ISettingItem[] = [
    {
        type: 'checkbox',
        title: '🖥️ 中键小窗',
        description: '启用中键点击元素打开独立小窗功能',
        key: 'EnableMiniWindow',
        value: true
    },
    {
        type: 'checkbox',
        title: '📋 侧边栏Protyle',
        description: '启用侧边栏自定义 Protyle 功能',
        key: 'EnableDocky',
        value: true
    },
    {
        type: 'checkbox',
        title: '🔍 简单搜索',
        description: '通过简单的语法以方便搜索',
        key: 'EnableSimpleSearch',
        value: false
    },
    {
        type: 'checkbox',
        title: '⌚ Insert time',
        description: '启用插入时间功能',
        key: 'EnableInsertTime',
        value: true
    },
    {
        type: 'checkbox',
        title: '🔗 Titled link',
        description: '启用获取标题功能',
        key: 'EnableTitledLink',
        value: true
    },
    {
        type: 'checkbox',
        title: '🎨 更换主题',
        description: '启用更换主题功能',
        key: 'EnableChangeTheme',
        value: true
    },
    {
        type: 'checkbox',
        title: '📚 Zotero',
        description: '启用 Zotero 相关功能',
        key: 'EnableZotero',
        value: true
    },
    {
        type: 'checkbox',
        title: '📄 New file',
        description: '启用新建文件功能',
        key: 'EnableNewFile',
        value: true
    },
    {
        type: 'checkbox',
        title: '💻 Run Javascript',
        description: '启用 Run Js 功能',
        key: 'EnableRunJs',
        value: false
    },
    {
        type: 'checkbox',
        title: '💭 转移引用',
        description: '启用转移引用功能',
        key: 'EnableTransferRef',
        value: false
    },
    {
        type: 'checkbox',
        title: '🩺 Websocket 监听',
        description: '启用插件 WS 事件监听',
        key: 'EnableWebSocket',
        value: false
    },
    {
        type: 'checkbox',
        title: '🌐 测试 API',
        description: '启用测试 API 功能',
        key: 'EnableTestAPI',
        value: false
    },
    {
        type: 'checkbox',
        title: '📤 推送文档发布远端',
        description: '启用推送文档发布远端功能',
        key: 'EnablePostDoc',
        value: false
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
        title: '思源派 Token',
        description: '思源派 Token 的发布 Token',
        key: 'sypaiToken',
        value: ''
    },
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

    const onChanged = (e: {group: string, key: string, value: any}) => {
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

    plugin.openSetting = () => {
        solidDialog({
            title: "F-Misc 设置",
            width: "800px",
            height: "500px",
            loader: () => Settings({
                GroupEnabled: Enable,
                GroupDocky: Docky,
                GroupMisc: Misc,
                changed: onChanged
            })
        });
    }
}

