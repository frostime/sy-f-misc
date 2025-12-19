/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-17
 * @FilePath     : /src/func/html-pages/index.ts
 * @LastEditTime : 2025-12-20 00:18:24
 * @Description  : HTML Pages 功能模块 - 管理自定义 HTML 页面和 URL
 */
import FMiscPlugin from "@/index";
import { inputDialog } from "@frostime/siyuan-plugin-kits";
import { getFile, getFileBlob, readDir } from "@frostime/siyuan-plugin-kits/api";
import { html2ele } from "@frostime/siyuan-plugin-kits";
import { IMenu, showMessage } from "siyuan";
import { documentDialog, selectIconDialog, simpleFormDialog } from "@/libs/dialog";
import { putFile } from "@/api";
import { openIframeTab, IIframePageConfig } from "./core";
// import presetHtml from "./preset/siyuan-tree.html?raw";

// ============ 类型与常量 ============

interface IPageConfig {
    id: string;
    type: 'url' | 'html';
    source: string;
    title?: string;
    icon?: string;
}

const DATA_DIR = '/data/snippets/fmisc-custom-pages/';
const CONFIG_FILE = 'config.json';

let plugin: FMiscPlugin;
let zoom: number = 1;

// ============ 工具函数 ============

const joinPath = (...parts: string[]) => {
    const endpoint = parts.map((part, index) => {
        if (index === 0) return part.replace(/\/+$/g, '');
        return part.replace(/^\/+|\/+$/g, '');
    }).join('/');
    return DATA_DIR + endpoint;
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
        icon: config.icon,
        iframeConfig
    });
};

