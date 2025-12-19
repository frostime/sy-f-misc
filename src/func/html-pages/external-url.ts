/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-19
 * @FilePath     : /src/func/html-pages/external-url.ts
 * @LastEditTime : 2025-12-19 20:01:30
 * @Description  : 外部 URL 渲染器 - 支持 Cookie 持久化; 暂时先不使用这个功能，避免增加复杂性
 */

/**
 * 检测是否支持 webview 标签
 */
const isWebviewSupported = (): boolean => {
    try {
        // 检测是否在 Electron 环境
        const hasElectron = typeof window.require === 'function';
        if (!hasElectron) return false;

        // 尝试创建 webview 测试是否可用
        const testWebview = document.createElement('webview');
        return 'partition' in testWebview;
    } catch (e) {
        return false;
    }
};

/**
 * 生成 partition ID（基于 URL 域名）
 */
const generatePartitionId = (url: string): string => {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/\./g, '-');
        return `persist:external-${domain}`;
    } catch (e) {
        // 如果 URL 解析失败，使用哈希
        const hash = btoa(url).substring(0, 16).replace(/[^a-zA-Z0-9]/g, '');
        return `persist:external-${hash}`;
    }
};

/**
 * 转发 webview/iframe 指针事件，使 tab 拖拽正常工作
 */
const forwardPointerEvents = (element: HTMLElement): (() => void) => {
    const forwardTypes: Array<keyof WindowEventMap> = [
        'pointerdown', 'pointermove', 'pointerup',
        'mousedown', 'mousemove', 'mouseup'
    ];

    const handler = (event: MouseEvent | PointerEvent) => {
        const rect = element.getBoundingClientRect();
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
        element.dispatchEvent(forwarded);
    };

    try {
        // 对于 webview，监听内部窗口事件
        if ((element as any).getWebContents) {
            const webContents = (element as any).getWebContents();
            forwardTypes.forEach(type => {
                webContents.on(type, handler);
            });
        } else if ((element as HTMLIFrameElement).contentWindow) {
            // 对于 iframe，降级处理
            const win = (element as HTMLIFrameElement).contentWindow;
            forwardTypes.forEach(type => win?.addEventListener(type, handler, { passive: true }));
        }
    } catch (e) {
        console.warn('转发指针事件失败:', e);
    }

    return () => {
        try {
            if ((element as any).getWebContents) {
                const webContents = (element as any).getWebContents();
                forwardTypes.forEach(type => {
                    webContents.removeListener(type, handler);
                });
            } else if ((element as HTMLIFrameElement).contentWindow) {
                const win = (element as HTMLIFrameElement).contentWindow;
                forwardTypes.forEach(type => win?.removeEventListener(type, handler));
            }
        } catch (e) {
            console.warn('移除事件转发失败:', e);
        }
    };
};

/**
 * 创建 webview 元素（支持 Cookie 持久化）
 */
const createWebview = (
    url: string,
    style?: Record<string, any>,
    onLoad?: (webview: HTMLElement) => void
): HTMLElement => {
    const webview = document.createElement('webview') as any;

    // 基本样式
    webview.style.width = '100%';
    webview.style.height = '100%';
    webview.style.border = 'none';

    // 应用自定义样式
    if (style) {
        Object.entries(style).forEach(([key, value]) => {
            webview.style[key] = String(value);
        });
    }

    // 配置 webview
    webview.src = url;

    // 设置 partition 实现持久化
    // persist: 前缀会让 Electron 将 session 数据保存到磁盘
    webview.partition = generatePartitionId(url);

    // 允许必要的权限
    webview.allowpopups = true;

    // 监听加载完成
    webview.addEventListener('did-finish-load', () => {
        console.log(`Webview 加载完成: ${url}`);
        onLoad?.(webview);
    });

    // 监听加载失败
    webview.addEventListener('did-fail-load', (e: any) => {
        console.error('Webview 加载失败:', e.errorDescription);
    });

    // 可选：监听新窗口请求
    webview.addEventListener('new-window', (e: any) => {
        console.log('新窗口请求:', e.url);
        // 可以在这里处理新窗口打开逻辑
    });

    return webview;
};

/**
 * 创建普通 iframe（降级方案）
 */
const createIframe = (
    url: string,
    style?: Record<string, any>,
    onLoad?: (iframe: HTMLIFrameElement) => void
): HTMLIFrameElement => {
    const iframe = document.createElement('iframe');

    // 基本样式
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    // 应用自定义样式
    if (style) {
        Object.entries(style).forEach(([key, value]) => {
            iframe.style[key as any] = String(value);
        });
    }

    // 设置 sandbox 允许必要的功能
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');

    // 监听加载完成
    iframe.addEventListener('load', () => {
        console.log(`Iframe 加载完成: ${url}`);
        onLoad?.(iframe);
    });

    iframe.src = url;

    return iframe;
};

/**
 * 外部 URL 渲染器配置
 */
export interface IExternalUrlConfig {
    /** URL 地址 */
    url: string;

    /** 样式配置 */
    style?: Record<string, any>;

    /** 加载完成回调 */
    onLoad?: (element: HTMLElement) => void;

    /** 销毁前回调 */
    onDestroy?: () => void;

    /** 是否强制使用 iframe（默认 false，优先使用 webview） */
    forceIframe?: boolean;
}

/**
 * 创建外部 URL 页面
 * 
 * 优先使用 webview（支持 Cookie 持久化），降级到 iframe
 * 
 * @param container - 容器元素
 * @param config - 配置选项
 * @returns 清理函数
 */
export const createExternalUrlPage = (
    container: HTMLElement,
    config: IExternalUrlConfig
): (() => void) => {
    const { url, style, onLoad, onDestroy, forceIframe } = config;

    // 决定使用哪种方式渲染
    const useWebview = !forceIframe && isWebviewSupported();

    console.log(`渲染外部 URL: ${url} (使用 ${useWebview ? 'webview' : 'iframe'})`);

    // 创建对应的元素
    const element = useWebview
        ? createWebview(url, style, onLoad)
        : createIframe(url, style, onLoad as any);

    // 转发指针事件
    const cleanupForwardEvents = forwardPointerEvents(element);

    // 添加到容器
    container.appendChild(element);

    // 返回清理函数
    return () => {
        cleanupForwardEvents();
        onDestroy?.();

        // 清理 webview 特有资源
        if (useWebview && (element as any).getWebContents) {
            try {
                // 可选：清理 webview 的 webContents
                // (element as any).getWebContents().destroy();
            } catch (e) {
                console.warn('清理 webview 资源失败:', e);
            }
        }

        element.remove();
    };
};

/**
 * 导出环境检测函数
 */
export const getExternalUrlCapabilities = () => {
    const webviewSupported = isWebviewSupported();

    return {
        webviewSupported,
        cookiePersistenceSupported: webviewSupported,
        recommendedMethod: webviewSupported ? 'webview' : 'iframe'
    };
};

