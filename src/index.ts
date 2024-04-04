/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/index.ts
 * @LastEditTime : 2024-04-04 16:33:21
 * @Description  : 
 */
import {
    IMenuItemOption,
    Menu,
    Plugin,
    getFrontend
} from "siyuan";


import { load, unload } from "./func";

import "@/index.scss";
import { Href, Svg } from "./utils/const"; 
import { removeDomById, updateStyleLink } from "./utils/style";


const StatusFlag = {
    IsTabbarVertical: false
}


export default class FMiscPlugin extends Plugin {

    isMobile: boolean;
    // private settingUtils: SettingUtils;

    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        load(this);
        this.addIcons(Svg.Vertical);
        this.initTopBar();
    }

    async onunload() {
        unload(this);
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
