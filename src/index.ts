/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/index.ts
 * @LastEditTime : 2024-05-13 11:13:20
 * @Description  : 
 */
import {
    IMenuItemOption,
    Menu,
    Plugin,
    Dialog,
    getFrontend,
    showMessage
} from "siyuan";


import { load, unload } from "./func";

import "@/index.scss";
import { Href, Svg } from "./utils/const";
import { EventBusSync } from "./utils/event-bus";
import { removeDomById, updateStyleLink } from "./utils/style";
import { initSetting } from "./utils/setting-libs";
import { SettingGroupsPanel } from "./components/setting-panels";

const electron = require('electron');


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
            'Enable': { [key: string]: boolean };
            'Docky': {
                DockyEnableZoom: boolean;
                DockyZoomFactor: number;
                DockyProtyle: string;
            };
            'Zotero': {
                password: string;
            }
        };
    }

    eb: EventBusSync;

    async onload() {
        const frontEnd = getFrontend();
        this.eb = new EventBusSync();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        this.addIcons([Svg.Toolbox, Svg.Vertical, Svg.Theme, Svg.Transfer].join(''));
        this.settingUI = await initSetting(this);
        load(this);

        //Default functions
        this.initDefaultFunctions();
    }

    async onunload() {
        unload(this);
    }

    /**
     * 不需要开关，默认启用的功能
     */
    private initDefaultFunctions() {
        this.initTopBar();

        Object.entries(Href.Style).forEach(([key, value]) => {
            updateStyleLink(key, value);
        });

        this.eventBus.on('open-menu-image', ({ detail }) => {
            // console.debug('open-menu-image', detail);
            const element: HTMLSpanElement = detail.element;
            const img = element.querySelector('img');
            let src = img?.getAttribute('src');
            if (!src) {
                return;
            }
            src = src.replace('/', '\\');
            const menu = detail.menu;
            menu.addItem({
                label: '复制图片地址',
                icon: 'iconCopy',
                click: () => {
                    const dataDir = window.siyuan.config.system.dataDir;
                    const path = dataDir + '\\' + src;
                    navigator.clipboard.writeText(path).then(() => {
                        showMessage(`复制到剪贴板: ${path}`);
                    });
                }
            });

        });
    }

    openSetting(): void {
        let dialog = new Dialog({
            title: "F-Misc 设置",
            content: `<div id="SettingPanel" style="height: 100%; display: flex;"></div>`,
            width: "800px",
            height: "500px"
        });
        let div = dialog.element.querySelector("#SettingPanel") as HTMLElement;
        if (div) {
            div.appendChild(this.settingUI.element);
            div.focus();
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
        let currentData = this.data[StorageName];
        let outData = await this.loadData(StorageName);
        console.debug('导入', outData);
        if (!outData) {
            return;
        }
        for (let groupName in currentData) {
            let group = currentData[groupName];
            let outConfig = outData?.[groupName];
            if (!outConfig) {
                continue;
            }
            for (let key in group) {
                if (outConfig?.[key] !== undefined) {
                    group[key] = outConfig[key];
                }
            }
        }
        this.data[StorageName] = currentData;
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
                    iconClass: StatusFlag.IsTabbarVertical ? 'highlight-icon' : '',
                    click: () => {
                        if (!StatusFlag.IsTabbarVertical) {
                            updateStyleLink('f-misc-vertical-title', Href.Style_Vertical_Tabbar);
                            StatusFlag.IsTabbarVertical = true;
                        } else {
                            removeDomById('f-misc-vertical-title');
                            StatusFlag.IsTabbarVertical = false;
                        }
                    }
                },
                {
                    label: '打开目录',
                    icon: 'iconFolder',
                    type: 'submenu',
                    submenu: [
                        {
                            label: '数据目录',
                            icon: 'iconFolder',
                            click: () => {
                                const dataDir = window.siyuan.config.system.dataDir;
                                electron.shell.openPath(dataDir);
                            }
                        },
                        {
                            label: '插件目录',
                            icon: 'iconFolder',
                            click: () => {
                                const pluginDir = window.siyuan.config.system.dataDir + '/plugins';
                                electron.shell.openPath(pluginDir);
                            }
                        },
                        {
                            label: 'Petal 目录',
                            icon: 'iconFolder',
                            click: () => {
                                const pluginDir = window.siyuan.config.system.dataDir + '/storage/petal';
                                electron.shell.openPath(pluginDir);
                            }
                        }
                    ]
                }
            ];
            for (let item of menuItems) {
                menu.addItem(item);
            }
            this.eb.emit('on-topbar-menu', menu);
            menu.addSeparator();
            menu.addItem({
                label: '重载',
                icon: 'iconRefresh',
                click: () => {
                    window.location.reload();
                }
            });
            menu.addItem({
                label: '设置',
                icon: 'iconSettings',
                click: () => {
                    this.openSetting();
                }
            });

            const rect = topbar.getBoundingClientRect();
            menu.open({
                x: rect.right,
                y: rect.bottom,
                isLeft: true
            });
        }

        const topbar = this.addTopBar({
            icon: 'iconToolbox',
            title: 'f-misc',
            position: 'right',
            callback: showMenu
        });

        topbar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.openSetting();
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
