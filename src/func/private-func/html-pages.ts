import FMiscPlugin from "@/index"
import { openCustomTab } from "@frostime/siyuan-plugin-kits";
import { readDir } from "@frostime/siyuan-plugin-kits/api"
import { IMenu } from "siyuan";
import { config } from "./config";


export const load = async (plugin_: FMiscPlugin) => {
    // plugin_.registerMenuTopMenu
    const files = await readDir(`data/plugins/${plugin_.name}/pages`)
    if (!files) return;
    let filenames = files.filter(f => !f.isDir).map(f => f.name).filter(f => f.endsWith('.html'));
    if (filenames.length === 0) return;
    const menus: IMenu[] = [];
    for (const filename of filenames) {
        // const content = await fetch(`plugins/${plugin_.name}/pages/${filename}`).then(res => res.text());
        menus.push({
            label: filename,
            click: () => {
                openCustomTab({
                    tabId: 'html' + filename,
                    plugin: plugin_,
                    title: filename,
                    render: (container: Element) => {
                        const href = `/plugins/${plugin_.name}/pages/${filename}`;
                        const iframe = document.createElement('iframe');
                        iframe.src = href;
                        iframe.style.width = '100%';
                        iframe.style.height = '100%';
                        if (config.zoom && config.zoom !== 1) {
                            iframe.style.zoom = String(config.zoom);
                        }
                        container.appendChild(iframe);
                    }
                });
            }
        });
    }
    setTimeout(() => {
        plugin_.registerMenuTopMenu('HTML Pages', [{
            label: 'HTML Pages',
            submenu: menus
        }]);
    }, 500);
}
