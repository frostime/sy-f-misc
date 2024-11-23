import { putFile } from "@/api";
import type FMiscPlugin from "@/index";
import { Menu, showMessage } from "siyuan";

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

function showMenu(menu: Menu) {

    menu.addItem({
        label: '自定义 CSS',
        icon: 'iconSparkles',
        click: async () => {
            const res = await fetch(`/public/${fname}`);
            if (!res.ok) return;
            if (cp?.exec) {
                cp.exec(`start ${cssPath}`);
            } else {
                showMessage('无法打开文件', 3000, 'error');
            }
        }
    });
}

export let name = "custom-css-file";
export let enabled = false;

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eb.on('on-topbar-menu', showMenu);

    fetch(`/public/${fname}`).then(res => {
        if (!res.ok) {
            const file = new File([DEFAULT_STYLE], fname, { type: 'text/css' });
            putFile(`/data/public/${fname}`, false, file);
        }
        // 添加一个 style 链接
        const link = document.createElement('link');
        link.href = `/public/${fname}`;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.id = 'custom-css-file';
        document.head.appendChild(link);
    });
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.eb.off('on-topbar-menu', showMenu);
    // 删除 style 链接
    const link = document.getElementById('custom-css-file');
    if (link) {
        link.remove();
    }
}
