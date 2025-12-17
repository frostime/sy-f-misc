/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-17
 * @FilePath     : /src/func/html-pages/index.ts
 * @LastEditTime : 2025-12-17 16:17:43
 * @Description  : HTML Pages Module - Display custom HTML pages and URLs
 */
import FMiscPlugin from "@/index";
import { getLute, openCustomTab, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { getFile, putFile, getFileBlob, request } from "@frostime/siyuan-plugin-kits/api";
import { html2ele } from "@frostime/siyuan-plugin-kits";
import { IMenu, showMessage } from "siyuan";
import { simpleFormDialog } from "@/libs/dialog";

interface IPageConfig {
    id: string;
    type: 'url' | 'html';
    source: string; // http URL or HTML filename
    title?: string; // Display name
}

const DATA_DIR = '/data/snippets/fmisc-custom-pages/';
const CONFIG_FILE = 'config.json';

let plugin: FMiscPlugin;
let zoom: number = 1; // Default zoom level

const _joinPath = (...parts: string[]) => {
    const endpoint = parts.map((part, index) => {
        if (index === 0) {
            return part.replace(/\/+$/g, '');
        }
        return part.replace(/^\/+|\/+$/g, '');
    }).join('/');
    return DATA_DIR + endpoint;
}

function getCSSVariable(variableName: string) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}

const loadConfig = async (): Promise<IPageConfig[]> => {
    const configPath = _joinPath(CONFIG_FILE);
    try {
        const content = await getFile(configPath);
        if (!content || content.code === 404) {
            return [];
        }
        if (content) {
            return content as IPageConfig[];
        }
    } catch (e) {
        console.warn('Failed to load config:', e);
    }
    return [];
}

const saveConfig = async (config: IPageConfig[]) => {
    const configPath = _joinPath(CONFIG_FILE);
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    try {
        await putFile(configPath, false, blob);
    } catch (e) {
        console.error('Failed to save config:', e);
    }
}

const openPage = (config: IPageConfig) => {
    const tabId = config.type === 'url'
        ? 'url-' + encodeURIComponent(config.source)
        : 'html-' + config.id;

    const title = config.title || (config.type === 'url' ? config.source : config.id);

    openCustomTab({
        tabId,
        plugin,
        title,
        render: (container: Element) => {
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            if (zoom && zoom !== 1) {
                iframe.style.zoom = String(zoom);
            }

            if (config.type === 'html') {
                const href = `${DATA_DIR.replace('/data', '')}${config.source}`;

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
                                const fileName = `conf/${config.source}.config.json`;
                                const filePath = _joinPath(fileName);
                                try {
                                    const fileContent = await getFile(filePath);
                                    return fileContent ? fileContent : {};
                                } catch (e) {
                                    return {}
                                }
                            },
                            saveConfig: async (newConfig: Record<string, any>) => {
                                const fileName = `conf/${config.source}.config.json`;
                                const filePath = _joinPath(fileName);
                                const blob = new Blob([JSON.stringify(newConfig, null, 2)], { type: 'application/json' });
                                try {
                                    await putFile(filePath, false, blob);
                                } catch (e) {
                                    console.error('Failed to save config:', e);
                                }
                            },
                            themeMode: document.body.parentElement.getAttribute('data-theme-mode') as ('light' | 'dark'),
                            style: style,
                            lute: getLute()
                        };

                        // Inject style
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

                        iframe.contentWindow.dispatchEvent(new CustomEvent('pluginSdkReady'));

                        const script = iframe.contentWindow.document.createElement('script');
                        script.type = 'text/javascript';
                        script.text = "console.log('SiYuan SDK successfully injected!')";
                        iframe.contentWindow.document.head.appendChild(script);
                    } catch (e) {
                        console.error('Failed to inject pluginSdk:', e);
                    }
                });
                iframe.src = href;
            } else {
                // URL type
                iframe.src = config.source;
            }

            container.appendChild(iframe);
        }
    });
}

const registerMenus = async () => {
    const configs = await loadConfig();

    if (configs.length === 0) return;

    const menus: IMenu[] = configs.map(config => ({
        label: `${config.type === 'html' ? '📄' : '🌐'} ${config.title || config.source}`,
        click: () => openPage(config)
    }));

    setTimeout(() => {
        plugin.registerMenuTopMenu('HTML Pages', [{
            label: 'HTML Pages & URLs',
            icon: 'iconHTML',
            submenu: menus
        }]);
    }, 500);
}

export const name = 'HTMLPages';
export const enabled = false;

export const load = async (plugin_: FMiscPlugin) => {
    plugin = plugin_;

    // Ensure data directory exists
    try {
        const blob = new Blob([]);
        await putFile(DATA_DIR, true, blob);
    } catch (e) {
        console.warn('Data directory may already exist:', e);
    }

    registerMenus();
}

export const unload = () => {
    // Cleanup if needed
}

export const declareToggleEnabled = {
    title: '📝 HTML Pages',
    description: '自定义单页面 HTML 应用，自行扩展功能',
    defaultEnabled: false
}

export const declareModuleConfig = {
    key: name,
    title: '自定义单页面 HTML 应用, 页面可使用 window.pluginSdk 实现与思源交互',
    items: [],
    customPanel: () => {
        return createConfigPanel();
    }
}

