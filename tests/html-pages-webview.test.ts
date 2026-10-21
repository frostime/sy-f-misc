import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getEventListeners } from 'node:events';
import { createWebviewPage, disposeWebviewPages } from '../src/func/html-pages/webview-page';
import { disposeWebviews, openWebviewDialog, openWebviewTab } from '../src/func/html-pages/webview';
import { platform } from './fixtures/html-pages-platform';

// A DOM/guest boundary fixture, not an Electron implementation. These tests verify
// the profile selected by production code, NOT actual Cookie persistence to disk.
class ElementFixture extends EventTarget {
    style: Record<string, string> = {};
    attributes = new Map<string, string>();
    children: ElementFixture[] = [];
    parent?: ElementFixture;
    textContent = '';
    className = '';
    hidden = false;
    disabled = false;
    sourcePartitions: Array<string | undefined> = [];
    zoom = 1;
    reloads = 0;
    back = 0;
    forward = 0;
    constructor(readonly tagName: string) { super(); }
    setAttribute(name: string, value: string) {
        if (name === 'src') this.sourcePartitions.push(this.attributes.get('partition'));
        this.attributes.set(name, value);
    }
    appendChild(child: ElementFixture) {
        child.remove();
        this.children.push(child);
        child.parent = this;
        return child;
    }
    remove() {
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent = undefined;
    }
    closest() { return this.attributes.has('data-type') ? this : null; }
    setZoomFactor(value: number) { this.zoom = value; }
    canGoBack() { return true; }
    canGoForward() { return true; }
    goBack() { this.back++; }
    goForward() { this.forward++; }
    reload() { this.reloads++; }
}

function environment(options: { electron?: boolean; webviewEnabled?: boolean } = {}) {
    const doc = Object.assign(new EventTarget(), {
        createElement(tag: string) {
            const element = new ElementFixture(tag);
            if (tag === 'webview' && options.webviewEnabled !== false) {
                Object.assign(element, { getWebContentsId: () => 1 });
            }
            return element;
        }
    });
    const win = Object.assign(new EventTarget(), {
        require: options.electron === false ? undefined : () => ({ ipcRenderer: {} })
    });
    Object.assign(globalThis, { document: doc, window: win, Element: ElementFixture });
    const container = new ElementFixture('div');
    const mount = (pageId = 'page-123', url = 'https://www.dida365.com', zoom = 1) =>
        createWebviewPage(container as unknown as HTMLElement, { pageId, url, zoom });
    return { doc, win, container, mount };
}

function descendants(root: ElementFixture): ElementFixture[] {
    return root.children.flatMap(child => [child, ...descendants(child)]);
}
function guest(root: ElementFixture) {
    const element = descendants(root).find(element => element.tagName === 'webview');
    assert.ok(element, 'expected a mounted guest');
    return element;
}
function emit(target: EventTarget, name: string, fields = {}) {
    target.dispatchEvent(Object.assign(new Event(name), fields));
}

afterEach(() => {
    disposeWebviews();
    platform.tabs.clear();
    platform.frontend = 'desktop';
    platform.messages.length = 0;
    platform.openedTabIds.length = 0;
    platform.dialogs.length = 0;
});

test('unsupported browser and desktop with webviewTag disabled show a message, never iframe fallback', () => {
    for (const options of [{ electron: false }, { webviewEnabled: false }]) {
        const { container, mount } = environment(options);
        const page = mount();
        assert.match(container.children[0].textContent, /当前运行环境不支持 WebView/);
        assert.equal(descendants(container).some(element => ['iframe', 'webview'].includes(element.tagName)), false);
        page.cleanup();
        assert.equal(container.children.length, 0);
    }
});

test('reopening or editing the entry URL reuses the saved page profile; different entries are isolated', () => {
    const { container, mount } = environment();
    const first = mount();
    const profile = guest(container).attributes.get('partition');
    assert.equal(profile, 'persist:fmisc-webapp-page-123');
    assert.deepEqual(guest(container).sourcePartitions, [profile], 'partition must be set before navigation');
    first.cleanup();
    const reopened = mount('page-123', 'https://login.example.com/changed-entry');
    assert.equal(guest(container).attributes.get('partition'), profile);
    reopened.cleanup();
    mount('page-456');
    assert.notEqual(guest(container).attributes.get('partition'), profile);
});

test('remote guests have explicit security settings and no privileged SDK or preload', () => {
    const { container, mount } = environment();
    mount();
    const view = guest(container);
    assert.equal(view.attributes.get('webpreferences'), 'contextIsolation=yes,sandbox=yes,nodeIntegration=no,nodeIntegrationInSubFrames=no,webSecurity=yes');
    for (const attribute of ['nodeintegration', 'nodeintegrationinsubframes', 'preload', 'disablewebsecurity']) {
        assert.equal(view.attributes.has(attribute), false, attribute);
    }
    assert.equal('pluginSdk' in view, false);
    for (const url of ['javascript:alert(1)', 'file:///secret', '/plugins/local.html', 'not a URL']) {
        const invalid = environment();
        invalid.mount('page-123', url);
        assert.match(invalid.container.children[0].textContent, /HTTP \/ HTTPS/);
        assert.equal(descendants(invalid.container).some(element => element.tagName === 'webview'), false);
    }
});

