/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-17
 * @FilePath     : /src/func/html-pages/index.ts
 * @LastEditTime : 2025-12-18 22:38:44
 * @Description  : HTML Pages 功能模块 - 管理自定义 HTML 页面和 URL
 */
import FMiscPlugin from "@/index";
import { getLute, inputDialog, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { getFile, getFileBlob } from "@frostime/siyuan-plugin-kits/api";
import { html2ele } from "@frostime/siyuan-plugin-kits";
import { IMenu, showMessage } from "siyuan";
import { simpleFormDialog } from "@/libs/dialog";
import { putFile } from "@/api";
import { openIframeTab, IIframePageConfig } from "./core";

// ============ 类型与常量 ============

interface IPageConfig {
    id: string;
    type: 'url' | 'html';
    source: string;
    title?: string;
}

const DATA_DIR = '/data/snippets/fmisc-custom-pages/';
const CONFIG_FILE = 'config.json';

let plugin: FMiscPlugin;
let zoom: number = 1;
let Prompt = '';

// ============ 工具函数 ============

const joinPath = (...parts: string[]) => {
    const endpoint = parts.map((part, index) => {
        if (index === 0) return part.replace(/\/+$/g, '');
        return part.replace(/^\/+|\/+$/g, '');
    }).join('/');
    return DATA_DIR + endpoint;
};

const fetchPrompt = async () => {
    if (Prompt) return Prompt;
    const file = await fetch('/plugins/sy-f-misc/prompt/html-page.md');
    const text = await file.text();
    Prompt = text;
    return Prompt;
};

// ============ 配置管理 ============

const loadConfig = async (): Promise<IPageConfig[]> => {
    const configPath = joinPath(CONFIG_FILE);
    try {
        const content = await getFile(configPath);
        //@ts-ignore
        if (!content || content.code === 404) return [];
        if (content) return content as IPageConfig[];
    } catch (e) {
        console.warn('加载配置失败:', e);
    }
    return [];
};

const saveConfig = async (config: IPageConfig[]) => {
    const configPath = joinPath(CONFIG_FILE);
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    try {
        await putFile(configPath, false, blob);
    } catch (e) {
        console.error('保存配置失败:', e);
    }
};

// ============ 页面操作 ============

const openPage = (config: IPageConfig) => {
    const tabId = config.type === 'url'
        ? 'url-' + encodeURIComponent(config.source)
        : 'html-' + config.id;

    const title = config.title || (config.type === 'url' ? config.source : config.id);

    const iframeConfig: IIframePageConfig = {
        type: 'url',
        source: config.type === 'html'
            ? `${DATA_DIR.replace('/data', '')}${config.source}`
            : config.source,
        iframeStyle: {
            zoom: zoom
        },
        inject: config.type === 'html' ? {
            presetSdk: true,
            siyuanCss: true,
            customSdk: {
                // 覆盖默认的 loadConfig 和 saveConfig
                loadConfig: async () => {
                    const filePath = joinPath(`conf/${config.source}.config.json`);
                    try {
                        //@ts-ignore
                        const fileContent: object = await getFile(filePath);
                        //@ts-ignore
                        if (!fileContent || fileContent.code === 404) return [];
                        return fileContent ?? {};
                    } catch (e) {
                        return {};
                    }
                },
                saveConfig: async (newConfig: Record<string, any>) => {
                    const filePath = joinPath(`conf/${config.source}.config.json`);
                    const blob = new Blob([JSON.stringify(newConfig, null, 2)], { type: 'application/json' });
                    try {
                        await putFile(filePath, false, blob);
                    } catch (e) {
                        console.error('保存配置失败:', e);
                    }
                }
            }
        } : undefined
    };

    openIframeTab({
        tabId,
        title,
        plugin,
        iframeConfig
    });
};

const registerMenus = async () => {
    const configs = await loadConfig();
    if (configs.length === 0) return;

    const menus: IMenu[] = configs.map(config => ({
        label: `${config.type === 'html' ? '📄' : '🌐'} ${config.title || config.source}`,
        click: () => openPage(config)
    }));

    setTimeout(() => {
        plugin.registerMenuTopMenu('HTML Pages', [{
            label: '自定义页面',
            icon: 'iconLanguage',
            submenu: menus
        }]);
    }, 500);
};

// ============ 文件编辑 ============

const editFile = async (config: IPageConfig) => {
    const fname = config.source;
    const filePath = joinPath(fname);
    const blob = await getFileBlob(filePath);
    if (!blob) {
        showMessage('加载文件失败');
        return;
    }
    let text = await blob.text();
    text = window.Lute.EscapeHTMLStr(text);
    inputDialog({
        title: `编辑 ${filePath.split('/').pop()}`,
        defaultText: text,
        confirm(newText: string) {
            if (newText === text) return;
            const blob = new Blob([newText], { type: 'text/html' });
            putFile(filePath, false, blob);
            showMessage('文件已更新');
        },
        type: 'textarea',
        width: '1000px',
        height: '720px'
    });
};

// ============ 配置面板 ============

const createConfigPanel = (): ExternalElementWithDispose => {
    let configs: IPageConfig[] = [];
    let container: HTMLElement;

    const renderConfigList = () => {
        if (configs.length === 0) {
            return `
                <div style="padding: 32px; text-align: center; color: var(--b3-theme-on-surface-light);">
                    暂无配置的页面
                </div>
            `;
        }

        return configs.map(config => `
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
                <button class="b3-button b3-button--outline" data-action="edit" data-id="${config.id}" title="编辑">
                    <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                </button>
                <button class="b3-button b3-button--outline" data-action="delete" data-id="${config.id}" title="删除">
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                </button>
            </div>
        `).join('');
    };

    const showPromptDialog = async () => {
        if (!Prompt) await fetchPrompt();

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
        };
        simpleDialog({
            title: '辅助 Prompt',
            ele,
            width: '960px',
            maxHeight: '75vh',
        });
    };

    const handleAddHtmlFile = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.html';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const content = await file.text();
            const filename = file.name;
            const filePath = joinPath(filename);
            const blob = new Blob([content], { type: 'text/html' });
            await putFile(filePath, false, blob);

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
    };

    const handleAddUrl = async () => {
        const result = await simpleFormDialog({
            title: '添加 URL',
            fields: [
                { key: 'url', type: 'text', value: '', label: 'URL' },
                { key: 'title', type: 'text', value: '', label: '标题（可选）' }
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
    };

    const handleAddHtmlText = async () => {
        const result = await simpleFormDialog({
            title: '添加 HTML',
            fields: [
                { key: 'title', type: 'text', value: '', label: '标题' },
                { key: 'content', type: 'textarea', value: '', label: '内容', placeholder: 'HTML 内容' },
                { key: 'filename', type: 'text', value: `page-${Date.now()}.html`, label: '文件名（可选）' }
            ]
        });

        if (!result.ok) return;

        const content = result.values?.content;
        const filenameInput = result.values?.filename;
        const filename = filenameInput?.trim() || `page-${Date.now()}.html`;
        const title = result.values?.title || filename;

        const filePath = joinPath(filename);
        const blob = new Blob([content], { type: 'text/html' });
        await putFile(filePath, false, blob);

        const newConfig: IPageConfig = {
            id: Date.now().toString(),
            type: 'html',
            source: filename,
            title
        };
        configs.push(newConfig);
        await saveConfig(configs);
        await render();
    };

    const handleDelete = async (id: string) => {
        configs = configs.filter(c => c.id !== id);
        await saveConfig(configs);
        await render();
    };

    const handleEdit = async (id: string) => {
        const config = configs.find(c => c.id === id);
        if (!config) return;
        if (config.type === 'url') {
            showMessage('URL 类型的页面暂不支持编辑');
            return;
        }
        editFile(config);
    };

    const render = async () => {
        configs = await loadConfig();

        const html = `
            <div class="html-pages-config" style="padding: 16px;">
                <div style="margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="b3-button b3-button--outline" data-action="add-html">
                        <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
                        添加 HTML 文件
                    </button>
                    <button class="b3-button b3-button--outline" data-action="add-url">
                        <svg class="b3-button__icon"><use xlink:href="#iconLink"></use></svg>
                        添加 URL
                    </button>
                    <button class="b3-button b3-button--outline" data-action="add-html-text">
                        <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                        添加 HTML 内容
                    </button>
                    <span style="flex: 1;"></span>
                    <button class="b3-button b3-button--outline" data-action="show-prompt">
                        <svg class="b3-button__icon"><use xlink:href="#iconSparkles"></use></svg>
                        辅助 Prompt
                    </button>
                </div>
                <div class="config-list" style="border: 1px solid var(--b3-border-color); border-radius: 4px;">
                    ${renderConfigList()}
                </div>
            </div>
        `;

        container.innerHTML = '';
        const element = html2ele(html) as HTMLElement;
        container.appendChild(element);

        // 事件绑定
        element.querySelector('[data-action="show-prompt"]')?.addEventListener('click', showPromptDialog);
        element.querySelector('[data-action="add-html"]')?.addEventListener('click', handleAddHtmlFile);
        element.querySelector('[data-action="add-url"]')?.addEventListener('click', handleAddUrl);
        element.querySelector('[data-action="add-html-text"]')?.addEventListener('click', handleAddHtmlText);

        element.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.id;
                handleDelete(id);
            });
        });

        element.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.id;
                handleEdit(id);
            });
        });
    };

    container = document.createElement('div');
    render();

    return {
        element: container,
        dispose: () => { container.innerHTML = ''; }
    };
};

// ============ 模块导出 ============

export const name = 'HTMLPages';
export const enabled = false;

export const load = async (plugin_: FMiscPlugin) => {
    plugin = plugin_;

    try {
        const blob = new Blob([]);
        await putFile(DATA_DIR, true, blob);
    } catch (e) {
        console.warn('数据目录可能已存在:', e);
    }

    registerMenus();
};

export const unload = () => { };

export const declareToggleEnabled = {
    title: '📝 HTML Pages',
    description: '自定义单页面 HTML 应用，页面可使用 window.pluginSdk 实现与思源交互',
    defaultEnabled: false
};

export const declareModuleConfig = {
    key: name,
    title: '自定义单页面 HTML 应用',
    items: [],
    customPanel: () => createConfigPanel()
};
