/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-18
 * @FilePath     : /src/func/html-pages/core.ts
 * @LastEditTime : 2025-12-31 19:44:08
 * @Description  : 通用 iframe 页面加载器和 SDK 注入器
 */
import { createDailynote, getLute, getMarkdown, getParentDoc, openBlock, searchBacklinks, searchChildDocs, thisPlugin, listDailynote, openCustomTab, simpleDialog, getBlockByID, matchIDFormat, inputDialog } from "@frostime/siyuan-plugin-kits";
import { request } from "@frostime/siyuan-plugin-kits/api";
import { sql } from "@/api";
import { siyuanVfs } from "@/libs/vfs/vfs-siyuan-adapter";
import { showMessage } from "siyuan";

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

    // 如果有，代表启动时自动往里面发送的消息
    onLoadEvents?: Record<string, any>;

    /** iframe 加载完成回调 */
    onLoad?: (iframe: HTMLIFrameElement) => void;
    /** iframe 销毁前回调 */
    onDestroy?: () => void;
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
const buildPresetSdk = () => {
    const styleVar = {
        // 字体相关
        'font-family': getCSSVariable('--b3-font-family'),
        'font-size': getCSSVariable('--b3-font-size-editor'),
        'font-family-code': getCSSVariable('--b3-font-family-code'),
        'font-family-emoji': getCSSVariable('--b3-font-family-emoji'),

        // 主题颜色
        'theme-primary': getCSSVariable('--b3-theme-primary'),
        'theme-primary-light': getCSSVariable('--b3-theme-primary-light'),
        'theme-primary-lightest': getCSSVariable('--b3-theme-primary-lightest'),
        'theme-on-primary': getCSSVariable('--b3-theme-on-primary'),

        'theme-background': getCSSVariable('--b3-theme-background'),
        'theme-on-background': getCSSVariable('--b3-theme-on-background'),

        'theme-surface': getCSSVariable('--b3-theme-surface'),
        'theme-surface-light': getCSSVariable('--b3-theme-surface-light'),
        'theme-surface-lighter': getCSSVariable('--b3-theme-surface-lighter'),
        'theme-on-surface': getCSSVariable('--b3-theme-on-surface'),
        'theme-on-surface-light': getCSSVariable('--b3-theme-on-surface-light'),
    };

    const bodyFont = getComputedStyle(document.body).fontFamily;
    if (bodyFont) {
        styleVar['font-family'] = bodyFont;
    }

    let themeMode = document.body.parentElement.getAttribute('data-theme-mode') as 'light' | 'dark';
    styleVar['theme-mode'] = themeMode;

    return {
        request: async (endpoint: string, data: any) => {
            const response = await request(endpoint, data, 'response');
            return { ok: response.code === 0, data: response.data };
        },

        loadConfig: async () => ({}),
        saveConfig: async () => { },

        /**
         * 保存 Blob/File 到完整路径
         * @param path 文件路径
         * @param data Blob 对象
         */
        saveBlob: async (
            path: string,
            data: Blob,
        ): Promise<{ ok: boolean; error: 'Unsupported Data' | 'Save Error' }> => {
            path = siyuanVfs.resolve(path);
            const filename = path.split('/').pop();
            if (path.startsWith('/data') && filename.endsWith('.sy') && matchIDFormat(filename.slice(0, -3))) {
                return { ok: false, error: 'Save Error' };
            }
            // 强制使用 blob 类型，避免类型推断问题
            // @ts-ignore
            return siyuanVfs.writeFile(path, data);
        },

        /**
         * 从完整路径加载 Blob
         */
        loadBlob: async (path: string): Promise<{ ok: boolean; data: Blob | null }> => {
            const result = await siyuanVfs.readFile(path, 'blob');
            return result;
        },

        querySQL: async (query: string) => await sql(query),
        queryDailyNote: async (options: {
            boxId?: NotebookId;
            before?: Date;
            after?: Date;
            limit?: number;
        }) => listDailynote(options),
        queryChildDocs: async (docId: string) => searchChildDocs(docId),
        queryParentDoc: async (docId: string) => {
            const doc = await getParentDoc(docId);
            return doc ?? null;
        },
        queryBacklinks: async (blockId: string) => searchBacklinks(blockId),

        getBlockByID: async (blockId: string) => {
            return getBlockByID(blockId);
        },
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
        lute: getLute(),

        showMessage: (message: string, type: 'info' | 'error' = 'info', duration = 3000) => {
            showMessage(message, duration, type);
        },
        showDialog: (options: {
            title: string;
            ele: HTMLElement | DocumentFragment;
            width?: string;
            height?: string;
            afterClose?: () => void;
        }): { close: () => void; container: HTMLElement } => {
            const dialog = simpleDialog({
                ...options,
                maxHeight: '85vh',
                maxWidth: '90vw',
                callback: options.afterClose
            });
            return {
                close: dialog.close.bind(dialog),
                container: dialog.container
            }
        },
        inputDialog: (options: {
            title: string;
            defaultText?: string;
            confirm?: (text: string) => void;
            cancel?: (text: string) => void;
            destroyCallback?: (text: string) => void;
            type?: 'textline' | 'textarea';
            width?: string;
            height?: string;
            fontSize?: string;
        }) => {
            const dialog = inputDialog({
                ...options,
                maxHeight: '70vh',
                maxWidth: '80vw',
            });
            return {
                close: dialog.close.bind(dialog),
                container: dialog.container
            }
        },

        themeMode: themeMode,
        styleVar: styleVar,
    };
};