const registerMenus = async () => {
    const configs = await loadConfig();
    if (configs.length === 0) return;

    const menus: IMenu[] = configs.map(config => {
        const hasIcon = config.icon && config.icon.trim() !== '';
        // const isEmoji = hasIcon && !config.icon.startsWith('icon');
        const icon = (hasIcon && config.icon.startsWith('icon')) ? config.icon : (config.type === 'html' ? 'iconFiles' : 'iconLink');

        let label = config.title || config.source;
        // label = `${config.icon} ${label}`;

        // if (isEmoji) {
        //     label = `${config.icon} ${label}`;
        // } else if (!hasIcon) {
        //     // label = `${config.type === 'html' ? '📄' : '🌐'} ${label}`;
        //     label = `${config.type === 'html' ? '📄' : '🌐'} ${label}`;
        // }

        return {
            label,
            icon,
            click: () => openPage(config)
        };
    });

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

        return configs.map(config => {
            const hasIcon = config.icon && config.icon.trim() !== '';
            const isEmoji = hasIcon && !config.icon.startsWith('icon');
            const iconHtml = isEmoji
                ? `<span style="font-size: 20px; width: 24px; text-align: center;">${config.icon}</span>`
                : (hasIcon && config.icon.startsWith('icon'))
                    ? `<svg style="width: 20px; height: 20px; fill: var(--b3-theme-on-surface);"><use xlink:href="#${config.icon}"></use></svg>`
                    : `<span style="font-size: 20px; width: 24px; text-align: center;">${config.type === 'html' ? '📄' : '🌐'}</span>`;

            return `
            <div class="config-item" data-id="${config.id}" style="
                padding: 12px 16px;
                border-bottom: 1px solid var(--b3-border-color);
                display: flex;
                align-items: center;
                gap: 12px;
            ">
                ${iconHtml}
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 500; margin-bottom: 4px;">
                        ${config.title || config.source}
                    </div>
                    <div style="font-size: 12px; color: var(--b3-theme-on-surface-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${config.source}
                    </div>
                </div>
                <button class="b3-button b3-button--outline" data-action="edit-config" data-id="${config.id}" title="修改配置">
                    <svg class="b3-button__icon"><use xlink:href="#iconSettings"></use></svg>
                </button>
                <button class="b3-button b3-button--outline" data-action="edit" data-id="${config.id}" title="编辑文件" ${config.type === 'url' ? 'disabled' : ''}>
                    <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                </button>
                <button class="b3-button b3-button--outline" data-action="delete" data-id="${config.id}" title="删除">
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                </button>
            </div>
        `}).join('');
    };

    const showPromptDialog = async () => {

        documentDialog({
            // markdown: Prompt,
            sourceUrl: '{{docs}}/html-page.md',
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
                { key: 'title', type: 'text', value: '', label: '标题（可选）' },
                { key: 'icon', type: 'text', value: '', label: '图标 (Emoji 或 iconID)' }
            ]
        });

        if (!result.ok) return;

        const url = result.values?.url;
        const title = result.values?.title || url;
        const icon = result.values?.icon;

        const newConfig: IPageConfig = {
            id: Date.now().toString(),
            type: 'url',
            source: url,
            title,
            icon
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
                { key: 'icon', type: 'text', value: '', label: '图标 (Emoji 或 iconID)' },
                { key: 'content', type: 'textarea', value: '', label: '内容', placeholder: 'HTML 内容' },
                { key: 'filename', type: 'text', value: `page-${Date.now()}.html`, label: '文件名（可选）' }
            ]
        });

        if (!result.ok) return;

        const content = result.values?.content;
        const filenameInput = result.values?.filename;
        const filename = filenameInput?.trim() || `page-${Date.now()}.html`;
        const title = result.values?.title || filename;
        const icon = result.values?.icon;

        const filePath = joinPath(filename);
        const blob = new Blob([content], { type: 'text/html' });
        await putFile(filePath, false, blob);

        const newConfig: IPageConfig = {
            id: Date.now().toString(),
            type: 'html',
            source: filename,
            title,
            icon
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

    const handleEditConfig = async (id: string) => {
        const config = configs.find(c => c.id === id);
        if (!config) return;

        const result = await simpleFormDialog({
            title: '修改配置',
            fields: [
                { key: 'title', type: 'text', value: config.title || '', label: '标题' },
                { key: 'icon', type: 'text', value: config.icon || '', label: '图标 (Emoji 或 iconID)' },
                //@ts-ignore
                ...(config.type === 'url' ? [{ key: 'source', type: 'text', value: config.source, label: 'URL' }] : [])
            ]
        });

        if (!result.ok) return;

        config.title = result.values?.title;
        config.icon = result.values?.icon;
        if (config.type === 'url') {
            config.source = result.values?.source;
        }

        await saveConfig(configs);
        await render();
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
                    <button class="b3-button b3-button--outline" data-action="select-icon">
                        <svg class="b3-button__icon"><use xlink:href="#iconLanguage"></use></svg>
                        图标 ID
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
        element.querySelector('[data-action="add-html-text"]')?.addEventListener('click', handleAddHtmlText); element.querySelector('[data-action="select-icon"]')?.addEventListener('click', () => selectIconDialog());
        element.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.id;
                handleDelete(id);
            });
        });

        element.querySelectorAll('[data-action="edit-config"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.id;
                handleEditConfig(id);
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

// ============ 初始化默认配置 ============

/**
 * 初始化默认的 demo 页面和 URL
 */
const initializeDefaults = async () => {
    const configs = await loadConfig();

    // 如果已有配置，不执行初始化
    if (configs.length > 0) return;

    console.log('初始化默认 HTML Pages 配置...');

    // 1. 创建默认的 demo HTML 文件
    // const demoFilename = 'siyuan-tree.html';
    // const demoFilePath = joinPath(demoFilename);
    // const response = await getFileBlob('/data/plugins/sy-f-misc/pages/siyuan-tree.html');
    // //@ts-ignore
    // if (response || response.code !== 404) {
    //     const presetHtml = await response.text();
    //     const demoBlob = new Blob([presetHtml], { type: 'text/html' });
    //     await putFile(demoFilePath, false, demoBlob);
    // }
    const moveDefault = async (fname: string) => {
        const sourcePath = `/data/plugins/sy-f-misc/pages/${fname}`;
        const destPath = joinPath(fname);
        const response = await getFileBlob(sourcePath);
        //@ts-ignore
        if (response && response.code !== 404) {
            const content = await response.text();
            const demoBlob = new Blob([content], { type: 'text/html' });
            await putFile(destPath, false, demoBlob);
        }
    }
    moveDefault('siyuan-tree.html');
    moveDefault('docs-calendar.html');

    // 2. 创建默认配置
    const defaultConfigs: IPageConfig[] = [
        {
            id: 'demo-siyuan-tree',
            type: 'html',
            source: 'siyuan-tree.html',
            title: '思源文件查看器',
            icon: 'iconSiYuan'
        },
        {
            id: 'demo-docs-calendar',
            type: 'html',
            source: 'docs-calendar.html',
            title: '文档日历视图',
            icon: 'iconCalendar'
        },
        {
            id: 'default-url-docs',
            type: 'url',
            source: 'https://github.com/siyuan-note/siyuan',
            title: '思源笔记 GitHub'
        }
    ];

    await saveConfig(defaultConfigs);
    console.log('默认配置初始化完成');
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

    // 初始化默认配置
    await initializeDefaults();

    await readDir(DATA_DIR);

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
    customPanel: () => createConfigPanel(),
    help: () => {
        documentDialog({
            markdown: `
**这个模块是干什么的**

帮助用户方便地将单页面应用集成到思源中，满足用户个性化的需求。

你可以理解为快速实现一个微插件

**如何使用这个模块**

1. 在设置面板中点击右侧的 "Prompt" 按钮，查看辅助 Prompt 内容。
2. 粘贴 Prompt，问 AI 让他帮你生成你想要的 HTML 页面代码。
3. 将生成的代码保存为 .html 文件。
4. 在设置面板中点击 "添加 HTML 文件" 按钮，上传你的 HTML 文件。
5. 上传后，你可以在顶部菜单的 "HTML Pages" 中找到并打开你的自定义页面。

**为什么这个模块有效**

为 HTML 页面注入了方法，可以帮助他保存配置信息、与思源交互。

只提供必要的接口，将复杂的 UI 分离给 HTML 页面代码 —— AI 大模型最擅长写这个。
        `});
    }
};
