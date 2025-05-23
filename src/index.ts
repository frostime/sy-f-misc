/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/index.ts
 * @LastEditTime : 2025-05-15 11:32:52
 * @Description  : 
 */
import {
    IMenu,
    Menu,
    Plugin,
    getFrontend,
    showMessage
} from "siyuan";

import { load, unload } from "./func";

import "@/index.scss";

import { initSetting } from "./settings";

import { registerPlugin } from "@frostime/siyuan-plugin-kits";

import { useLocalDeviceStorage } from "@frostime/siyuan-plugin-kits";

const electron = window?.require?.('electron');


const StorageNameConfigs = 'configs';

export default class FMiscPlugin extends Plugin {

    isMobile: boolean;

    // private globalContextMenuHandler: (event: MouseEvent) => void;

    private callbacksOnLayoutReady: ((p: FMiscPlugin) => void)[] = [];

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
                zoteroDir: string;
                sypaiToken: string;
                codeEditor: string;
            };
        };
    }

    // eb: EventBusSync;

    deviceStorage: Awaited<ReturnType<typeof useLocalDeviceStorage>>;

    get petalRoute() {
        return '/data/storage/petal/' + this.name;
    }

    async onload() {
        globalThis.fmisc = {}
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        registerPlugin(this);

        //Default functions
        this.initDefaultFunctions();

        let svgs = Object.values(Svg);
        this.addIcons(svgs.join(''));
        await initSetting(this);
        load(this);
    }

    async onunload() {
        globalThis.fmisc && delete globalThis.fmisc

        unload(this);
    }

    async onLayoutReady() {
        this.callbacksOnLayoutReady.forEach(cb => {
            cb(this);
        });
    }

    /**
     * 不需要开关，默认启用的功能
     */
    private initDefaultFunctions() {
        this.initTopBar();

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
        //读入 zoteroDir 进行覆盖
        // this.deviceStorage = await useLocalDeviceStorage(this);
        // let zoteroDir = this.deviceStorage.get('zoteroDir');
        // let codeEditor = this.deviceStorage.get('codeEditor');
        // if (zoteroDir) {
        //     this.data[StorageNameConfigs].Misc.zoteroDir = zoteroDir;
        // }
        // if (codeEditor) {
        //     this.data[StorageNameConfigs].Misc.codeEditor = codeEditor;
        // }
    }

    async saveConfigs() {
        //本地的不同步保存的项目
        // await this.deviceStorage.set('zoteroDir', this.data[StorageNameConfigs].Misc.zoteroDir);
        // await this.deviceStorage.set('codeEditor', this.data[StorageNameConfigs].Misc.codeEditor);

        // 创建 this.data[StorageNameConfigs] 的副本，并去掉 zoteroDir
        let s = JSON.stringify(this.data[StorageNameConfigs]);
        console.debug('SaveConfigs', s);
        let dataToSave: any = JSON.parse(s);
        // dataToSave.Misc.zoteroDir = "/";
        // dataToSave.Misc.codeEditor = "";
        this.saveData(StorageNameConfigs + '.json', dataToSave);
    }

    public customMenuItems: Record<string, IMenu[]> = {};

    public registerMenuTopMenu(key: string, menu: IMenu[]) {
        this.customMenuItems[key] = menu;
    }

    public unRegisterMenuTopMenu(key: string) {
        if (!this.customMenuItems[key]) return;
        delete this.customMenuItems[key];
    }

    private initTopBar() {
        const showMenu = () => {
            let menu = new Menu("f-misc-topbar");
            let menuItems: IMenu[] = [
                electron ? {
                    label: '打开目录',
                    icon: 'iconFolder',
                    type: 'submenu',
                    submenu: [
                        {
                            label: '数据目录',
                            icon: 'iconFolder',
                            click: () => {
                                const dataDir = window.siyuan.config.system.dataDir;
                                electron?.shell.openPath(dataDir);
                            }
                        },
                        {
                            label: '插件目录',
                            icon: 'iconFolder',
                            click: () => {
                                const pluginDir = window.siyuan.config.system.dataDir + '/plugins';
                                electron?.shell.openPath(pluginDir);
                            }
                        },
                        {
                            label: 'Petal 目录',
                            icon: 'iconFolder',
                            click: () => {
                                const pluginDir = window.siyuan.config.system.dataDir + '/storage/petal';
                                electron?.shell.openPath(pluginDir);
                            }
                        }
                    ]
                } : null,
            ];
            menuItems = menuItems.filter(item => item !== null);
            for (let item of menuItems) {
                menu.addItem(item);
            }

            for (let key in this.customMenuItems) {
                let menuItems = this.customMenuItems[key];
                for (let item of menuItems) {
                    menu.addItem(item);
                }
            }

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
        // const plugin = thisPlugin();
        // plugin.registerTopbarMenu({
        //     icon: 'iconToolbox',
        //     title: 'f-misc',
        //     position: 'right',
        //     beforeShow(menu, event) {

        //     },
        //     menus: () => {
        //         return [];
        //     }
        // });

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

    addLayoutReadyCallback(cb: ((p: FMiscPlugin) => void)) {
        this.callbacksOnLayoutReady.push(cb);
    }

}

const Svg = {
    Toolbox: `<symbol id="iconToolbox" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4317"><path d="M96.512 425.564c16.53-61.654 132.308-148.058 155.432-141.872 23.092 6.188 80.186 138.904 63.654 200.588-16.53 61.656-78.966 98.5-139.464 82.28s-96.122-79.34-79.622-140.996z" fill="#E6E9ED" p-id="4318"></path><path d="M163.884 633.778a21.24 21.24 0 0 1-5.532-0.75c-11.374-3.032-18.154-14.75-15.092-26.122l46.56-173.842c3.062-11.374 14.75-18.124 26.124-15.092 11.406 3.062 18.156 14.75 15.124 26.124l-46.592 173.838c-2.53 9.53-11.154 15.844-20.592 15.844z" fill="#CCD1D9" p-id="4319"></path><path d="M678.808 608.906l-122.308 37.684-96.28-312.49 122.34-37.688z" fill="#ED5564" p-id="4320"></path><path d="M684.496 265.006l-326.21 100.498 3.092-134.902 285.43-87.904z" fill="#434A54" p-id="4321"></path><path d="M794.24 640.622l-162.056-72.652 28.906-64.468 70.03-26.656 65.372 29.312 26.656 70-28.908 64.464z m-105.65-94.122l84.184 37.75 4.218-9.438-14.094-36.968-33.124-14.844-36.966 14.062-4.218 9.438z" p-id="4322"></path><path d="M933.58 244.758c6.782 3.062 9.844 11.062 6.782 17.842l-118.214 263.65c-3.032 6.782-11.032 9.844-17.844 6.782l-98.462-44.156c-6.812-3.062-9.844-11.032-6.812-17.844l118.212-263.65c3.062-6.782 11.032-9.812 17.844-6.782l98.494 44.158z" fill="#A0D468" p-id="4323"></path><path d="M765.742 508.5c-2.938 0-5.876-0.624-8.718-1.874-10.748-4.812-15.56-17.438-10.748-28.188l84.496-188.464c4.844-10.75 17.468-15.562 28.218-10.75 10.75 4.812 15.532 17.436 10.718 28.186l-84.5 188.464a21.33 21.33 0 0 1-19.466 12.626z" fill="#8CC153" p-id="4324"></path><path d="M85.324 469.344h853.318v426.644H85.324zM106.666 213.352H917.3v42.656H106.666z" fill="#F6BB42" p-id="4325"></path><path d="M256.006 639.996H128.01c-11.812 0-21.344-9.532-21.344-21.312 0-11.778 9.532-21.34 21.344-21.34h127.996c11.75 0 21.312 9.562 21.312 21.34 0 11.78-9.562 21.312-21.312 21.312zM895.988 597.344h-85.342c-11.782 0-21.344-9.532-21.344-21.344 0-11.782 9.562-21.312 21.344-21.312h85.342A21.3 21.3 0 0 1 917.3 576c0 11.812-9.53 21.344-21.312 21.344zM170.666 810.68H128.01c-11.812 0-21.344-9.562-21.344-21.344s9.532-21.344 21.344-21.344h42.654c11.782 0 21.342 9.562 21.342 21.344s-9.56 21.344-21.34 21.344zM895.988 789.336h-149.338c-54.374 0-81.686 29.282-95.03 53.812-13.532 24.934-15 49.214-15.124 51.902v0.938h42.718c0.406-4.062 2.376-19.156 10.5-33.562 11.594-20.464 30.218-30.434 56.936-30.434h149.338c11.782 0 21.312-9.532 21.312-21.312s-9.53-21.344-21.312-21.344z" fill="#DBA037" p-id="4326"></path><path d="M0.014 128.01h127.998v767.978H0.014zM895.988 128.01h127.998v767.978h-127.998z" fill="#FFCE54" p-id="4327"></path></symbol>`,
    Vertical: `<symbol id="iconVertical" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4241"><path d="M383.4 863.6V158.5c0-12.9-7.8-24.6-19.8-29.6s-25.7-2.2-34.9 6.9L76.9 387.7c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l197.2-197.2v627.9c0 17.7 14.3 32 32 32 17.6-0.1 32-14.4 32-32.1zM637.5 158.5v705.1c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9L944 634.4c6.2-6.2 9.4-14.4 9.4-22.6s-3.1-16.4-9.4-22.6c-12.5-12.5-32.8-12.5-45.3 0L701.5 786.4V158.5c0-17.7-14.3-32-32-32s-32 14.4-32 32z" p-id="4242"></path></symbol>`,
    WebSearch: `<symbol id="iconWebSearch" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M335.36 178.56a609.088 609.088 0 0 0-26.112 72.192H200.64a407.488 407.488 0 0 1 155.52-114.24 454.4 454.4 0 0 0-20.864 42.048z m-47.808 168.192c-8.512 51.84-13.12 107.52-13.12 165.248 0 65.92 5.952 129.024 16.96 186.752H151.04A404.672 404.672 0 0 1 105.6 512c0-58.88 12.48-114.752 35.008-165.248h146.944z m88.704 352A906.432 906.432 0 0 1 357.632 512c0-59.072 5.12-114.88 14.4-165.248h279.936c9.216 50.368 14.464 106.24 14.464 165.248 0 67.648-6.848 131.008-18.688 186.752H376.256z m-60.288 96c5.888 17.856 12.352 34.752 19.328 50.688 6.4 14.72 13.44 28.8 20.928 42.048a407.168 407.168 0 0 1-136.128-92.736h95.872z m88.384 0h215.296a460.736 460.736 0 0 1-7.168 17.344c-16.384 37.44-34.752 65.088-53.12 82.816-18.112 17.536-34.048 23.488-47.36 23.488-13.312 0-29.248-5.952-47.36-23.488-18.368-17.728-36.736-45.44-53.12-82.816a459.648 459.648 0 0 1-7.168-17.28z m303.68 0h95.872a407.168 407.168 0 0 1-136.128 92.736c7.552-13.248 14.528-27.328 20.928-42.048 6.976-15.936 13.44-32.832 19.328-50.688z m164.992-96h-140.416c11.008-57.728 17.024-120.896 17.024-186.752 0-57.728-4.608-113.472-13.184-165.248h146.944c22.528 50.56 35.008 106.432 35.008 165.248a404.608 404.608 0 0 1-45.376 186.752z m-158.272-448a608.384 608.384 0 0 0-26.048-72.192c-6.4-14.72-13.44-28.8-20.928-42.048a407.488 407.488 0 0 1 155.52 114.24h-108.544z m-87.232 0h-231.04c4.736-13.696 9.728-26.688 15.04-38.848 16.384-37.376 34.752-65.088 53.12-82.752 18.112-17.536 34.048-23.552 47.36-23.552 13.312 0 29.248 6.016 47.36 23.552 18.368 17.664 36.736 45.376 53.12 82.752 5.312 12.16 10.368 25.152 15.04 38.848zM1001.6 512A489.6 489.6 0 1 0 22.4 512a489.6 489.6 0 0 0 979.2 0z" p-id="1511"></path></WebSearch>`,
    Theme: '<symbol id="iconTheme" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2321"><path d="M1012.872533 322.1504l-0.1024-0.580267c-0.1024-0.682667-0.1024-2.491733-0.1024-3.4816v-1.365333l-1.877333-8.4992-0.238933-0.682667c-6.417067-18.670933-17.681067-30.242133-25.9072-38.6048l-5.9392-6.144a288.494933 288.494933 0 0 0-20.036267-20.514133c-5.768533-5.461333-11.1616-10.5472-16.725333-16.554667l-0.2048-0.238933-146.056534-146.0224-1.536-1.570133c-7.645867-7.953067-16.384-16.896-29.218133-23.688534-13.9264-7.714133-31.197867-9.284267-52.872533-9.284266-1.194667 0-4.437333 0-8.874667-0.136534-9.6256-0.1024-24.098133-0.341333-35.84-0.341333-13.7216 0-17.476267 0.238933-19.3536 0.580267a116.667733 116.667733 0 0 0-17.408 5.12l-1.262933 0.4096-18.7392 12.8-0.2048 0.136533c-8.533333 6.485333-14.1312 14.267733-18.261334 20.036267l-0.4096 0.580266-0.136533 0.238934a49.5616 49.5616 0 0 1-3.9936 5.2224c-14.916267 12.219733-25.224533 15.633067-54.203733 21.845333l-0.341334 0.136533-0.341333 0.1024c-4.744533 1.365333-8.533333 1.467733-10.1376 1.570134l-17.749333-0.887467c-15.223467-2.9696-26.624-5.666133-36.2496-9.966933l-0.341334-0.136534c-8.3968-3.413333-16.827733-9.6256-19.592533-13.346133l-1.4336-1.9456a117.248 117.248 0 0 0-22.357333-24.4736c-7.2704-6.144-22.186667-14.404267-31.505067-16.315733-6.997333-1.501867-18.056533-2.2528-33.518933-2.2528-25.122133 0-53.009067 1.911467-54.237867 2.048l-0.989867 0.068266-24.9856 6.382934-0.785066 0.341333c-16.725333 6.792533-28.228267 18.568533-35.84 26.385067L88.3712 234.564267c-4.539733 4.096-8.533333 8.192-12.356267 12.151466-3.310933 3.413333-6.519467 6.656-11.0592 10.8544C51.438933 269.482667 31.061333 287.470933 24.849067 320.853333c-3.515733 18.773333 3.584 35.4304 7.441066 44.407467l0.238934 0.443733c6.9632 15.9744 17.681067 26.146133 25.429333 33.621334l1.467733 1.365333 0.546134 0.477867c1.194667 0.887467 2.8672 2.594133 4.096 3.857066l5.632 5.768534c5.5296 6.212267 11.502933 11.776 17.271466 17.237333l19.114667 19.592533 35.293867 34.679467 10.069333 10.308267c0.682667 0.682667 1.3312 1.467733 2.116267 2.1504 3.959467 4.096 8.840533 9.216 15.36 13.9264l0.238933 0.238933c14.472533 9.966933 32.529067 15.735467 49.4592 15.735467 7.509333 0 14.609067-1.024 21.0944-3.140267v348.706133c0 13.0048-0.068267 27.648 5.2224 41.5744 7.202133 19.0464 22.1184 33.450667 32.768 40.004267 17.442133 11.6736 38.8096 13.277867 59.392 13.277867h327.714133l29.559467 0.443733c24.439467 0 52.292267-1.365333 74.205867-18.2272 14.062933-11.025067 24.917333-29.013333 29.013333-48.196267l0.1024-0.546133 0.682667-5.666133v-0.580267c0.443733-30.685867 0.443733-60.381867 0.443733-91.648v-279.8592c12.629333 4.061867 26.043733 4.778667 39.0144 2.048 30.208-5.802667 49.493333-28.433067 60.962133-42.154667l92.842667-92.091733 2.56-3.310933 0.955733-1.467734c6.7584-9.045333 22.254933-30.378667 17.851734-61.064533l-0.136534-0.580267z m-165.717333 111.035733l-0.887467 1.024c-6.417067 7.2704-15.0528 17.237333-20.923733 18.363734a13.2096 13.2096 0 0 1-2.8672 0.341333c-4.642133 0-8.635733-3.2768-18.602667-12.9024l-32.085333-31.6416-42.5984 30.037333v362.120534c0 14.848-0.1024 29.866667-0.238933 44.509866-0.1024 13.7216-0.170667 27.7504-0.170667 41.5744a19.968 19.968 0 0 1-2.798933 4.1984c-4.778667 3.413333-23.7568 3.857067-31.744 3.857067l-338.1248-0.443733-18.773334 0.443733c-16.2816 0-20.821333-1.501867-21.9136-2.048a21.230933 21.230933 0 0 1-4.983466-5.5296c-0.682667-3.515733-0.682667-13.380267-0.682667-18.944v-430.421333l-47.104-28.330667-6.417067 7.509333c-5.8368 6.826667-11.776 13.5168-17.8176 20.138667l-0.238933 0.238933c-6.826667 7.338667-12.4928 13.243733-18.773333 15.735467h-0.443734a21.060267 21.060267 0 0 1-9.3184-3.072l-0.443733-0.3072-0.443733-0.238933a25.9072 25.9072 0 0 1-4.983467-4.744534 41.335467 41.335467 0 0 1-2.082133-2.286933l-46.250667-45.738667a377.173333 377.173333 0 0 1-18.705067-19.182933l-0.750933-0.785067-2.56-1.911466c-3.413333-2.833067-6.519467-6.144-9.762133-9.5232a61.678933 61.678933 0 0 0-3.515734-3.652267l-6.314666-6.894933-0.1024-0.1024c-2.56-2.628267-4.778667-4.881067-7.509334-7.168-5.973333-5.188267-8.0896-7.68-9.4208-10.615467a29.422933 29.422933 0 0 0-1.3312-3.652267 7.9872 7.9872 0 0 1-0.546133-1.467733c1.536-6.212267 5.5296-10.410667 17.92-21.742933l0.238933-0.238934 12.8-13.141333c1.4336-1.501867 3.003733-2.935467 4.642134-4.539733 1.911467-1.809067 3.754667-3.618133 5.870933-5.768534L264.874667 157.627733l27.989333-28.194133 0.341333-0.341333c8.772267-9.5232 10.410667-10.308267 14.7456-10.5472l13.277867-1.024h55.842133l0.887467 0.341333c1.024 0.341333 1.774933 0.580267 2.218667 0.9216l0.785066 0.341333 0.750934 0.238934a9.216 9.216 0 0 0 1.911466 0.546133c2.730667 2.730667 5.5296 6.007467 8.8064 10.5472l1.467734 1.911467 0.238933 0.238933c15.5648 20.1728 40.379733 32.085333 47.547733 35.2256l0.238934 0.1024c14.9504 6.2464 30.72 10.581333 53.111466 14.506667l0.443734 0.136533 16.042666 1.467733c3.1744 0.580267 6.621867 0.785067 10.376534 0.785067 7.0656 0 15.291733-0.9216 25.258666-2.935467 35.498667-7.031467 57.275733-14.404267 84.718934-36.488533a81.237333 81.237333 0 0 0 16.384-18.1248c1.4336-1.604267 2.6624-3.1744 3.754666-4.539733 0.1024-0.238933 0.341333-0.443733 0.546134-0.682667l6.621866-3.857067c1.1264-0.2048 2.56-0.443733 4.334934-0.887466h16.5888c2.56 0 5.2224-0.136533 7.748266-0.238934 2.6624-0.1024 5.461333-0.238933 8.192-0.238933h0.887467c5.3248-0.443733 10.717867-0.443733 16.384-0.443733 13.380267 0 18.807467 0.9216 20.48 1.2288 3.754667 2.286933 9.045333 7.748267 13.687467 12.458666l145.271466 144.827734c5.870933 6.485333 12.151467 12.458667 19.3536 19.285333 4.881067 4.5056 11.537067 10.752 16.725334 16.520533l0.238933 0.238934 6.621867 6.826666 0.238933 0.068267c4.1984 3.9936 6.587733 6.690133 8.260267 9.216l0.682666 4.608v0.238933c0.1024 0.443733 0.341333 1.570133-3.6864 7.133867l-90.9312 90.4192-3.072 3.754667z" p-id="2322"></path></symbol>',
    Transfer: `<symbol id="iconTransfer" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3385" width="16" height="16"><path d="M512 85.333333a42.666667 42.666667 0 1 0 0 85.333334 341.461333 341.461333 0 0 1 333.525333 268.373333l-58.453333-29.226667a42.666667 42.666667 0 0 0-38.144 76.330667l128 64A42.666667 42.666667 0 0 0 938.666667 511.957333C938.666667 276.352 747.648 85.333333 512 85.333333z" p-id="3386"></path><path d="M314.496 140.202667a174.336 174.336 0 1 0 0 348.586666 174.336 174.336 0 0 0 0-348.586666zM225.536 314.453333a89.002667 89.002667 0 1 1 177.962667 0 89.002667 89.002667 0 0 1-177.962667 0zM709.461333 535.168a174.293333 174.293333 0 1 0 0 348.586667 174.293333 174.293333 0 0 0 0-348.586667z m-88.96 174.293333a88.96 88.96 0 1 1 177.962667 0 88.96 88.96 0 0 1-177.962667 0z" p-id="3387"></path><path d="M105.6 475.733333a42.666667 42.666667 0 0 1 41.514667-1.877333l128 64a42.666667 42.666667 0 1 1-38.186667 76.288l-58.453333-29.184A341.418667 341.418667 0 0 0 512 853.333333a42.666667 42.666667 0 1 1 0 85.333334C276.352 938.666667 85.333333 747.648 85.333333 512a42.666667 42.666667 0 0 1 20.266667-36.266667z" p-id="3388"></path></symbol>`,
    Top: `<symbol id="iconTop" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" stroke-width="0.5"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M2.5 2.5a.75.75 0 010-1.5H13a.75.75 0 010 1.5H2.5zM2.985 9.795a.75.75 0 001.06-.03L7 6.636v7.614a.75.75 0 001.5 0V6.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 00.03 1.06z"></path> </g> </g></symbol>`
};

