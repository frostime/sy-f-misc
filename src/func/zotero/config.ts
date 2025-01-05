import { deepMerge, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { ZoteroDBModal } from "./zoteroModal";
import { showMessage } from "siyuan";

let configs = {
    zoteroPassword: 'CTT',
}

let zoteroDir = {};

export const getZoteroDir = () => {
    const device = window.siyuan.config.system;
    return zoteroDir[device.id] ?? '';
}

export const getPassword = () => {
    return configs.zoteroPassword;
}

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'Zotero',
    title: 'Zotero 7',
    load: async (data: { zoteroPassword: string, zoteroDir: string }) => {
        configs.zoteroPassword = data.zoteroPassword ?? configs.zoteroPassword;
        let plugin = thisPlugin();
        let configDir = await plugin.loadData('zoteroDir.config.json');
        if (configDir) {
            zoteroDir = deepMerge(zoteroDir, configDir);
        }
    },
    items: [
        {
            type: 'textinput',
            title: 'Zotero Password',
            description: 'Zotero Debug-Bridge 的密码',
            key: 'zoteroPassword',
            get: () => configs.zoteroPassword,
            set: (value: string) => {
                configs.zoteroPassword = value;
            }
        },
        {
            type: 'textinput',
            title: 'Zotero 存储目录',
            description: 'Zotero 的数据存储位置',
            key: 'zoteroDir',
            get: getZoteroDir,
            set: (value: string) => {
                const device = window.siyuan.config.system;
                zoteroDir[device.id] = value;
                const plugin = thisPlugin();
                plugin.saveData('zoteroDir.config.json', zoteroDir);
            }
        },
        {
            type: 'button',
            title: '检查 Zotero 连接',
            description: '',
            key: 'checkZoteroConnection',
            get: () => '',
            set: () => {
            },
            button: {
                label: '检查连接',
                callback: () => {
                    let zotero = new ZoteroDBModal();
                    zotero.checkZoteroRunning().then(res => {
                        if (res) {
                            showMessage("Zotero 连接成功", 3000);
                        } else {
                            showMessage("无法连接到 Zotero", 3000, 'error');
                        }
                    });
                }
            }
        }
    ]
}
