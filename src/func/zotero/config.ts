import { deepMerge, thisPlugin } from "@frostime/siyuan-plugin-kits";

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
    init: async (data: { zoteroPassword: string, zoteroDir: string }) => {
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
        }
    ]
}
