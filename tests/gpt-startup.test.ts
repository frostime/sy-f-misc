import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { declareSettingPanel, load, openChatTab, unload } from '../src/func/gpt/index';
import { nativeMcpState } from '../src/func/gpt/tools/native-mcp';
import {
    container, fetchState, flush, holdInitialize, host, installHost,
    lastExtensionGate, miscConfig, plugin, releaseInitialize, uninstallHost,
} from './fixtures/gpt-startup-host';

beforeEach(() => { installHost(); });
afterEach(async () => {
    await unload(plugin); // no activation, MCP session or pending mount outlives its test
    uninstallHost();
});

test('a retained Tab mounts only after its startup completes, and a Tab closed meanwhile never mounts', async () => {
    const gate = holdInitialize();
    const activation = load(plugin);
    await flush();
    assert.deepEqual(fetchState.calls, ['initialize']);

    const kept = container();
    const closed = container();
    await openChatTab(false);
    await openChatTab(false);
    const [keptTab, closedTab] = host.tabs;
    keptTab.render(kept);
    closedTab.render(closed);
    assert.equal(host.mounts.length, 0, 'no ChatSession before the activation has its tool snapshot');
    closedTab.beforeDestroy(); // its container closes while the same startup is still pending

    gate.resolve();
    await activation;
    await flush();
    assert.equal(host.mounts.length, 1, 'only the still-open Tab mounts');
    assert.equal(host.mounts[0].container, kept);
    keptTab.beforeDestroy();
    assert.equal(host.mounts[0].disposed, true, 'the Tab destroy callback owns the component disposer');

    host.frontend = 'desktop-window';
    const windowTab = { element: container(), data: {} as Record<string, unknown> };
    host.windowTabs[0].init.call(windowTab);
    await flush();
    assert.equal(host.mounts.length, 2);
    assert.equal(host.mounts[1].container, windowTab.element);
    host.windowTabs[0].destroy.call(windowTab);
    assert.equal(host.mounts[1].disposed, true, 'the window destroy callback owns the component disposer');
});

test('disabling and re-enabling while the previous activation settles ignores that activation', async () => {
    const gate = holdInitialize();
    const previous = load(plugin);
    await flush();
    await openChatTab(false);
    const staleContainer = container();
    host.tabs[0].render(staleContainer);

    releaseInitialize();
    // Same tick: the previous activation is aborted and the next one starts, so enabled is true
    // again by the time the previous startup settles.
    await Promise.all([unload(plugin), load(plugin), previous]);
    gate.resolve(); // a late reply of the previous activation must change nothing
    await flush();

    assert.equal(nativeMcpState().status, 'ready', 'the current activation publishes the startup state');
    assert.equal(host.windowTabs.length, 1, 'the previous activation registers no second entrance');
    assert.equal(host.mounts.length, 0, 'the stale container stays unmounted');
    assert.match(staleContainer.textContent, /已取消.*重新打开/, 'a retained container must not remain stuck on startup loading');

    await openChatTab(false);
    host.tabs[host.tabs.length - 1].render(container());
    await flush();
    assert.equal(host.mounts.length, 1, 'the current activation still mounts its own Tab');
});

test('commands register once per plugin instance, not once per GPT activation', async () => {
    await load(plugin);
    await unload(plugin);
    await load(plugin);
    assert.deepEqual(host.commands.filter(command => command.owner === plugin).map(command => command.id), ['open-gpt-chat', 'open-gpt-chat-window']);

    // A newly loaded plugin object still needs its own registrations after host cleanup.
    await unload(plugin);
    const nextPlugin: typeof plugin = Object.create(plugin);
    await load(nextPlugin);
    await unload(nextPlugin);
    await load(nextPlugin);
    assert.deepEqual(host.commands.filter(command => command.owner === nextPlugin).map(command => command.id), ['open-gpt-chat', 'open-gpt-chat-window']);
});

test('manual discovery recovery is single-flight, gates new Tabs, and leaves existing components alone', async () => {
    fetchState.initializeFailures = 1;
    await load(plugin);
    assert.equal(nativeMcpState().status, 'unavailable');
    declareSettingPanel[0].element();
    const retry = host.settingsProps.onRetryNativeMcp;
    assert.ok(retry, 'the settings UI receives the activation-owned action');
    await openChatTab(false);
    host.tabs[0].render(container());
    await flush();
    assert.equal(host.mounts.length, 1);
    const existing = host.mounts[0];
    const commandCount = host.commands.length;

    const gate = holdInitialize();
    const recovery = retry();
    await retry(); // a second click during loading must not create another session
    await flush();
    assert.equal(nativeMcpState().status, 'loading');
    assert.deepEqual(fetchState.calls, ['initialize']);
    await openChatTab(false);
    host.tabs[1].render(container());
    await flush();
    assert.equal(host.mounts.length, 1, 'new Tab waits for manual recovery');
    gate.resolve();
    await recovery;
    await flush();
    assert.equal(nativeMcpState().status, 'ready');
    assert.equal(host.mounts.length, 2);
    assert.equal(existing.disposed, false, 'no automatic replacement of an existing ChatSession');
    assert.match(host.messages[0], /关闭并重新打开/);
    assert.equal(host.commands.length, commandCount, 'discovery retry does not rerun the GPT feature startup');
    assert.equal(fetchState.calls.includes('tools/call'), false);
    const requestCount = fetchState.calls.length;
    await retry();
    assert.equal(fetchState.calls.length, requestCount, 'a healthy connection is not replaced by a stale UI callback');
});

test('failed manual recovery stays unavailable, and disabling GPT cancels the next explicit attempt', async () => {
    fetchState.initializeFailures = 2;
    await load(plugin);
    declareSettingPanel[0].element();
    const retry = host.settingsProps.onRetryNativeMcp!;
    await retry();
    assert.equal(nativeMcpState().status, 'unavailable');
    assert.equal(host.messages.length, 0);
    assert.equal(fetchState.calls.filter(method => method === 'initialize').length, 2);
    const gate = holdInitialize();
    const recovery = retry();
    await openChatTab(false);
    const pending = container();
    host.tabs[0].render(pending);
    await flush();
    await unload(plugin);
    gate.resolve();
    await recovery;
    await flush();
    assert.equal(nativeMcpState().status, 'off');
    assert.equal(host.mounts.length, 0);
    assert.match(pending.textContent, /已取消/);
    assert.equal(host.messages.length, 0);
    const count = fetchState.calls.length;
    await retry();
    assert.equal(fetchState.calls.length, count);
});

test('a superseded extension completion adds no Dock, and the Dock destroy callback owns the disposer', async () => {
    miscConfig.pinChatDock = true;

    await load(plugin);
    await flush();
    const supersededGate = lastExtensionGate();
    await unload(plugin); // its extension load is still in flight
    await load(plugin);
    await flush();
    const currentGate = lastExtensionGate();
    assert.notEqual(supersededGate, currentGate);

    supersededGate.resolve();
    await flush();
    assert.equal(host.docks.length, 0, 'enabled is true again, but that activation is over');

    currentGate.resolve();
    await flush();
    assert.equal(host.docks.length, 1);

    const dockTab = { element: container() };
    host.docks[0].init(dockTab);
    await flush();
    assert.equal(host.mounts.length, 1);
    assert.equal(host.mounts[0].container, dockTab.element);
    host.docks[0].destroy();
    assert.equal(host.mounts[0].disposed, true);
});
