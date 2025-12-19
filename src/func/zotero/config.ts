import { deepMerge, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { ZoteroDBModal } from "./zoteroModal";
import { showMessage } from "siyuan";
import { documentDialog } from "@/libs/dialog";

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
            title: 'Zotero Debug-Bridge 访问 Token, 默认 CTT',
            description: `依赖于 <a href="https://github.com/retorquere/zotero-better-bibtex/tree/master/test/fixtures/debug-bridge">Zotero Debug-Bridge</a> 插件, 测试版本: Zotero 7 / 插件版本 1.0
<br />
在 Zotero 面板中设置 Token: Zotero.Prefs.set("extensions.zotero.debug-bridge.token","<你的Token>",true);
`,
            key: 'zoteroPassword',
            get: () => configs.zoteroPassword,
            set: (value: string) => {
                configs.zoteroPassword = value;
            }
        },
        {
            type: 'textinput',
            title: 'Zotero 数据存储目录',
            description: '见 Zotero 「设置 - 高级 - 数据存储目录」；本配置选项在各个设备上互相独立',
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
    ],
    help: () => {
        documentDialog({
            sourceUrl: `{{docs}}/zotero-desc.md`,
        });
    }
}