type IPresetSdk = ReturnType<typeof buildPresetSdk>;

/**
 * 注入思源样式到 iframe
 */
const injectSiyuanStyles = (iframe: HTMLIFrameElement, style: Record<string, string>) => {
    const doc = iframe.contentDocument;
    if (!doc?.head) {
        console.error('无法访问 iframe.contentDocument.head，可能是跨域或尚未加载');
        return false;
    }

    try {
        // 检查是否已注入
        const existing = doc.head.querySelector('#siyuan-injected-styles');
        if (existing) {
            existing.remove();
        }

        const styleSheet = doc.createElement('style');
        styleSheet.id = 'siyuan-injected-styles';

        // 构建 CSS 变量，带值清理和防御性检查
        const cssVariables = Object.entries(style)
            .filter(([_key, value]) => value && String(value).trim() !== '')
            .map(([key, value]) => {
                // 移除可能存在的 -- 前缀，统一处理
                const cleanKey = key.startsWith('--') ? key.slice(2) : key;
                // CSS 变量值不需要转义引号，直接使用原始值
                // 只需要移除可能的换行符和控制字符以保证 CSS 语法正确
                const cleanValue = String(value).replace(/[\r\n\t]/g, ' ');
                return `--${cleanKey}: ${cleanValue};`;
            })
            .join('\n    ');

        styleSheet.textContent = `
            :root {
                ${cssVariables}
            }
            body {
                font-family: var(--b3-font-family, sans-serif);
                font-size: var(--b3-font-size, 16px);
            }
            pre, code {
                font-family: var(--b3-font-family-code, monospace);
            }
        `;

        doc.head.prepend(styleSheet);
        return true;
    } catch (e) {
        console.error('注入思源样式失败:', e);
        return false;
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
    title: string;
    icon?: string;

    /** Iframe 页面配置 */
    iframeConfig: IIframePageConfig;

    onTabDestroy?: () => void;

    position?: 'right' | 'bottom';

}) => {
    const { tabId, title, iframeConfig, onTabDestroy } = options;

    // 用于存储 iframe API
    let iframeApi: ReturnType<typeof createIframePage> = {
        cleanup: () => { },
        dispatchEvent: (eventName: string, detail?: ScalarType | Record<string, any>) => { },
        iframeRef: new WeakRef(document.createElement('iframe')), // 占位
        isAlive: () => false
    };

    options.iframeConfig.iframeStyle = options.iframeConfig.iframeStyle || {};
    Object.assign(options.iframeConfig.iframeStyle, {
        border: 'none'
    });

    openCustomTab({
        tabId,
        plugin: thisPlugin(),
        title,
        render: (container: Element) => {
            // 创建 iframe 并获取 API
            const iframe = createIframePage(
                container as HTMLElement,
                iframeConfig
            );
            Object.assign(iframeApi, iframe);
        },
        beforeDestroy: () => {
            // 清理 iframe 资源
            iframeApi?.cleanup();
            // 执行额外的清理逻辑
            onTabDestroy?.();
        },
        icon: options.icon,
        position: options.position
    });

    // 返回 Proxy，自动转发到最新的 iframeApi
    return new Proxy({} as ReturnType<typeof createIframePage>, {
        get(_target, prop) {
            return iframeApi[prop as keyof typeof iframeApi];
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
    // callback?: () => void;
}) => {
    const container = document.createElement('div');
    container.style.display = 'contents';

    options.iframeConfig.iframeStyle = options.iframeConfig.iframeStyle || {};
    Object.assign(options.iframeConfig.iframeStyle, {
        width: '100%',
        height: 'unset',
        border: 'none'
    });

    let iframeApi = createIframePage(
        container as HTMLElement,
        options.iframeConfig
    );

    const dialog = simpleDialog({
        title: options.title,
        ele: container,
        width: options.width,
        height: options.height,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        callback: () => {
            iframeApi?.cleanup();
            // options.callback?.();
        }
    });

    // 返回 Proxy，合并 dialog API 和 iframe API
    return new Proxy({ ...dialog } as typeof dialog & ReturnType<typeof createIframePage>, {
        get(target, prop) {
            // 优先从 dialog 获取（close 等方法）
            if (prop in target) {
                return target[prop as keyof typeof target];
            }
            // 否则从 iframeApi 获取（dispatchEvent, isAlive 等）
            return iframeApi[prop as keyof typeof iframeApi];
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
): {
    cleanup: () => void,
    dispatchEvent: (eventName: string, detail?: ScalarType | Record<string, any>) => void,
    iframeRef: WeakRef<HTMLIFrameElement>,
    isAlive: () => boolean
} => {
    const iframe = document.createElement('iframe');
    const iframeRef = new WeakRef(iframe);

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

        if (config.onLoadEvents) {
            console.log('准备发送 onLoadEvents:', config.onLoadEvents);
            Object.entries(config.onLoadEvents).forEach(([eventName, detail]) => {
                console.log(`发送事件: ${eventName}`, detail);
                iframe.contentWindow?.dispatchEvent(new CustomEvent(eventName, { detail }));
            });
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

    // 返回 API 对象
    return {
        cleanup: () => {
            cleanupForwardEvents?.();
            config.onDestroy?.();
        },
        dispatchEvent: (eventName: string, detail?: ScalarType | Record<string, any>) => {
            const iframe = iframeRef.deref();
            if (!iframe) {
                console.warn('无法向 iframe 发送事件：iframe 已被垃圾回收');
                return;
            }
            if (!iframe.isConnected) {
                console.warn('无法向 iframe 发送事件：iframe 已从 DOM 中移除');
                return;
            }

            try {
                const win = iframe.contentWindow;
                if (!win) {
                    console.warn('无法向 iframe 发送事件：contentWindow 不可用');
                    return;
                }
                const event = new CustomEvent(eventName, {
                    detail,
                    bubbles: true,
                    cancelable: true
                });
                win.dispatchEvent(event);
            } catch (e) {
                console.error('向 iframe 发送事件失败:', e);
            }
        },
        iframeRef,
        isAlive: () => {
            const iframe = iframeRef.deref();
            return iframe !== undefined && iframe.isConnected;
        }
    };
};
