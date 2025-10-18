import FMiscPlugin from "@/index"
import { openCustomTab } from "@frostime/siyuan-plugin-kits";
import { readDir } from "@frostime/siyuan-plugin-kits/api"
import { IMenu } from "siyuan";
import { config } from "./config";

interface IURLs {
    // name: urlstring
    [key: string]: string;
}
const URL_FILE = 'urls.json';


export const load = async (plugin_: FMiscPlugin) => {
    const menus: IMenu[] = [];

    // debugger
    // 1. 读取 HTML 文件
    const files = await readDir(`data/plugins/${plugin_.name}/pages`);
    if (files) {
        let filenames = files.filter(f => !f.isDir).map(f => f.name).filter(f => f.endsWith('.html'));
        for (const filename of filenames) {
            menus.push({
                label: `📄 ${filename}`,
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
    }

    // 2. 读取 URL 文件
    const urlsResponse = await fetch(`/plugins/${plugin_.name}/pages/${URL_FILE}`);
    if (urlsResponse.ok) {
        const urlsData = await urlsResponse.json() as IURLs;
        for (const [name, url] of Object.entries(urlsData)) {
            menus.push({
                label: `🌐 ${name}`,
                click: () => {
                    openCustomTab({
                        tabId: 'url' + encodeURIComponent(url),
                        plugin: plugin_,
                        title: name,
                        render: (container: Element) => {
                            const iframe = document.createElement('iframe');
                            iframe.src = url;
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
    }

    // 3. 注册菜单
    if (menus.length > 0) {
        setTimeout(() => {
            plugin_.registerMenuTopMenu('HTML Pages', [{
                label: 'HTML Pages & URLs',
                icon: 'iconHTML',
                submenu: menus
            }]);
        }, 500);
    }
}
