export interface IWebviewPageConfig {
    pageId: string;
    url: string;
    zoom?: number;
}

// Only the guest APIs used here; Electron remains a runtime capability, not a dependency.
interface WebviewElement extends HTMLElement {
    getWebContentsId(): number;
    setZoomFactor(factor: number): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
}

const activePages = new Set<() => void>();

/** Dispose guest processes/listeners without deleting persistent browser storage. */
export const disposeWebviewPages = () => {
    for (const cleanup of [...activePages]) cleanup();
};

/** WebView owns browsing/session behavior; it never injects the HSPA SDK. */
export const createWebviewPage = (container: HTMLElement, config: IWebviewPageConfig) => {
    const root = document.createElement('div');
    Object.assign(root.style, {
        display: 'flex', position: 'relative', width: '100%', height: '100%', minHeight: '0'
    });
    container.appendChild(root);

    const removeListeners: Array<() => void> = [];
    let disposed = false;
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        removeListeners.forEach(remove => remove());
        root.remove(); // Removing the guest releases its contents, not its persisted partition.
        activePages.delete(cleanup);
    };
    activePages.add(cleanup);

    const listen = (target: EventTarget, type: string, handler: EventListener) => {
        target.addEventListener(type, handler, { capture: true });
        removeListeners.push(() => target.removeEventListener(type, handler, { capture: true }));
    };
    const showUnavailable = (message: string) => {
        root.textContent = message;
        root.style.padding = '16px';
        root.style.boxSizing = 'border-box';
        return { cleanup };
    };

    let url: URL;
    try {
        url = new URL(config.url);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported URL');
    } catch {
        return showUnavailable('WebView 仅支持有效的 HTTP / HTTPS 网页地址。');
    }
    if (!config.pageId?.trim()) {
        return showUnavailable('页面缺少固定 ID，无法创建持久化 WebView。');
    }

    let webview: WebviewElement;
    try {
        webview = document.createElement('webview') as WebviewElement;
        // Electron only installs these guest APIs when the host enables webviewTag.
        if (!window.require?.('electron')?.ipcRenderer || typeof webview.getWebContentsId !== 'function') {
            return showUnavailable('当前运行环境不支持 WebView。请使用支持 WebView 的思源桌面客户端（本地工作空间），或在页面配置中选择 iframe。');
        }
    } catch {
        return showUnavailable('当前运行环境不支持 WebView。请使用支持 WebView 的思源桌面客户端（本地工作空间），或在页面配置中选择 iframe。');
    }

    const styles = document.createElement('style');
    styles.textContent = `
        .fmisc-webview-tools { position: absolute; left: 8px; bottom: 8px; z-index: 2;
            display: flex; flex-direction: column; align-items: flex-start; gap: 6px; max-width: calc(100% - 16px); }
        .fmisc-webview-tools__bar { display: flex; gap: 2px; padding: 3px; border-radius: 18px;
            background: var(--b3-theme-background, white); color: var(--b3-theme-on-background, #333);
            box-shadow: 0 1px 8px #0002; opacity: .3; transition: opacity .15s; }
        .fmisc-webview-tools:hover .fmisc-webview-tools__bar,
        .fmisc-webview-tools:focus-within .fmisc-webview-tools__bar,
        .fmisc-webview-tools[data-expanded="true"] .fmisc-webview-tools__bar { opacity: 1; }
        .fmisc-webview-tools button { display: grid; place-items: center; width: 28px; height: 28px;
            padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit;
            font: 18px/1 sans-serif; cursor: pointer; }
        .fmisc-webview-tools button:hover { background: var(--b3-theme-surface, #eee); }
        .fmisc-webview-tools button:focus-visible { outline: 2px solid var(--b3-theme-primary, #3578e5); }
        .fmisc-webview-tools button:disabled { opacity: .3; cursor: default; }
        .fmisc-webview-tools__actions { display: flex; gap: 2px; }
        .fmisc-webview-tools [hidden] { display: none; }
        .fmisc-webview-tools__error { box-sizing: border-box; max-width: 360px; padding: 8px 12px;
            border-radius: 8px; background: var(--b3-theme-background, white);
            color: var(--b3-theme-on-background, #333); box-shadow: 0 2px 12px #0003;
            font-size: 12px; overflow-wrap: anywhere; }
    `;
    const tools = document.createElement('div');
    tools.className = 'fmisc-webview-tools';
    const bar = document.createElement('div');
    bar.className = 'fmisc-webview-tools__bar';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '⋯';
    toggle.setAttribute('aria-label', '网页工具');
    toggle.setAttribute('data-action', 'toggle-tools');
    const actions = document.createElement('div');
    actions.className = 'fmisc-webview-tools__actions';
    actions.setAttribute('role', 'toolbar');
    actions.setAttribute('aria-label', '网页导航');
    const status = document.createElement('div');
    status.className = 'fmisc-webview-tools__error';
    status.setAttribute('role', 'status');
    status.hidden = true;
    const setStatus = (text: string, isError = false) => {
        status.textContent = isError ? text : '';
        status.hidden = !isError || !text;
        toggle.title = text ? `网页工具：${text}` : '网页工具';
    };
    let collapseTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelCollapse = () => { clearTimeout(collapseTimer); collapseTimer = undefined; };
    const setExpanded = (expanded: boolean) => {
        cancelCollapse();
        actions.hidden = !expanded;
        tools.setAttribute('data-expanded', String(expanded));
        toggle.setAttribute('aria-expanded', String(expanded));
    };
    setExpanded(false);
    removeListeners.push(cancelCollapse);
    listen(toggle, 'click', () => setExpanded(actions.hidden));
    listen(tools, 'pointerenter', cancelCollapse);
    listen(tools, 'pointerleave', () => {
        cancelCollapse();
        collapseTimer = setTimeout(() => setExpanded(false), 500);
    });
    listen(tools, 'focusin', cancelCollapse);
    listen(tools, 'focusout', event => {
        if (!tools.contains((event as FocusEvent).relatedTarget as Node)) setExpanded(false);
    });
    listen(tools, 'keydown', event => {
        if ((event as KeyboardEvent).key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setExpanded(false);
        toggle.focus();
    });

    let ready = false;
    const navigationButtons: HTMLButtonElement[] = [];
    const addButton = (label: string, icon: string, action: () => void, needsReady = true) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = icon;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.disabled = needsReady;
        if (needsReady) navigationButtons.push(button);
        listen(button, 'click', () => {
            try { action(); }
            catch { setStatus('操作失败，请重试或重新打开页面。', true); }
        });
        actions.appendChild(button);
    };
    addButton('后退', '←', () => { if (webview.canGoBack()) webview.goBack(); });
    addButton('前进', '→', () => { if (webview.canGoForward()) webview.goForward(); });
    addButton('刷新', '↻', () => {
        if (ready) webview.reload();
        else webview.setAttribute('src', url.href);
    }, false);
    addButton('首页', '⌂', () => webview.setAttribute('src', url.href), false);
    bar.appendChild(toggle);
    bar.appendChild(actions);
    tools.appendChild(status);
    tools.appendChild(bar);

    const viewport = document.createElement('div');
    Object.assign(viewport.style, { position: 'relative', flex: '1', minHeight: '0', display: 'flex' });
    Object.assign(webview.style, { width: '100%', height: '100%', flex: '1', border: 'none' });
    const cover = document.createElement('div');
    Object.assign(cover.style, { position: 'absolute', inset: '0', zIndex: '3' });
    cover.hidden = true;

    // Guest input does not bubble into SiYuan. Cover it while the host drags/resizes.
    const beginHostDrag: EventListener = event => {
        const target = event.target;
        if (target instanceof Element && target.closest('[data-type="tab-header"], .layout__resize')) {
            cover.hidden = false;
        }
    };
    const endHostDrag = () => { cover.hidden = true; };
    listen(document, 'dragstart', beginHostDrag);
    listen(document, 'pointerdown', beginHostDrag);
    listen(document, 'mousedown', beginHostDrag);
    for (const type of ['dragend', 'drop', 'pointerup', 'pointercancel', 'mouseup']) {
        listen(document, type, endHostDrag);
    }
    listen(window, 'blur', () => { endHostDrag(); setExpanded(false); });

    listen(webview, 'dom-ready', () => {
        ready = true;
        navigationButtons.forEach(button => { button.disabled = false; });
        webview.setZoomFactor(config.zoom ?? 1);
    });
    listen(webview, 'did-start-loading', () => setStatus('正在加载…'));
    listen(webview, 'did-finish-load', () => setStatus(''));
    listen(webview, 'did-fail-load', event => {
        const failure = event as Event & { isMainFrame?: boolean; errorCode?: number; errorDescription?: string };
        // Redirect/cancelled requests and failed subresources are not whole-page failures.
        if (failure.isMainFrame === false || failure.errorCode === -3) return;
        setStatus(`网页加载失败：${failure.errorDescription || '未知错误'}。可尝试刷新。`, true);
    });
    listen(webview, 'render-process-gone', () => {
        ready = false;
        navigationButtons.forEach(button => { button.disabled = true; });
        setStatus('网页进程已退出，请重新打开页面。登录存储不会因此被清除。', true);
    });

    // Set BEFORE src/attachment. Never derive this from the URL: login redirects and
    // edited entry URLs must continue to use the same browser profile.
    webview.setAttribute('partition', `persist:fmisc-webapp-${encodeURIComponent(config.pageId)}`);
    webview.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=yes,nodeIntegration=no,nodeIntegrationInSubFrames=no,webSecurity=yes');
    // New windows remain subject to SiYuan's host policy (usually the system browser).
    webview.setAttribute('allowpopups', '');
    webview.setAttribute('src', url.href);
    root.appendChild(styles);
    root.appendChild(viewport);
    root.appendChild(tools);
    viewport.appendChild(cover);
    setStatus('正在加载…');
    try {
        viewport.appendChild(webview);
    } catch {
        cleanup();
        return createUnavailablePage(container);
    }
    return { cleanup };
};

const createUnavailablePage = (container: HTMLElement) => {
    const message = document.createElement('div');
    message.textContent = 'WebView 创建失败：当前客户端可能禁止了 WebView。';
    message.style.padding = '16px';
    container.appendChild(message);
    const cleanup = () => { message.remove(); activePages.delete(cleanup); };
    activePages.add(cleanup);
    return { cleanup };
};
