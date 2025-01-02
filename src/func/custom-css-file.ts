/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-11-23 15:37:06
 * @FilePath     : /src/func/custom-css-file.ts
 * @LastEditTime : 2025-01-02 22:05:24
 * @Description  : 
 */
import { putFile } from "@/api";
import type FMiscPlugin from "@/index";
import { showMessage } from "siyuan";
// import { showMessage } from "siyuan";

let cp: any;
try {
    cp = window?.require('child_process');
} catch (e) {
    cp = null;
}
const fname = 'custom.css';

const dataDir = window.siyuan.config.system.dataDir;
const cssPath = `${dataDir}/public/${fname}`;

const DEFAULT_STYLE = `
.protyle-wysiwyg {}
`.trim();

export let name = "custom-css-file";
export let enabled = false;

export const declareToggleEnabled = {
    title: '🎨 自定义 CSS',
    description: '启用自定义 CSS 功能',
    defaultEnabled: false
};

let cssWatchInterval: NodeJS.Timeout | null = null;

let codeEditor = 'code';
export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'custom-css-file',
    init: (data: { codeEditor: string }) => {
        data.codeEditor && (codeEditor = data.codeEditor);
    },
    items: [
        {
            key: 'codeEditor',
            title: '编辑命令',
            description: '编辑自定义 CSS 的命令, 默认为 code, 表示使用 vs code 打开',
            type: 'textinput',
            get: () => codeEditor,
            set: (value: string) => {
                codeEditor = value;
            }
        }
    ]
}

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    let link: HTMLLinkElement | null = null;

    fetch(`/public/${fname}`).then(res => {
        if (!res.ok) {
            const file = new File([DEFAULT_STYLE], fname, { type: 'text/css' });
            putFile(`/data/public/${fname}`, false, file);
        }
        // 添加一个 style 链接
        link = document.createElement('link');
        link.href = `/public/${fname}?t=${Date.now()}`;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.id = 'custom-css-file';
        document.head.appendChild(link);
    });

    plugin.registerMenuTopMenu('custom-css-file', [{
        label: '自定义 CSS',
        icon: 'iconSparkles',
        submenu: [
            {
                label: '编辑',
                icon: 'iconEdit',
                click: () => {
                    let editorCmd = codeEditor + ' ' + cssPath;
                    if (cp) {
                        try {
                            cp.exec(editorCmd);
                        } catch (error) {
                            showMessage(`打开编辑器失败: ${error.message}`, 3000, 'error');
                        }
                    }
                }
            },
            {
                label: '刷新',
                icon: 'iconRefresh',
                click: () => {
                    if (link) {
                        const timestamp = Date.now();
                        link.href = `/public/${fname}?t=${timestamp}`;
                    }
                }
            }
        ]
    }]);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;

    // 清理 interval
    if (cssWatchInterval) {
        clearInterval(cssWatchInterval);
        cssWatchInterval = null;
    }

    plugin.unRegisterMenuTopMenu('custom-css-file');
    // 删除 style 链接
    const link = document.getElementById('custom-css-file');
    if (link) {
        link.remove();
    }
}
