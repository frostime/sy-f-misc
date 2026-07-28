/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-17
 * @FilePath     : /src/func/html-pages/index.ts
 * @LastEditTime : 2026-01-04 17:20:32
 * @Description  : HTML Pages 功能模块 - 管理自定义 HTML 页面和 URL
 */
import FMiscPlugin from "@/index";
import { confirmDialog, inputDialog } from "@frostime/siyuan-plugin-kits";
import { html2ele } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";
import { documentDialog, selectIconDialog, simpleFormDialog } from "@/libs/dialog";

import { siyuanVfs } from "@/libs/vfs/vfs-siyuan-adapter";
import { openIframeTab, openIframeDialog, IIframePageConfig } from "./core";

// ============ 类型与常量 ============

interface IPageConfig {
    id: string;
    type: 'url' | 'html';
    source: string;
    title?: string;
    icon?: string;
    // per-page open mode: 'tab' or 'dialog' (optional, fallback to module default)
    openMode?: 'tab' | 'dialog';
}

const DATA_DIR = '/data/snippets/fmisc-custom-pages/';
const CONFIG_FILE = 'config.json';

let plugin: FMiscPlugin;
let zoom: number = 1;

// 打开模式: 'tab' | 'dialog'
let DEFAULT_OPEN_MODE: 'tab' | 'dialog' = 'tab';
// Dialog 默认尺寸
const DEFAULT_DIALOG_WIDTH = '1280px';
const DEFAULT_DIALOG_HEIGHT = '768px';

// ============ 工具函数 ============

const joinPath = (...parts: string[]) => {
    return siyuanVfs.join(DATA_DIR, ...parts);
};

/**
 * 获取 page 的文件夹路径
 * @param pageId - page ID
 * @param subPath - 子路径，如 'index.html', 'config.json', 'asset/file.png'
 */
const getPagePath = (pageId: string, subPath: string = '') => {
    return subPath ? joinPath(pageId, subPath) : joinPath(pageId);
};


// ============ 配置管理 ============

let _configSnapshot: IPageConfig[] | null = [];

const loadConfig = async (): Promise<IPageConfig[]> => {
    const configPath = joinPath(CONFIG_FILE);
    const result = await siyuanVfs.readFile(configPath);
    if (!result.ok) return [];
    _configSnapshot = result.data as IPageConfig[];
    return _configSnapshot;
};

const saveConfig = async (config: IPageConfig[]) => {
    const configPath = joinPath(CONFIG_FILE);
    await siyuanVfs.writeFile(configPath, config);
    _configSnapshot = config;
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
            ? `${DATA_DIR.replace('/data', '')}${config.id}/index.html`
            : config.source,
        iframeStyle: {
            zoom: zoom
        },
        inject: config.type === 'html' ? {
            presetSdk: true,
            siyuanCss: true,
            customSdk: {
                pageId: config.id, // 传递 pageId 给 SDK
                // 覆盖默认的 loadConfig 和 saveConfig
                loadConfig: async () => {
                    const filePath = getPagePath(config.id, 'config.json');
                    const result = await siyuanVfs.readFile(filePath, 'json');
                    return result.ok ? result.data : {};
                },
                saveConfig: async (newConfig: Record<string, any>) => {
                    const filePath = getPagePath(config.id, 'config.json');
                    await siyuanVfs.writeFile(filePath, newConfig);
                },
                // 新增 saveAsset 和 loadAsset API
                saveAsset: async (filename: string, file: File | Blob): Promise<{ ok: boolean; error?: string }> => {
                    try {
                        const assetPath = getPagePath(config.id, `asset/${filename}`);
                        const result = await siyuanVfs.writeFile(assetPath, file);
                        return result;
                    } catch (e) {
                        console.error('保存 asset 失败:', e);
                        return { ok: false, error: 'Save Error' };
                    }
                },
                loadAsset: async (filename: string): Promise<{ ok: boolean; data?: Blob; error?: string }> => {
                    try {
                        const assetPath = getPagePath(config.id, `asset/${filename}`);
                        const result = await siyuanVfs.readFile(assetPath, 'blob');
                        return result;
                    } catch (e) {
                        console.error('加载 asset 失败:', e);
                        return { ok: false, error: 'Load Error' };
                    }
                }
            }
        } : undefined
    };

    // 使用每个页面的 openMode 优先，其次回退到全局默认
    const mode = config.openMode ?? DEFAULT_OPEN_MODE;
    if (mode === 'tab') {
        openIframeTab({
            tabId,
            title,
            icon: config.icon,
            iframeConfig
        });
    } else {
        // Dialog 模式，默认尺寸 1024x768
        openIframeDialog({
            title,
            iframeConfig,
            width: DEFAULT_DIALOG_WIDTH,
            height: DEFAULT_DIALOG_HEIGHT,
            maxWidth: '90%',
            maxHeight: '90%'
        });
    }
};

