/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/index.ts
 * @LastEditTime : 2024-04-04 19:25:20
 * @Description  : 
 */
import {
    IMenuItemOption,
    Menu,
    Plugin,
    Dialog,
    getFrontend
} from "siyuan";


import { load, unload, toggleEnable } from "./func";

import "@/index.scss";
import { Href, Svg } from "./utils/const"; 
import { removeDomById, updateStyleLink } from "./utils/style";
import { initSetting } from "./utils/setting-libs";
import { SettingGroupsPanel } from "./components/setting-panels";


const StatusFlag = {
    IsTabbarVertical: false
}

const StorageName = 'configs';

export default class FMiscPlugin extends Plugin {

    isMobile: boolean;
    // private settingUtils: SettingUtils;

    settingUI: SettingGroupsPanel;

    declare data: {
        configs: {
            '启用功能': {
                EnableInsertTime: boolean;
                EnableNewFile: boolean;
                EnableOnPaste: boolean;
                EnableTitledLink: boolean;
            }
        };
    }

    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        this.addIcons(Svg.Vertical);
        this.initTopBar();
        this.settingUI = await initSetting(this, this.onSettingChanged.bind(this));
        load(this);
    }

    async onunload() {
        unload(this);
    }

    openSetting(): void {
        let dialog = new Dialog({
            title: "F-Misc 设置",
            content: `<div id="SettingPanel" style="height: 100%; display: flex;"></div>`,
            width: "800px",
            height: "600px"
        });
        let div = dialog.element.querySelector("#SettingPanel");
        if (div) {
            div.appendChild(this.settingUI.element);
        }
    }

    onSettingChanged(group: string, key: string, value: any) {
        //动态启用或禁用功能
        if (group === '启用功能') {
            //@ts-ignore
            toggleEnable(this, key, value);
        }
    }

    getConfig(group: string, key: string): any {
        const configs = this.data?.['configs'];
        if (!configs) {
            return;
        }
        return configs?.[group]?.[key];
    }

    async loadConfigs() {
        let data = await this.loadData(StorageName);
        if (!data) {
            return;
        }
        for (let groupName in this.data[StorageName]) {
            let group = this.data[StorageName][groupName];
            let outConfig = data?.[groupName];
            if (!outConfig) {
                continue;
            }
            for (let key in group) {
                if (outConfig[key] !== undefined) {
                    group[key] = outConfig[key];
                }
            }
        }
    }

    saveConfigs() {
        console.debug('SaveConfigs', JSON.stringify(this.data[StorageName]));
        this.saveData(StorageName, this.data[StorageName]);
    }

    private initTopBar() {
        const showMenu = () => {
            let menu = new Menu("f-misc-topbar");
            let menuItems: IMenuItemOption[] = [
                {
                    label: '垂直标签页',
                    icon: 'iconVertical',
                    iconClass: StatusFlag.IsTabbarVertical? 'highlight-icon' : '',
                    click: () => {
                        if (!StatusFlag.IsTabbarVertical) {
                            updateStyleLink('f-misc-vertical-title', Href.Style_Vertical_Tabbar);
                            StatusFlag.IsTabbarVertical = true;
                        } else {
                            removeDomById('f-misc-vertical-title');
                            StatusFlag.IsTabbarVertical = false;
                        }
                    }
                }
            ];
            for (let item of menuItems) {
                menu.addItem(item);
            }
            const rect = topbar.getBoundingClientRect();
            menu.open({
                x: rect.right,
                y: rect.bottom,
                isLeft: true
            });
        }

        const topbar = this.addTopBar({
            icon: 'iconSettings',
            title: 'f-misc',
            position: 'right',
            callback: showMenu
        });
    }

    addProtyleSlash(slash: IPluginProtyleSlash) {
        for (let i = 0; i < this.protyleSlash.length; i++) {
            if (this.protyleSlash[i].id === slash.id) {
                return;
            }
        }
        this.protyleSlash.push(slash);
    }

    delProtyleSlash(id: BlockId) {
        this.protyleSlash = this.protyleSlash.filter(slash => slash.id !== id);
    }
}