function createConfigPanel(): ExternalElementWithDispose {
    let configs: IPageConfig[] = [];
    let container: HTMLElement;

    const render = async () => {
        configs = await loadConfig();

        const html = `
            <div class="html-pages-config" style="padding: 16px;">
                <div style="margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="b3-button b3-button--outline" data-action="add-html">
                        <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
                        Add HTML File
                    </button>
                    <button class="b3-button b3-button--outline" data-action="add-url">
                        <svg class="b3-button__icon"><use xlink:href="#iconLink"></use></svg>
                        Add URL
                    </button>
                    <button class="b3-button b3-button--outline" data-action="add-html-text">
                        <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                        Add HTML Content
                    </button>
                    <span style="flex: 1;"></span>
                    <button class="b3-button b3-button--outline" data-action="show-prompt">
                        <svg class="b3-button__icon"><use xlink:href="#iconSparkles"></use></svg>
                        辅助 Prompt
                    </button>
                </div>

                <div class="config-list" style="border: 1px solid var(--b3-border-color); border-radius: 4px;">
                    ${configs.length === 0 ? `
                        <div style="padding: 32px; text-align: center; color: var(--b3-theme-on-surface-light);">
                            No pages configured yet
                        </div>
                    ` : configs.map(config => `
                        <div class="config-item" data-id="${config.id}" style="
                            padding: 12px 16px;
                            border-bottom: 1px solid var(--b3-border-color);
                            display: flex;
                            align-items: center;
                            gap: 12px;
                        ">
                            <span style="font-size: 20px;">${config.type === 'html' ? '📄' : '🌐'}</span>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 500; margin-bottom: 4px;">
                                    ${config.title || config.source}
                                </div>
                                <div style="font-size: 12px; color: var(--b3-theme-on-surface-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    ${config.source}
                                </div>
                            </div>
                            <button class="b3-button b3-button--outline" data-action="delete" data-id="${config.id}" title="Delete">
                                <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.innerHTML = '';
        const element = html2ele(html) as HTMLElement;
        container.appendChild(element);

        element.querySelector('[data-action="show-prompt"]')?.addEventListener('click', async () => {
            const lute = getLute();
            // @ts-ignore
            const promptHtml = lute.Md2HTML(Prompt);
            const html = `
                    <div style="width: 100%; padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px;">
                        <div style="display: inline-flex; gap: 8px; align-items: center; justify-content: flex-end;">
                            <button class="b3-button b3-button--outline" data-action="copy-prompt">
                                复制
                            </button>
                        </div>
                        <div class="item__readme b3-typography">
                            ${promptHtml}
                        </div>
                    </div>
                    `;
            const ele = html2ele(html) as HTMLElement;
            ele.querySelector('button').onclick = () => {
                navigator.clipboard.writeText(Prompt);
                showMessage('Prompt 已复制到剪贴板');
            }
            simpleDialog({
                title: '你可以使用这个 Prompt',
                ele: ele,
                width: '960px',
                maxHeight: '75vh',
            });
            // container.style.padding = '16px';
        });

        // Bind events
        element.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.id;
                configs = configs.filter(c => c.id !== id);
                await saveConfig(configs);
                await render();
            });
        });

        element.querySelector('[data-action="add-html"]')?.addEventListener('click', async () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.html';
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;

                const content = await file.text();
                const filename = file.name;

                // Save HTML file
                const filePath = _joinPath(filename);
                const blob = new Blob([content], { type: 'text/html' });
                await putFile(filePath, false, blob);

                // Add to config
                const newConfig: IPageConfig = {
                    id: Date.now().toString(),
                    type: 'html',
                    source: filename,
                    title: filename.replace('.html', '')
                };
                configs.push(newConfig);
                await saveConfig(configs);
                await render();
            };
            input.click();
        });

        element.querySelector('[data-action="add-url"]')?.addEventListener('click', async () => {
            const result = await simpleFormDialog({
                title: 'Add URL',
                fields: [
                    {
                        key: 'url',
                        type: 'text',
                        value: '',
                        label: 'URL'
                    },
                    {
                        key: 'title',
                        type: 'text',
                        value: '',
                        label: 'Title (optional)'
                    }
                ]
            });

            if (!result.ok) return;

            const url = result.values?.url;
            const title = result.values?.title || url;

            const newConfig: IPageConfig = {
                id: Date.now().toString(),
                type: 'url',
                source: url,
                title
            };
            configs.push(newConfig);
            await saveConfig(configs);
            await render();
        });

        element.querySelector('[data-action="add-html-text"]')?.addEventListener('click', async () => {
            const result = await simpleFormDialog({
                title: 'Add HTML',
                fields: [
                    {
                        key: 'title',
                        type: 'text',
                        value: '',
                        label: 'Title'
                    },
                    {
                        key: 'content',
                        type: 'textarea',
                        value: '',
                        label: 'Content',
                        placeholder: 'HTML 内容'
                    },
                    {
                        key: 'filename',
                        type: 'text',
                        value: `page-${Date.now()}.html`,
                        label: '文件名(可选)'
                    }
                ]
            });

            if (!result.ok) return;

            const content = result.values?.content;
            const filenameInput = result.values?.filename;
            const filename = filenameInput && filenameInput.trim() !== '' ? filenameInput.trim() : `page-${Date.now()}.html`;
            const title = result.values?.title || filename;

            // Save HTML file
            const filePath = _joinPath(filename);
            const blob = new Blob([content], { type: 'text/html' });
            await putFile(filePath, false, blob);

            // Add to config
            const newConfig: IPageConfig = {
                id: Date.now().toString(),
                type: 'html',
                source: filename,
                title
            };
            configs.push(newConfig);
            await saveConfig(configs);
            await render();
        });
    };

    container = document.createElement('div');
    render();

    return {
        element: container,
        dispose: () => {
            container.innerHTML = '';
        }
    };
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