const registerMenus = async () => {
    await loadConfig();
    // if (configs.length === 0) return;

    const loadMenus = () => {
        return _configSnapshot?.map(config => {
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
    }

    setTimeout(() => {
        plugin.registerMenuTopMenu('HTML Pages', () => {
            return [{
                label: '自定义页面',
                icon: 'iconLanguage',
                submenu: loadMenus() ?? []
            }];
        });
    }, 500);
};

// ============ 文件编辑 ============

const editFile = async (config: IPageConfig) => {
    const filePath = getPagePath(config.id, 'index.html');

    const { ok, data } = await siyuanVfs.readFile(filePath, 'text');
    if (!ok) {
        showMessage('加载文件失败');
        return;
    }
    const text = window.Lute.EscapeHTMLStr(data);

    inputDialog({
        title: `编辑 ${config.title || config.id}`,
        defaultText: text,
        confirm(newText: string) {
            if (newText === text) return;
            const blob = new Blob([newText], { type: 'text/html' });
            siyuanVfs.writeFile(filePath, blob);
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
                    <div style="font-weight: 500; margin-bottom: 4px; display: flex; gap: 8px; align-items: center;">
                        <div style="min-width: 0;">${config.title || config.source}</div>
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface-light); background: var(--b3-theme-surface); padding: 2px 8px; border-radius: 12px;">
                            ${(config.openMode || DEFAULT_OPEN_MODE) === 'tab' ? 'Tab' : 'Dialog'}
                        </div>
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
            const pageId = Date.now().toString();
            const filename = file.name;

            // 创建页面文件夹
            await siyuanVfs.mkdir(getPagePath(pageId));
            await siyuanVfs.mkdir(getPagePath(pageId, 'asset'));

            // 保存 HTML 文件
            const htmlBlob = new Blob([content], { type: 'text/html' });
            await siyuanVfs.writeFile(getPagePath(pageId, 'index.html'), htmlBlob);

            // 保存 manifest.json
            const manifest = {
                id: pageId,
                name: filename.replace('.html', '')
            };
            await siyuanVfs.writeFile(getPagePath(pageId, 'manifest.json'), manifest);

            const newConfig: IPageConfig = {
                id: pageId,
                type: 'html',
                source: filename, // 保留用于显示
                title: filename.replace('.html', ''),
                openMode: DEFAULT_OPEN_MODE
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
        const pageId = Date.now().toString();

        // 对于 URL 类型，不创建页面文件夹或 asset（URL 通常为外部页面，不需要 HSPA 资源）
        const newConfig: IPageConfig = {
            id: pageId,
            type: 'url',
            source: url,
            title,
            icon,
            openMode: DEFAULT_OPEN_MODE
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
                { key: 'content', type: 'textarea', value: '', label: '内容', placeholder: 'HTML 内容' }
            ]
        });

        if (!result.ok) return;

        const content = result.values?.content;
        const title = result.values?.title || `page-${Date.now()}`;
        const icon = result.values?.icon;
        const pageId = Date.now().toString();

        // 创建页面文件夹
        await siyuanVfs.mkdir(getPagePath(pageId));
        await siyuanVfs.mkdir(getPagePath(pageId, 'asset'));

        // 保存 HTML 文件
        const blob = new Blob([content], { type: 'text/html' });
        await siyuanVfs.writeFile(getPagePath(pageId, 'index.html'), blob);

        // 保存 manifest.json
        const manifest = {
            id: pageId,
            name: title
        };
        await siyuanVfs.writeFile(getPagePath(pageId, 'manifest.json'), manifest);

        const newConfig: IPageConfig = {
            id: pageId,
            type: 'html',
            source: `${title}.html`, // 用于显示
            title,
            icon,
            openMode: DEFAULT_OPEN_MODE
        };
        configs.push(newConfig);
        await saveConfig(configs);
        await render();
    };

    const handleDelete = async (id: string) => {
        const config = configs.find(c => c.id === id);
        const displayName = config?.title || id;
        confirmDialog({
            title: '确认删除？',
            content: `是否删除页面 "${displayName}"？此操作将删除所有相关文件，不可撤销。`,
            confirm: async () => {
                // 删除整个页面文件夹（若存在）
                const pagePath = getPagePath(id);
                try {
                    if (await siyuanVfs.exists(pagePath)) {
                        await siyuanVfs.unlink(pagePath);
                    }
                } catch (e) {
                    // 如果目录不存在或删除失败，忽略错误并继续移除配置
                    console.warn('删除页面文件夹失败或不存在:', e);
                }

                // 从配置中移除
                configs = configs.filter(c => c.id !== id);
                await saveConfig(configs);
                await render();
                showMessage('页面已删除');
            }
        })
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
                { key: 'openMode', type: 'select', value: config.openMode || DEFAULT_OPEN_MODE, label: '打开方式', options: { tab: '标签页 (Tab)', dialog: '弹窗 (Dialog)' } },
                //@ts-ignore
                ...(config.type === 'url' ? [{ key: 'source', type: 'text', value: config.source, label: 'URL' }] : [])
            ]
        });

        if (!result.ok) return;

        config.title = result.values?.title;
        config.icon = result.values?.icon;
        config.openMode = result.values?.openMode;
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

    /**
     * 创建一个 preset 页面（使用新的文件夹结构）
     */
    const createPresetPage = async (pageId: string, presetHtmlFile: string, title: string, icon: string) => {
        // 创建页面文件夹
        await siyuanVfs.mkdir(getPagePath(pageId));
        await siyuanVfs.mkdir(getPagePath(pageId, 'asset'));

        // 复制 HTML 文件
        const sourcePath = `/data/plugins/sy-f-misc/pages/${presetHtmlFile}`;
        const destPath = getPagePath(pageId, 'index.html');
        await siyuanVfs.copyFile(sourcePath, destPath);

        // 创建 manifest.json
        const manifest = { id: pageId, name: title };
        await siyuanVfs.writeFile(getPagePath(pageId, 'manifest.json'), manifest);

        return {
            id: pageId,
            type: 'html' as const,
            source: presetHtmlFile, // 保留用于显示
            title,
            icon,
            openMode: DEFAULT_OPEN_MODE
        };
    };

    // 创建默认页面
    const defaultConfigs: IPageConfig[] = [
        await createPresetPage('demo-basic', 'demo-page.html', 'HTML Page Demo', 'iconSiYuan'),
        await createPresetPage('demo-siyuan-tree', 'siyuan-tree.html', '思源文件查看器', 'iconSiYuan'),
    ];

    // 添加 URL 类型示例（也需要创建文件夹）
    const urlPageId = 'default-url-docs';
    // URL 类型为外部链接，不创建页面文件夹
    defaultConfigs.push({
        id: urlPageId,
        type: 'url',
        source: 'https://github.com/siyuan-note/siyuan',
        title: '思源笔记 GitHub',
        openMode: DEFAULT_OPEN_MODE
    });

    await saveConfig(defaultConfigs);
    console.log('默认配置初始化完成');
};

