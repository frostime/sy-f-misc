/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/index.ts
 * @LastEditTime : 2024-06-23 22:10:15
 * @Description  : 
 */
import {
    IMenuItemOption,
    Menu,
    Plugin,
    getFrontend,
    showMessage,
    Protyle
} from "siyuan";


import { load, unload } from "./func";

import "@/index.scss";
import { Href, Svg } from "./utils/const";
import { EventBusSync } from "./utils/event-bus";
import { updateStyleLink } from "./libs/style";
import { initSetting } from "./settings";
import { onPaste } from "./global-paste";

import type {} from "solid-styled-jsx";
import { request } from "./api";

const electron = require('electron');


const StorageNameConfigs = 'configs';

export default class FMiscPlugin extends Plugin {

    isMobile: boolean;

    private globalContextMenuHandler: (event: MouseEvent) => void;

    declare data: {
        configs: {
            'Enable': { [key: string]: boolean };
            'Docky': {
                DockyEnableZoom: boolean;
                DockyZoomFactor: number;
                DockyProtyle: string;
            };
            Misc: {
                zoteroPassword: string;
            };
        };
        bookmarks: {
            [key: TBookmarkGroupId]: IBookmarkGroup;
        };
    }

    eb: EventBusSync;

    async onload() {
        const frontEnd = getFrontend();
        this.eb = new EventBusSync();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        let svgs = Object.values(Svg);
        this.addIcons(svgs.join(''));
        await initSetting(this);
        this.eventBus.on('paste', onPaste);
        load(this);

        //Default functions
        this.initDefaultFunctions();
        this.globalContextMenuHandler = this.globalContextMenu.bind(this);
        // document.addEventListener('mousedown', this.globalContextMenuHandler);
    }

    async onunload() {
        this.eventBus.off('paste', onPaste);
        unload(this);
        // document.removeEventListener('mousedown', this.globalContextMenuHandler);
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

        this.addProtyleSlash({
            filter: ['toc', 'outline'],
            html: '插入文档大纲',
            id: 'toc',
            callback: (protyle: Protyle) => {
                request('/api/outline/getDocOutline', {
                    id: protyle.protyle.block.rootID
                }).then((ans) => {
                    console.log('toc');
                    const iterate = (data: any) => {
                        let toc: string[] = [];
                        for (let item of data) {
                            toc.push(`${'  '.repeat(item.depth)} * [${item.name || item.content}](siyuan://blocks/${item.id})`);
                            if (item.count > 0) {
                                let subtocs = iterate(item.blocks ?? item.children);
                                toc = toc.concat(subtocs);
                            }
                        }
                        return toc;
                    }
                    let tocs = iterate(ans);
                    let md = tocs.join('\n');
                    protyle.insert(md, true);
                });
            }
        })
    }

    /**
     * 一个自定义的全局右键菜单，Ctrl + 右键触发
     */
    globalContextMenu(event: MouseEvent) {
        if (!event.ctrlKey || event.button !== 2) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    getConfig(group: string, key: string): any {
        const configs = this.data?.['configs'];
        if (!configs) {
            return;
        }
        return configs?.[group]?.[key];
    }

    async loadConfigs() {
        let currentData = this.data[StorageNameConfigs];
        let outData = await this.loadData(StorageNameConfigs + '.json');
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
        this.data[StorageNameConfigs] = currentData;
    }

    saveConfigs() {
        console.debug('SaveConfigs', JSON.stringify(this.data[StorageNameConfigs]));
        this.saveData(StorageNameConfigs + '.json', this.data[StorageNameConfigs]);
    }

    private initTopBar() {
        const showMenu = () => {
            let menu = new Menu("f-misc-topbar");
            let menuItems: IMenuItemOption[] = [
                // {
                //     label: '垂直标签页',
                //     icon: 'iconVertical',
                //     iconClass: StatusFlag.IsTabbarVertical ? 'highlight-icon' : '',
                //     click: () => {
                //         if (!StatusFlag.IsTabbarVertical) {
                //             updateStyleLink('f-misc-vertical-title', Href.Style_Vertical_Tabbar);
                //             StatusFlag.IsTabbarVertical = true;
                //         } else {
                //             removeDomById('f-misc-vertical-title');
                //             StatusFlag.IsTabbarVertical = false;
                //         }
                //     }
                // },
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

    delCommand(id: string) {
        this.commands = this.commands.filter((command) => command.langKey !== id);
    }

}
