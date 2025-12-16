/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-11-21 17:19:12
 * @Description  : 
 * @FilePath     : /src/func/private-func/html-pages.ts
 * @LastEditTime : 2025-12-16 22:41:00
 */
import FMiscPlugin from "@/index"
import { getLute, openCustomTab } from "@frostime/siyuan-plugin-kits";
import { readDir, request, getFile, putFile, getFileBlob } from "@frostime/siyuan-plugin-kits/api"
import { IMenu } from "siyuan";
import { config } from "./config";

interface IURLs {
    // name: urlstring
    [key: string]: string;
}
const URL_FILE = 'urls.json';

const DATA_DIR = '/data/snippets/fmisc-custom-pages/';

const _ensureDataDir = async () => {
    const response = await readDir(DATA_DIR);

    if (response === null) {
        await putFile(DATA_DIR, true, new Blob([]));
    }
}

const _joinPath = (...parts: string[]) => {
    const endpoint = parts.map((part, index) => {
        if (index === 0) {

            return part.replace(/\/+$/g, ''); // Remove trailing slashes for the first part
        }
        return part.replace(/^\/+|\/+$/g, ''); // Remove leading and trailing slashes for other parts
    }).join('/');
    return DATA_DIR + endpoint;
}

function getCSSVariable(variableName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}



export const load = async (plugin_: FMiscPlugin) => {
    const menus: IMenu[] = [];

    await _ensureDataDir();

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
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            if (config.zoom && config.zoom !== 1) {
                                iframe.style.zoom = String(config.zoom);
                            }
                            // 等待加载完成后再注入
                            iframe.addEventListener('load', () => {
                                console.log('Iframe loaded, injecting pluginSdk...');
                                const style = {
                                    'font-family': getCSSVariable('--b3-font-family'),
                                    'font-size': getCSSVariable('--b3-font-size'),
                                    'font-family-code': getCSSVariable('--b3-font-family-code'),
                                }
                                try {
                                    // @ts-ignore
                                    iframe.contentWindow.pluginSdk = {
                                        request: async (endpoint: string, data: any) => {
                                            if (endpoint === '/api/file/getFile') {
                                                const blob = await getFileBlob(data.path);
                                                return blob ? {
                                                    ok: true,
                                                    data: blob
                                                } : {
                                                    ok: false,
                                                    data: null
                                                }
                                            }
                                            const response = await request(endpoint, data, 'response');
                                            return {
                                                ok: response.code === 0,
                                                data: response.data
                                            }
                                        },
                                        loadConfig: async () => {
                                            const fileName = `${filename}.config.json`;
                                            const filePath = _joinPath(fileName);
                                            const fileContent = await getFile(filePath);
                                            return fileContent ? fileContent : {};
                                        },
                                        saveConfig: async (newConfig: Record<string, any>) => {
                                            const fileName = `${filename}.config.json`;
                                            const filePath = _joinPath(fileName);
                                            const blob = new Blob([JSON.stringify(newConfig, null, 2)], { type: 'application/json' });
                                            await putFile(filePath, false, blob);
                                        },
                                        themeMode: document.body.parentElement.getAttribute('data-theme-mode') as ('light' | 'dark'),
                                        style: style,
                                        lute: getLute()
                                    };

                                    // 注入 style
                                    const styleSheet = document.createElement('style');

                                    styleSheet.textContent = `
                                        body {
                                            font-family: ${style['font-family']};
                                            font-size: ${style['font-size']};
                                        }

                                        pre, code {
                                            font-family: ${style['font-family-code']};
                                        }
                                    `
                                    iframe.contentDocument.head.appendChild(styleSheet);

                                    // 注入完成后触发事件
                                    iframe.contentWindow.dispatchEvent(new CustomEvent('pluginSdkReady'));

                                    const script = iframe.contentWindow.document.createElement('script');
                                    script.type = 'text/javascript';
                                    script.text = "console.log('SiYuan Code 成功注入了!')";
                                    iframe.contentWindow.document.head.appendChild(script);
                                } catch (e) {
                                    console.error('Failed to inject pluginSdk:', e);
                                }
                            });
                            iframe.src = href;
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
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            if (config.zoom && config.zoom !== 1) {
                                iframe.style.zoom = String(config.zoom);
                            }
                            // 先添加iframe并设置src
                            iframe.src = url;
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

export const Prompt = `
请你根据用户的指令需要编写一个单 HTML 页面应用以满足他的需求。

页面会从外部注入 \`window.pluginSdk\` 对象，包含以下方法：
- \`request(endpoint: string, data: any): Promise<{ok: boolean, data: any}>\`：用于向思源笔记的后端 API 发起请求
  - 注: /api/file/getFile 接口同思源官方 API 不同，会返回 Blob 对象
- \`loadConfig(): Promise<Record<string, any>>\`：用于加载当前页面的配置数据
- \`saveConfig(newConfig: Record<string, any>): Promise<void>\`：用于保存当前页面的配置数据
- \`themeMode: 'light' | 'dark'\`：当前主题模式
- \`style: Record<string, string>\`：包含当前主题要求的样式变量，例如字体、字号等
    - keys: 'font-family', 'font-size', 'font-family-code'

SDK 会在页面加载时自动注入，你可以监听 \`pluginSdkReady\` 事件来确保 SDK 已就绪：

\`\`\`javascript
window.addEventListener('pluginSdkReady', () => {
    console.log('SDK 已就绪');
    // 可以开始使用 window.pluginSdk
    // init()
});

// 或者直接使用（如果不确定时机，建议用事件）
const result = await window.pluginSdk.request('/api/notebook/lsNotebooks', {});
\`\`\`

用户的需求如下
------
`;