// ============ 模块导出 ============

export const name = 'HTMLPages';
export const enabled = false;

export const load = async (plugin_: FMiscPlugin, signal?: AbortSignal) => {
    plugin = plugin_;

    // try {
    //     const blob = new Blob([]);
    //     await putFile(DATA_DIR, true, blob);
    // } catch (e) {
    //     console.warn('数据目录可能已存在:', e);
    // }
    await siyuanVfs.mkdir(DATA_DIR);
    if (signal?.aborted) return;

    // 初始化默认配置
    await initializeDefaults();
    if (signal?.aborted) return;

    // await readDir(DATA_DIR);

    registerMenus();
};

export const unload = () => { };

export const declareToggleEnabled = {
    title: '📝 HTML Pages',
    description: '自定义单页面 HTML 应用，页面可使用 window.pluginSdk 实现与思源交互',
    defaultEnabled: false
};

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: name,
    title: '自定义单页面 HTML 应用',
    load: (data: { openMode?: 'tab' | 'dialog' }) => {
        if (data?.openMode) DEFAULT_OPEN_MODE = data.openMode;
    },
    items: [
        {
            key: 'openMode',
            title: '打开方式',
            description: '在点击菜单打开页面时，使用标签页 (Tab) 还是弹窗 (Dialog)',
            type: 'select',
            options: {
                tab: '标签页 (Tab)',
                dialog: '弹窗 (Dialog)'
            },
            get: () => DEFAULT_OPEN_MODE,
            set: (value: 'tab' | 'dialog') => { DEFAULT_OPEN_MODE = value; }
        }
    ],
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
