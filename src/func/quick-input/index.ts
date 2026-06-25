import type FMiscPlugin from "@/index";
import { translateHotkey } from "@/libs/hotkey";

import { openPanel } from "./panel";
import QuickInputSetting from "./setting";

export { declareModuleConfig } from "./config";

export let name = "QuickInput";
export let enabled = false;

const COMMAND_KEY = 'openQuickInput';
const MENU_KEY = 'QuickInput';

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    plugin.addCommand({
        langKey: COMMAND_KEY,
        langText: '打开 QuickInput 快速输入面板',
        hotkey: translateHotkey('Alt+I'),
        globalCallback: () => {
            openPanel();
        }
    });

    plugin.registerMenuTopMenu(MENU_KEY, [
        {
            icon: 'iconEdit',
            label: 'QuickInput',
            click: () => openPanel()
        }
    ]);
};

export const unload = (plugin?: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;

    plugin?.delCommand(COMMAND_KEY);
    plugin?.unRegisterMenuTopMenu(MENU_KEY);
};

export const declareToggleEnabled = {
    title: '💡 QuickInput',
    description: '通过快捷键呼出预设模板，快速在指定位置创建或插入内容',
    defaultEnabled: false
};

export const declareSettingPanel = [
    {
        key: 'QuickInput',
        title: '💡 QuickInput',
        element: QuickInputSetting
    }
];
