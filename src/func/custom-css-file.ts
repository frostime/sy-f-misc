/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-11-23 15:37:06
 * @FilePath     : /src/func/custom-css-file.ts
 * @LastEditTime : 2025-03-29 23:33:26
 * @Description  : 
 */
// import { putFile, readDir } from "@/api"
import { putFile, readDir } from "@frostime/siyuan-plugin-kits/api";
import type FMiscPlugin from "@/index";
import { showMessage } from "siyuan";
import { sharedConfigs } from "./shared-configs";
import { updateStyleDom } from "@frostime/siyuan-plugin-kits";
import { documentDialog } from "@/libs/dialog";
// import { showMessage } from "siyuan";

let cp: any;
try {
    cp = window?.require?.('child_process');
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


const attachCSSLink = (endpoint: string, id?: string) => {
    if (id) {
        const link = document.querySelector(`link#${id}`);
        if (link) {
            link.remove();
        }
    }
    // const res = await fetch(endpoint);
    // if (!res.ok) {
    //     return false;
    // }
    let link = document.createElement('link');
    link.href = `${endpoint}?t=${Date.now()}`;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    id && (link.id = id);
    document.head.appendChild(link);
    // return true;
    return link;
}

const STYLE_FILE_ID = [];

const CUSTOM_CSS_SNIPPET_ID = 'snippetCSS__fmisc__custom-css-snippet';
const updateCustomCSSFile = async (create: boolean) => {
    const res = await fetch(`/public/${fname}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
        if (create) {
            const file = new File([DEFAULT_STYLE], fname, { type: 'text/css' });
            putFile(`/data/public/${fname}`, false, file);
        }
    } else {
        let css = await res.text();
        updateStyleDom(CUSTOM_CSS_SNIPPET_ID, css);
    }
}

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    updateCustomCSSFile(true);

    plugin.registerMenuTopMenu(name, [{
        label: '自定义 CSS',
        icon: 'iconSparkles',
        submenu: [
            {
                label: '编辑',
                icon: 'iconEdit',
                click: () => {
                    let editorCmd = sharedConfigs('codeEditor') + ' ' + cssPath;
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
                    updateCustomCSSFile(false);
                }
            }
        ]
    }]);

    readDir('/data/public/styles/').then(res => {
        if (res === null) return;
        const files = res.filter(item => item.isDir === false && item.name.endsWith('.css'));
        console.log('Petal Styles:');
        console.log(files);
        files.forEach(file => {
            const id = `fmisc-custom-css__${file.name}`;
            attachCSSLink(`/public/styles/${file.name}`, id);
        });
    });
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;

    // 清理 interval
    if (cssWatchInterval) {
        clearInterval(cssWatchInterval);
        cssWatchInterval = null;
    }

    plugin.unRegisterMenuTopMenu(name);
    // 删除 style 链接
    STYLE_FILE_ID.forEach(id => {
        const link = document.getElementById(id);
        if (link) {
            link.remove();
        }
    });
}


export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: name,
    title: 'CSS Files',
    load: () => { },
    items: [
        // {
        //     type: 'hint',
        //     title: '说明',
        //     description: `<ul>
        //         <li>默认样式文件位于 /data/public/custom.css，可通过顶栏快速编辑，并随时更新</li>
        //         <li>可以将一些其他的自定义 CSS 文件放入 /data/public/styles/ 目录，插件会在启动时自动加载样式</li>
        //     </ul>`,
        //     key: 'hint',
        //     get: () => '',
        //     set: () => { }
        // }
    ],
    help: () => {
        documentDialog({
            markdown: `
**在 CSS 文件中自定义样式**

开启后，可在顶部菜单栏中点击“编辑自定义 CSS”，插件将打开一个 CSS 文件供你配置自定义的思源样式，点击“刷新”即可更新样式。

你也可以将其他自定义 CSS 文件放入 /data/public/styles/ 目录，插件会在启动时自动加载这些样式。
`
        });
    }
}

