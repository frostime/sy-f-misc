import { deepMerge, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";
import { documentDialog } from "@/libs/dialog";
import type FMiscPlugin from "@/index";

type ZoteroConfig = {
    zoteroPassword: string;
    migrationPromptPending: boolean;
};

type ZoteroConnectionStatus = {
    localApi: boolean;
    bridge: boolean;
};

const ZOTERO_LOCAL_API = 'http://127.0.0.1:23119/api/';
const ZOTERO_BRIDGE_STATUS = 'http://127.0.0.1:23119/f-zotero-ext/api/v1/status';

let configs: ZoteroConfig = {
    zoteroPassword: '',
    migrationPromptPending: false,
};

let zoteroDir: Record<string, string> = {};
let configLoadPromise: Promise<void> = null;

export const getZoteroDir = () => {
    const device = window.siyuan.config.system;
    return zoteroDir[device.id] ?? '';
}

export const getPassword = () => {
    return configs.zoteroPassword;
}

export const ensureZoteroConfigLoaded = (data: Partial<ZoteroConfig> = {}) => {
    configLoadPromise ??= loadZoteroConfig(data);
    return configLoadPromise;
}

export const shouldShowMigrationPrompt = () => {
    return configs.migrationPromptPending;
}

export const markMigrationPromptShown = async () => {
    configs.migrationPromptPending = false;
    await saveZoteroModuleConfig();
}

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'Zotero',
    title: 'Zotero',
    load: (data: Partial<ZoteroConfig> = {}) => {
        return ensureZoteroConfigLoaded(data);
    },
    dump: () => ({
        zoteroPassword: configs.zoteroPassword,
        migrationPromptPending: configs.migrationPromptPending,
        // zoteroDir is device-local state; keeping it out of custom-module.config.json avoids cross-device path leakage.
    }),
    items: [
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
            type: 'textinput',
            title: 'Zotero Debug-Bridge Token（已废弃）',
            description: '新版不再使用 debug-bridge。此 Token 仅保留作为旧配置参考，不影响当前功能。',
            key: 'legacyToken',
            get: () => configs.zoteroPassword,
            set: (value: string) => {
                configs.zoteroPassword = value;
            }
        },
        {
            type: 'button',
            title: '迁移指南',
            description: '从旧版 Better BibTeX debug-bridge 迁移到新版 Local API + Bridge 的详细说明',
            key: 'showMigrationGuide',
            get: () => '',
            set: () => {
            },
            button: {
                label: '查看迁移指南',
                callback: () => {
                    documentDialog({
                        title: 'Zotero 功能迁移指南',
                        sourceUrl: `{{docs}}/zotero-migration.md`,
                    });
                }
            }
        },
        {
            type: 'button',
            title: '检查 Zotero 连接',
            description: '检查 Zotero Local API 和 sy-f-misc Bridge 扩展是否正常',
            key: 'checkZoteroConnection',
            get: () => '',
            set: () => {
            },
            button: {
                label: '检查连接',
                callback: async () => {
                    const status = await checkZoteroConnection();
                    showConnectionStatus(status);
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

const loadZoteroConfig = async (data: Partial<ZoteroConfig>) => {
    const plugin = thisPlugin() as unknown as FMiscPlugin;
    const legacyPassword = plugin.getConfig('Misc', 'zoteroPassword');
    const hasLegacyPassword = typeof legacyPassword === 'string' && legacyPassword.trim() !== '';

    configs = {
        zoteroPassword: data.zoteroPassword ?? (hasLegacyPassword ? legacyPassword : ''),
        migrationPromptPending: data.migrationPromptPending ?? hasLegacyPassword,
    };

    const configDir = await plugin.loadData('zoteroDir.config.json');
    if (configDir) {
        zoteroDir = deepMerge(zoteroDir, configDir);
    }
}

const saveZoteroModuleConfig = async () => {
    const plugin = thisPlugin();
    const storageName = 'custom-module.config.json';
    const storage = await plugin.loadData(storageName) || {};
    storage.Zotero = declareModuleConfig.dump();
    await plugin.saveData(storageName, storage);
}

const checkZoteroConnection = async (): Promise<ZoteroConnectionStatus> => {
    const [localApi, bridge] = await Promise.all([
        isEndpointReachable(ZOTERO_LOCAL_API),
        isEndpointReachable(ZOTERO_BRIDGE_STATUS),
    ]);
    return { localApi, bridge };
}

const isEndpointReachable = async (url: string) => {
    try {
        const response = await fetch(url);
        return response.ok;
    } catch (error) {
        console.warn(`Zotero connection check failed: ${url}`, error);
        return false;
    }
}

const showConnectionStatus = (status: ZoteroConnectionStatus) => {
    if (status.localApi && status.bridge) {
        showMessage('Zotero Local API 和 Bridge 扩展连接成功', 3000);
        return;
    }
    if (status.localApi) {
        showMessage('Zotero 已连接，但 Bridge 扩展未安装或未启动', 5000, 'error');
        return;
    }
    if (status.bridge) {
        showMessage('Bridge 扩展已启动，但 Zotero Local API 不可用', 5000, 'error');
        return;
    }
    showMessage('无法连接到 Zotero，请确认 Zotero 已启动并安装 Bridge 扩展', 5000, 'error');
}
