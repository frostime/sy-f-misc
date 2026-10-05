// Regression against the production iframe page, real TreeModel and parent-realm SDK callbacks.
// Requires Node 22+ and a local Chromium/Edge; no browser installation or user profile is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawn } from 'node:child_process';

assert.equal(typeof WebSocket, 'function', 'Browser regression requires Node 22+ (native WebSocket)');
const browserPath = process.argv[2] || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(existsSync);
assert.ok(browserPath, 'Pass an installed Chromium/Edge executable as the first argument');
const require = createRequire(import.meta.url);
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
const root = process.cwd();
await fs.mkdir(path.resolve('tmp'), { recursive: true });
const runDirectory = await fs.mkdtemp(path.resolve('tmp/gpt-tree-menu-'));
const fixture = `
import { createRoot } from 'solid-js';
import { useTreeModel } from './src/func/gpt/chat/ChatSession/use-tree-model';
let counter = 0;
window.Lute = { NewNodeID: () => 'test-' + (++counter) };
const tree = createRoot(() => useTreeModel());
const structure = {
 R: {parent:null,children:['A','D']}, A: {parent:'R',children:['B','C']},
 B: {parent:'A',children:[]}, C: {parent:'A',children:[]}, D: {parent:'R',children:[]},
 X: {parent:'missing-historical-parent',children:[]}
};
const nodes = Object.fromEntries(Object.entries(structure).map(([id, links]) => [id, {
 id, ...links, type:'message', role:'assistant', currentVersionId:'v1',
 versions:{v1:{id:'v1',message:{role:'assistant',content:'示例消息 '+id},author:'fixture'}}
}]));
tree.fromHistory({schema:2,type:'history',id:'source',title:'fixture',timestamp:1,
 rootId:'R',worldLine:['R','A','B'],nodes,bookmarks:{}});
window.fixture = {
 forcePlanError:false, mutations:0,
 snapshot:() => JSON.stringify(tree.toHistory({id:'source',title:'fixture',timestamp:1})),
 makeRelatedError:() => tree.updateNode('D', {children:['B']}),
 makeHiddenDependent:() => {tree.updateNode('D',{children:[]});tree.updateNode('X',{parent:'A'});},
 loadLargeTree:() => {
  const largeNodes=Object.fromEntries(Array.from({length:2000},(_,i)=>['L'+i,{
   ...nodes.C,id:'L'+i,parent:i?'L'+Math.floor((i-1)/2):null,
   children:[2*i+1,2*i+2].filter(child=>child<2000).map(child=>'L'+child),
   versions:structuredClone(nodes.C.versions)
  }]));
  largeNodes.X=structuredClone(nodes.X);
  tree.fromHistory({schema:2,type:'history',id:'source',title:'large fixture',timestamp:1,
   rootId:'L0',worldLine:['L0'],nodes:largeNodes,bookmarks:{}});
 }
};
window.pluginSdk = {
 themeMode:'light',
 getTreeData:async()=>({rootId:tree.getRootId(),worldLine:[...tree.getWorldLine()],
  nodes:Object.fromEntries(Object.entries(tree.getNodes()).map(([id,node])=>[id,{
   id,type:node.type,role:node.role,parent:node.parent,children:[...node.children],
   preview:node.versions[node.currentVersionId].message.content,versionCount:1,author:'fixture'
  }]))}),
 getSelectionPlan:ids=>{
  if(window.fixture.forcePlanError)throw new Error('模拟关联路径异常');
  return tree.getSelectionPlan(ids);
 },
 getFullContent:async id=>tree.getNodeById(id).versions.v1.message.content,
 showMessage:()=>{},
 executeSelection:()=>{window.fixture.mutations++;throw new Error('This menu regression must not mutate data');}
};
`;
const compiled = await build({
    stdin: { contents: fixture, loader: 'ts', resolveDir: root, sourcefile: 'tree-menu-fixture.ts' },
    bundle: true, write: false, platform: 'browser', format: 'iife', conditions: ['browser'],
    alias: { 'solid-js': require.resolve('solid-js/dist/solid.js') }, logLevel: 'warning',
});
const productionHtml = await fs.readFile('src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html', 'utf8');
for (const script of productionHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script[1]);
const wrapper = `<!doctype html><html><body style="margin:0">
<script src="/fixture.js"></script>
<iframe id="tree" src="/tree.html" style="border:0;width:100vw;height:100vh"
 onload="this.contentWindow.pluginSdk=window.pluginSdk;this.contentWindow.dispatchEvent(new this.contentWindow.Event('pluginSdkReady'))"></iframe>
</body></html>`;
const assets = new Map([
    ['/', ['text/html', wrapper]], ['/tree.html', ['text/html', productionHtml]],
    ['/fixture.js', ['text/javascript', compiled.outputFiles[0].text]],
    ['/plugins/sy-f-misc/scripts/alpine.min.js', ['text/javascript', await fs.readFile('public/scripts/alpine.min.js')]],
    ['/plugins/sy-f-misc/styles/hspa-mini.css', ['text/css', await fs.readFile('public/styles/hspa-mini.css')]],
]);
const server = createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const asset = assets.get(request.url);
    response.writeHead(asset ? 200 : 404, { 'Content-Type': asset?.[0] || 'text/plain' });
    response.end(asset?.[1] || 'Not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = spawn(browserPath, [
    '--headless', '--disable-gpu', '--disable-background-networking', '--disable-extensions',
    '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${path.join(runDirectory, 'profile')}`, '--window-size=1280,900', url,
], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '';
browser.stderr.on('data', chunk => { browserLog += chunk; });
browser.on('error', error => { browserLog += error.message; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let next = 0;
    const pending = new Map();
    const exceptions = [];
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id); clearTimeout(request.timer);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
    });
    return { socket, exceptions, send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++next;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
            pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
        });
    } };
}
let browserClient, page;
try {
    let endpoint;
    for (let attempt = 0; attempt < 100; attempt++) {
        endpoint = browserLog.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
        if (endpoint) break;
        if (browser.exitCode !== null) throw new Error('Isolated browser exited before initialization');
        await sleep(100);
    }
    assert.ok(endpoint, 'Isolated browser debugger not ready');
    browserClient = await connect(endpoint);
    const targets = await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json();
    const target = targets.find(target => target.type === 'page' && target.url === url);
    assert.ok(target, 'Expected test wrapper not found');
    page = await connect(target.webSocketDebuggerUrl);
    await page.send('Runtime.enable');
    const evaluate = async expression => {
        const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    };
    const frame = 'document.querySelector("#tree").contentWindow';
    const documentOfFrame = `${frame}.document`;
    const waitFor = async expression => {
        for (let attempt = 0; attempt < 60; attempt++) {
            if (await evaluate(expression)) return;
            await sleep(50);
        }
        throw new Error('Browser condition not met: ' + expression);
    };
    // Alpine's @click is an HTML attribute, but @ needs escaping in a CSS selector.
    const query = selector => `${documentOfFrame}.querySelector(${JSON.stringify(selector.replaceAll('[@click', '[\\@click'))})`;
    const click = async selector => { await evaluate(`${query(selector)}.click()`); await sleep(80); };
    const app = `${frame}.Alpine.$data(${query('[x-data]')})`;
    const menuVisible = `!!${query('.node-action-menu')} && getComputedStyle(${query('.node-action-menu')}).display!=='none'`;
    await waitFor(`document.querySelector('#tree')?.contentWindow.Alpine && !!${query('[data-id="B"]')}`);
    const original = await evaluate('fixture.snapshot()');
    await click('[\u0040click="toggleSelectionMode()"]');
    await click('[data-id="B"] .node-circle');
    assert.equal(await evaluate(`${query('.selection-count')}.textContent`), '1 个节点');
    assert.equal(await evaluate(`${query('[\u0040click="copySelection()"]')}.disabled`), false,
        'an unrelated historical missing parent must not block a healthy selection');
    await click('[data-menu-id="B"]');
    await waitFor(menuVisible);
    assert.equal(await evaluate(`${app}.menuError`), '');
    assert.equal(await evaluate(`${query('.node-action-menu')}.textContent.includes('加入此节点及全部后代')`), true);
    await evaluate(`${frame}.dispatchEvent(new (${frame}.KeyboardEvent)('keydown',{key:'Escape',bubbles:true}))`);
    await waitFor(`!(${menuVisible})`);

    // Real right-button input into the iframe, not a direct call to openNodeMenu().
    const point = await evaluate(`(()=>{const r=${query('[data-id="B"] .node-circle')}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'right', clickCount: 1 });
    }
    await waitFor(menuVisible);
    await click('[\u0040click="inspectMenuNode()"]');
    await waitFor(`${app}.fullContentVisible && ${app}.fullContentText==='示例消息 B'`);
    await evaluate(`${frame}.dispatchEvent(new (${frame}.KeyboardEvent)('keydown',{key:'Escape',bubbles:true}))`);
    await waitFor(`!${app}.fullContentVisible`);

    // Menu still opens when the selected/target area itself cannot be analyzed.
    await evaluate('fixture.forcePlanError=true');
    await click('[data-menu-id="B"]');
    await waitFor(menuVisible);
    assert.equal(await evaluate(`${app}.menuError`), '模拟关联路径异常');
    assert.equal(await evaluate(`${query('[\u0040click="applyNodeCommand(\'connect\')"]')}.disabled`), true);
    await click('[\u0040click="applyNodeCommand(\'toggle\')"]');
    assert.equal(await evaluate(`${query('.selection-count')}.textContent`), '0 个节点');
    await evaluate('fixture.forcePlanError=false');
    await click('[data-menu-id="A"]');
    await click('[\u0040click="applyNodeCommand(\'add\')"]');
    assert.deepEqual(await evaluate(`${app}.selectionNodeIds.slice().sort()`), ['A', 'B', 'C']);
    await click('[data-menu-id="B"]');
    await click('[\u0040click="applyNodeCommand(\'exclude\')"]');
    assert.deepEqual(await evaluate(`${app}.selectionNodeIds.slice().sort()`), ['A', 'C']);
    assert.equal(await evaluate('fixture.snapshot()'), original, 'menu/range commands must not repair or mutate source data');

    await click('[\u0040click="setSelection([])"]');
    await evaluate('fixture.makeRelatedError()');
    await click('[data-id="B"] .node-circle');
    assert.equal(await evaluate(`${query('[\u0040click="copySelection()"]')}.disabled`), false, 'uncertain external links must not block readonly copying');
    assert.deepEqual(await evaluate(`[...${app}.selectionPlan.retainedIds]`), ['B']);
    assert.equal(await evaluate(`${query('[data-id="B"]')}.classList.contains('has-issue')`), true);
    assert.equal(await evaluate(`${query('.selection-issue')}.textContent.includes('助手：示例消息 B')`), true);
    await click('[data-menu-id="B"]');
    await waitFor(menuVisible);
    assert.equal(await evaluate(`${app}.menuError`), '');
    assert.equal(await evaluate('fixture.mutations'), 0);

    await click('[\u0040click="setSelection([])"]');
    await evaluate('fixture.makeHiddenDependent()');
    const hiddenSource = await evaluate('fixture.snapshot()');
    await click('[data-menu-id="A"]');
    await click('[\u0040click="applyNodeCommand(\'add\')"]');
    assert.equal(await evaluate(`${query('[\u0040click="copySelection()"]')}.disabled`), false);
    assert.deepEqual(await evaluate(`[...${app}.selectionPlan.removableIds]`), ['A', 'B', 'C']);
    assert.deepEqual(await evaluate(`[...${app}.selectionPlan.retainedIds]`), []);
    assert.equal(await evaluate(`${query('[data-id="A"]')}.classList.contains('has-issue')`), false);
    assert.deepEqual(await evaluate(`[...${app}.selectionPlan.issues]`), []);
    await click('[\u0040click="previewRemoval(\'delete\')"]');
    await waitFor(`${app}.pendingOperation?.plan.removableIds.length===3`);
    assert.equal(await evaluate(`${documentOfFrame}.querySelectorAll('.impact-diagram .impact-node.keep').length`), 0);
    assert.equal(await evaluate(`${documentOfFrame}.querySelectorAll('.impact-diagram .impact-node.remove').length`), 3);
    await click('[\u0040click="cancelPreview()"]');
    assert.deepEqual(await evaluate(`${app}.selectionNodeIds.slice().sort()`), ['A', 'B', 'C']);
    assert.equal(await evaluate('fixture.snapshot()'), hiddenSource, 'preview must not clean graph-external records');
    await page.send('Page.enable');
    const diagnosticScreenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(runDirectory, 'hidden-reference-diagnostics.png'), Buffer.from(diagnosticScreenshot.data, 'base64'));

    await evaluate(`(async()=>{fixture.loadLargeTree();${frame}.renderTree(await pluginSdk.getTreeData())})()`);
    await waitFor(`${documentOfFrame}.querySelectorAll('.tree-node').length===2000`);
    await sleep(100); // Initial fit runs on requestAnimationFrame before testing user scroll/focus.
    await evaluate(`${query('[data-id="L1000"] .node-circle')}.scrollIntoView({block:'center',inline:'center'})`);
    const duration = await evaluate(`(()=>{const node=${query('[data-id="L1000"] .node-circle')};node.focus();const start=performance.now();node.click();return performance.now()-start})()`);
    await waitFor(`${app}.selectionPlan?.canExtract`);
    assert.equal(await evaluate(`${documentOfFrame}.activeElement.closest('.tree-node').dataset.id`), 'L1000', 'fast selection must preserve keyboard focus');
    await click('[data-menu-id="L1000"]');
    await waitFor(menuVisible);
    assert.equal(await evaluate(`${app}.menuError`), '');
    const bulkDuration = await evaluate(`(()=>{const start=performance.now();${query('[\u0040click="selectAllNodes()"]')}.click();return performance.now()-start})()`);
    await waitFor(`${app}.selectionPlan?.nodeIds.length===2000`);
    assert.equal(await evaluate(`${app}.selectionPlan.canExtract`), true);
    assert.deepEqual(await evaluate(`[...${app}.selectionPlan.retainedIds]`), ['L0'], 'unselected stored record requires preserving actual root');
    assert.equal(await evaluate(`${app}.selectionPlan.removableIds.length`), 1999);
    console.log('2000 visible nodes + unrelated broken record: single-click ' + duration.toFixed(1) + ' ms; whole-select ' + bulkDuration.toFixed(1) + ' ms; menu/focus/root protection verified.');
    assert.deepEqual(page.exceptions, [], 'production page must not raise uncaught Alpine/browser errors');
    await page.send('Page.enable');
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(runDirectory, 'menu.png'), Buffer.from(screenshot.data, 'base64'));
    console.log('PASS: production iframe ⋯/native right-click, failed-analysis menu, range commands, readonly inspect, scoped protection; no uncaught errors.');
    console.log('Synthetic-data screenshot: ' + path.join(runDirectory, 'menu.png'));
} finally {
    await browserClient?.send('Browser.close').catch(() => {});
    page?.socket.close(); browserClient?.socket.close();
    if (browser.exitCode === null) browser.kill();
    await new Promise(resolve => server.close(resolve));
}