test('loading failures are visible without treating redirects/subresource errors as page failures', () => {
    const { container, mount } = environment();
    mount();
    const view = guest(container);
    const status = descendants(container).find(element => element.tagName === 'span')!;
    emit(view, 'did-fail-load', { isMainFrame: true, errorCode: -105, errorDescription: 'ERR_NAME_NOT_RESOLVED' });
    assert.match(status.textContent, /ERR_NAME_NOT_RESOLVED/);
    emit(view, 'did-start-loading');
    emit(view, 'did-fail-load', { isMainFrame: false, errorCode: -105 });
    emit(view, 'did-fail-load', { isMainFrame: true, errorCode: -3 });
    assert.equal(status.textContent, '正在加载…');
    emit(view, 'did-finish-load');
    assert.equal(status.textContent, '');
    emit(view, 'render-process-gone');
    assert.match(status.textContent, /网页进程已退出/);
});

test('navigation and zoom use guest APIs without replacing the profile', () => {
    const { container, mount } = environment();
    mount('page-123', 'https://www.dida365.com', 1.25);
    const view = guest(container);
    const buttons = descendants(container).filter(element => element.tagName === 'button');
    assert.equal(buttons[0].disabled, true);
    emit(view, 'dom-ready');
    assert.equal(view.zoom, 1.25);
    assert.equal(buttons[0].disabled, false);
    for (const button of buttons) emit(button, 'click');
    assert.deepEqual([view.back, view.forward, view.reloads], [1, 1, 1]);
    assert.deepEqual(view.sourcePartitions, ['persist:fmisc-webapp-page-123', 'persist:fmisc-webapp-page-123']);
});

test('mobile Tab requests report unsupported without calling the desktop Tab API', () => {
    environment();
    platform.frontend = 'mobile';
    openWebviewTab({ title: 'Dida', page: { pageId: 'same-page', url: 'https://www.dida365.com' } });
    assert.deepEqual(platform.openedTabIds, []);
    assert.equal(platform.tabs.size, 0);
    assert.match(platform.messages[0], /当前运行环境不支持 WebView/);
});

test('split tab instances own independent guests while sharing their saved session partition', () => {
    const { container } = environment();
    openWebviewTab({ title: 'Dida', page: { pageId: 'same-page', url: 'https://www.dida365.com' } });
    const registration = platform.tabs.get('webview-same-page')!;
    const first = { element: container as unknown as HTMLElement };
    const secondContainer = new ElementFixture('div');
    const second = { element: secondContainer as unknown as HTMLElement };
    registration.init.call(first);
    registration.init.call(second);
    assert.equal(guest(container).attributes.get('partition'), guest(secondContainer).attributes.get('partition'));
    registration.beforeDestroy.call(first);
    assert.equal(container.children.length, 0);
    assert.ok(guest(secondContainer), 'closing one tab must not destroy the other');
    registration.beforeDestroy.call(second);
    assert.equal(secondContainer.children.length, 0);
    assert.deepEqual(platform.openedTabIds, ['sy-f-miscwebview-same-page']);
});

test('Dialog uses the same page partition as other surfaces and module unload closes its shell', () => {
    const { container, mount } = environment();
    mount('same-page');
    const dialog = openWebviewDialog({ title: 'Dida', width: '1280px', height: '768px', page: { pageId: 'same-page', url: 'https://www.dida365.com' } });
    const dialogContainer = dialog.container as unknown as ElementFixture;
    assert.equal(guest(dialogContainer).attributes.get('partition'), guest(container).attributes.get('partition'));
    disposeWebviews();
    assert.equal(platform.dialogs[0].closed, true);
    assert.equal(container.children.length, 0);
    assert.equal(descendants(dialogContainer).some(element => element.tagName === 'webview'), false);
});

test('close/unload removes guests and host/guest listeners, with idempotent cleanup', () => {
    const { doc, win, container, mount } = environment();
    const first = mount();
    const view = guest(container);
    const root = container.children[0];
    const cover = root.children[1].children[0];
    const tabHeader = new ElementFixture('li');
    tabHeader.setAttribute('data-type', 'tab-header');
    const drag = new Event('dragstart');
    Object.defineProperty(drag, 'target', { value: tabHeader });
    doc.dispatchEvent(drag);
    assert.equal(cover.hidden, false);
    emit(win, 'blur');
    assert.equal(cover.hidden, true);
    first.cleanup();
    first.cleanup();
    assert.equal(container.children.length, 0);
    assert.equal(getEventListeners(doc, 'dragstart').length, 0);
    assert.equal(getEventListeners(doc, 'pointerup').length, 0);
    assert.equal(getEventListeners(win, 'blur').length, 0);
    assert.equal(getEventListeners(view, 'dom-ready').length, 0);
    mount('page-123');
    mount('page-456');
    disposeWebviewPages();
    assert.equal(container.children.length, 0);
    assert.equal(getEventListeners(doc, 'dragstart').length, 0);
});
