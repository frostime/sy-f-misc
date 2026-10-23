import { simpleDialog, thisPlugin } from '@frostime/siyuan-plugin-kits';
import { getFrontend, openTab, showMessage } from 'siyuan';
import { createWebviewPage, disposeWebviewPages, IWebviewPageConfig } from './webview-page';

export { createWebviewPage } from './webview-page';

const closeDialogs = new Set<() => void>();

export const disposeWebviews = () => {
    for (const close of [...closeDialogs]) close();
    disposeWebviewPages();
};

export const openWebviewTab = (options: {
    title: string;
    icon?: string;
    page: IWebviewPageConfig;
}) => {
    // Mobile clients have no custom Tab surface in which to display a placeholder.
    if (getFrontend().includes('mobile')) {
        showMessage('当前运行环境不支持 WebView，请使用思源桌面客户端。', 5000, 'error');
        return;
    }
    const plugin = thisPlugin();
    const type = `webview-${options.page.pageId}`;
    // A tab type can have multiple instances (e.g. in split panes). Each instance
    // must destroy only its own guest, never the last guest rendered by this type.
    const pages = new WeakMap<HTMLElement, ReturnType<typeof createWebviewPage>>();
    plugin.addTab({
        type,
        init() {
            pages.get(this.element)?.cleanup();
            pages.set(this.element, createWebviewPage(this.element, options.page));
        },
        beforeDestroy() {
            pages.get(this.element)?.cleanup();
            pages.delete(this.element);
        }
    });
    return openTab({
        app: plugin.app,
        custom: {
            id: plugin.name + type,
            title: options.title,
            icon: options.icon || 'iconLink'
        }
    });
};

export const openWebviewDialog = (options: {
    title: string;
    page: IWebviewPageConfig;
    width: string;
    height: string;
}) => {
    // Mount after Dialog moves its content into the live DOM: reparenting a guest
    // during initial navigation can reload it and disrupt authentication.
    const container = document.createElement('div');
    Object.assign(container.style, { width: '100%', height: '100%', minHeight: '0' });
    let page: ReturnType<typeof createWebviewPage> | undefined;
    const dialog = simpleDialog({
        title: options.title,
        ele: container,
        width: options.width,
        height: options.height,
        maxWidth: '90vw',
        maxHeight: '90vh',
        callback: () => {
            page?.cleanup();
            closeDialogs.delete(dialog.close);
        }
    });
    closeDialogs.add(dialog.close);
    page = createWebviewPage(container, options.page);
    return dialog;
};
