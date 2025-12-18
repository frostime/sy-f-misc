/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-18
 * @FilePath     : /src/func/html-pages/core.ts
 * @LastEditTime : 2025-12-18 23:02:07
 * @Description  : 通用 iframe 页面加载器和 SDK 注入器
 */
import { createDailynote, getLute, getMarkdown, getParentDoc, openBlock, searchBacklinks, searchChildDocs, thisPlugin, listDailynote, openCustomTab, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { getFileBlob, request } from "@frostime/siyuan-plugin-kits/api";
import { sql } from "@/api";

// ============ 类型定义 ============

/**
 * iframe 页面配置
 */
export interface IIframePageConfig {
    /** 页面来源类型 
     * - 'url': 加载外部 URL 或本地文件路径
     * - 'html-text': 直接注入 HTML 文本内容
     */
    type: 'url' | 'html-text';

    /** URL 地址或 HTML 文本内容 */
    source: string;

    /** iframe 样式配置 */
    iframeStyle?: {
        zoom?: number;
        [key: string]: any;
    };

    /** SDK 注入配置 */
    inject?: {
        /** 是否注入预设 SDK（默认 true） */
        presetSdk?: boolean;
        /** 是否注入思源样式（默认 true） */
        siyuanCss?: boolean;
        /** 自定义 SDK，可覆盖预设 SDK 的方法 */
        customSdk?: Record<string, any>;
    };

    /** iframe 加载完成回调 */
    onLoad?: (iframe: HTMLIFrameElement) => void;
    /** iframe 销毁前回调 */
    onDestroy?: () => void;
}

/**
 * 预设 SDK 接口
 */
export interface IPresetSdk {
    request: (endpoint: string, data: any) => Promise<{ ok: boolean; data: any }>;
    loadConfig: () => Promise<Record<string, any>>;
    saveConfig: (config: Record<string, any>) => Promise<void>;
    querySQL: (query: string) => Promise<any>;
    queryDailyNote: (options: {
        boxId?: NotebookId;
        before?: Date;
        after?: Date;
        limit?: number;
    }) => Promise<any>;
    queryChildDocs: (docId: string) => Promise<any>;
    queryParentDoc: (docId: string) => Promise<any>;
    queryBacklinks: (blockId: string) => Promise<any>;
    getMarkdown: (blockId: string) => Promise<string>;
    lsNotebooks: () => Array<{ name: string; id: string; closed: boolean }>;
    openBlock: (blockId: string) => void;
    createDailynote: (options: {
        notebookId: string;
        date?: Date;
        content?: string;
    }) => Promise<any>;
    argApp: () => string;
    themeMode: 'light' | 'dark';

    styleVar: Record<string, string>;
    lute: any;
}

// ============ 工具函数 ============

const getCSSVariable = (variableName: string): string => {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
};

/**
 * 构建预设 SDK
 */
const buildPresetSdk = (): IPresetSdk => {
    const styleVar = {
        'font-family': getCSSVariable('--b3-font-family'),
        'font-size': getCSSVariable('--b3-font-size'),
        'font-family-code': getCSSVariable('--b3-font-family-code'),
    };

    return {
        request: async (endpoint: string, data: any) => {
            if (endpoint === '/api/file/getFile') {
                const blob = await getFileBlob(data.path);
                return blob ? { ok: true, data: blob } : { ok: false, data: null };
            }
            const response = await request(endpoint, data, 'response');
            return { ok: response.code === 0, data: response.data };
        },

        loadConfig: async () => ({}),
        saveConfig: async () => { },

        querySQL: async (query: string) => await sql(query),
        queryDailyNote: async (options) => listDailynote(options),
        queryChildDocs: async (docId: string) => searchChildDocs(docId),
        queryParentDoc: async (docId: string) => {
            const doc = await getParentDoc(docId);
            return doc ?? null;
        },
        queryBacklinks: async (blockId: string) => searchBacklinks(blockId),
        getMarkdown: async (blockId: string) => getMarkdown(blockId),

        lsNotebooks: () => {
            return window.siyuan.notebooks
                .filter((notebook) => !notebook.closed)
                .map((notebook) => ({
                    name: notebook.name,
                    id: notebook.id,
                    closed: notebook.closed || false
                }));
        },

        openBlock: (blockId: string) => {
            openBlock(blockId, { app: thisPlugin().app });
        },

        createDailynote: async (options) => {
            return createDailynote(
                options.notebookId,
                options.date ?? new Date(),
                options.content ?? '',
                thisPlugin().app.appId
            );
        },

        argApp: () => thisPlugin().app.appId,
        themeMode: document.body.parentElement.getAttribute('data-theme-mode') as 'light' | 'dark',
        styleVar: styleVar,
        lute: getLute()
    };
};

/**
 * 注入思源样式到 iframe
 */
const injectSiyuanStyles = (iframe: HTMLIFrameElement, style: Record<string, string>) => {
    try {
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            body {
                font-family: ${style['font-family']};
                font-size: ${style['font-size']};
            }
            pre, code {
                font-family: ${style['font-family-code']};
            }
        `;
        iframe.contentDocument?.head.appendChild(styleSheet);
    } catch (e) {
        console.warn('注入思源样式失败:', e);
    }
};

/**
 * 转发 iframe 指针事件，使 tab 拖拽和调整大小正常工作
 */
const forwardIframePointerEvents = (iframe: HTMLIFrameElement): (() => void) => {
    const forwardTypes: Array<keyof WindowEventMap> = [
        'pointerdown', 'pointermove', 'pointerup',
        'mousedown', 'mousemove', 'mouseup'
    ];

    const handler = (event: MouseEvent | PointerEvent) => {
        const rect = iframe.getBoundingClientRect();
        const clientX = event.clientX + rect.left;
        const clientY = event.clientY + rect.top;

        const init: PointerEventInit = {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            screenX: event.screenX,
            screenY: event.screenY,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            button: event.button,
            buttons: (event as PointerEvent).buttons,
            pointerId: (event as PointerEvent).pointerId,
            pointerType: (event as PointerEvent).pointerType,
            pressure: (event as PointerEvent).pressure,
            tiltX: (event as PointerEvent).tiltX,
            tiltY: (event as PointerEvent).tiltY,
            isPrimary: (event as PointerEvent).isPrimary
        };

        const SyntheticEvent = (window.PointerEvent && event instanceof PointerEvent)
            ? PointerEvent
            : MouseEvent;

        const forwarded = new SyntheticEvent(event.type, init);
        iframe.dispatchEvent(forwarded);
    };

    try {
        const win = iframe.contentWindow;
        if (!win) return () => { };
        forwardTypes.forEach(type => win.addEventListener(type, handler, { passive: true }));
    } catch (e) {
        console.warn('转发 iframe 事件失败:', e);
    }

    return () => {
        try {
            const win = iframe.contentWindow;
            if (!win) return;
            forwardTypes.forEach(type => win.removeEventListener(type, handler));
        } catch (e) {
            console.warn('移除 iframe 事件转发失败:', e);
        }
    };
};

// ============ Tab 集成接口 ============


/**
 * 打开一个包含 iframe 的自定义 tab
 * 
 * 这个函数封装了创建 iframe tab 的完整流程：
 * 1. 创建自定义 tab
 * 2. 在 tab 中渲染 iframe
 * 3. 注入 SDK（如果配置）
 * 4. 管理清理逻辑
 * 
 * @param options - Tab 配置选项
 * 
 * @example
 * ```typescript
 * openIframeTab({
 *     tabId: 'my-page-123',
 *     title: 'My Custom Page',
 *     plugin: myPlugin,
 *     iframeConfig: {
 *         type: 'url',
 *         source: 'https://example.com',
 *         inject: { presetSdk: true }
 *     }
 * });
 * ```
 */
export const openIframeTab = (options: {
    /** Tab ID，用于标识唯一的 tab */
    tabId: string;

    /** Tab 标题 */
    title: string;

    /** Iframe 页面配置 */
    iframeConfig: IIframePageConfig;

    /** 插件实例 */
    plugin: any;

    /** Tab 销毁前的额外清理逻辑（可选） */
    onTabDestroy?: () => void;
}): void => {
    const { tabId, title, plugin, iframeConfig, onTabDestroy } = options;

    // 用于存储 iframe 清理函数
    let cleanupIframeFunc: (() => void) | null = null;

    openCustomTab({
        tabId,
        plugin,
        title,
        render: (container: Element) => {
            // 创建 iframe 并获取清理函数
            cleanupIframeFunc = createIframePage(
                container as HTMLElement,
                iframeConfig
            );
        },
        beforeDestroy: () => {
            // 清理 iframe 资源
            cleanupIframeFunc?.();
            // 执行额外的清理逻辑
            onTabDestroy?.();
        }
    });
};

export const openIframDialog = (options: {
    title: string
    iframeConfig: IIframePageConfig,
    width?: string;
    height?: string;
    maxWidth?: string;
    maxHeight?: string;
    callback?: () => void;
}) => {
    const container = document.createElement('div');
    let cleanupIframeFunc: (() => void) | null = createIframePage(
        container as HTMLElement,
        options.iframeConfig
    );

    simpleDialog({
        title: options.title,
        ele: container,
        width: options.width,
        height: options.height,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        callback: () => {
            cleanupIframeFunc?.();
            options.callback?.();
        }
    });
}

// ============ 核心功能 ============

/**
 * 注入 SDK 到 iframe
 */
const injectSdk = (iframe: HTMLIFrameElement, config: IIframePageConfig) => {
    try {
        const inject = config.inject || {};
        const presetSdk: Partial<IPresetSdk> = inject.presetSdk !== false ? buildPresetSdk() : {};

        // customSdk 可以覆盖 presetSdk
        const finalSdk = {
            ...presetSdk,
            ...(inject.customSdk || {})
        };

        // @ts-ignore
        iframe.contentWindow.pluginSdk = finalSdk;

        // 注入思源样式
        if (inject.siyuanCss !== false && presetSdk.styleVar) {
            injectSiyuanStyles(iframe, presetSdk.styleVar);
        }

        // 触发就绪事件
        iframe.contentWindow?.dispatchEvent(new CustomEvent('pluginSdkReady'));

        // 添加日志
        const script = iframe.contentWindow?.document.createElement('script');
        if (script) {
            script.type = 'text/javascript';
            script.text = "console.log('SiYuan SDK injected successfully')";
            iframe.contentWindow?.document.head.appendChild(script);
        }
    } catch (e) {
        console.error('注入 SDK 失败:', e);
    }
};

/**
 * 创建并配置 iframe
 */
export const createIframePage = (
    container: HTMLElement,
    config: IIframePageConfig
): (() => void) => {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';

    // 应用 iframe 样式
    if (config.iframeStyle) {
        Object.entries(config.iframeStyle).forEach(([key, value]) => {
            iframe.style[key as any] = String(value);
        });
    }

    let cleanupForwardEvents: (() => void) | null = null;

    // 加载完成处理
    iframe.addEventListener('load', () => {
        console.log('Iframe 加载完成');

        // 注入 SDK（如果配置了）
        if (config.inject) {
            injectSdk(iframe, config);
        }

        cleanupForwardEvents = forwardIframePointerEvents(iframe);
        config.onLoad?.(iframe);
    });

    // 根据类型设置内容
    if (config.type === 'html-text') {
        // 直接注入 HTML 文本
        iframe.srcdoc = config.source;
    } else {
        // 加载 URL
        iframe.src = config.source;
    }

    container.appendChild(iframe);

    // 返回清理函数
    return () => {
        cleanupForwardEvents?.();
        config.onDestroy?.();
    };
};
