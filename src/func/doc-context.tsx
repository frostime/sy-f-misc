/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-06-10 14:55:35
 * @FilePath     : /src/func/doc-context.tsx
 * @LastEditTime : 2025-01-02 18:00:27
 * @Description  : 
 */
import { createSignal, For, JSXElement, onMount, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { simpleDialog } from "@frostime/siyuan-plugin-kits";

import { type Dialog, openTab, showMessage, confirm } from "siyuan";
import { createDocWithMd, getBlockByID, listDocsByPath, request } from "@/api";
import { getActiveDoc, getNotebook } from '@frostime/siyuan-plugin-kits';
import type FMiscPlugin from '..';


let I18n: any = {
    name: '文档上下文',
    focus: '跳转聚焦到文档',
    parent: '上级文档',
    children: '子文档',
    siblings: '同级文档',
    no: '无'
}

export let name = "DocContext";
export let enabled = false;

export const declareToggleEnabled = {
    title: '📑 文档上下文',
    description: '启用文档上下文功能',
    defaultEnabled: true
};

async function getParentDocument(path: string) {
    let pathArr = path.split("/").filter((item) => item != "");
    pathArr.pop();
    if (pathArr.length == 0) {
        return null;
    } else {
        let id = pathArr[pathArr.length - 1];
        return getBlockByID(id);
    }
}

const listChildDocs = async (doc: any) => {
    let data = await listDocsByPath(doc.box, doc.path);
    // console.log(data);
    return data?.files;
}

const getSibling = async (path: string, box: string) => {
    path = path.replace('.sy', '');
    const parts = path.split('/');

    if (parts.length > 0) {
        parts.pop();
    }

    let parentPath = parts.join('/');
    parentPath = parentPath || '/';

    let siblings = await listChildDocs({ path: parentPath, box });
    return siblings;
}

const createContext = async () => {
    let docId = getActiveDoc();
    if (!docId) {
        return null;
    }
    let doc = await getBlockByID(docId);
    let parent = await getParentDocument(doc.path);
    let childrenPromise = listChildDocs(doc);
    parent = parent ?? {
        box: doc.box,
        path: '/',
        hpath: ''
    } as Block;
    let siblingsPromise = listChildDocs(parent);
    let _ = await Promise.all([childrenPromise, siblingsPromise]);
    let children = _[0];
    let siblings = _[1];

    let hpaths = doc.hpath.slice(1).split('/');
    let paths = doc.path.slice(1).split('/');
    //将 hpaths 和 paths 做 zip 操作
    let docPaths = hpaths.map((title, index) => {
        return {
            title: title,
            id: paths[index],
        }
    });

    return { doc, parent, children, siblings, docPaths };
}


const A = (props: { id: string, hightlight?: boolean, children: any, dialog: Dialog, actions?: any }) => {

    const open = () => {
        openTab({
            app: plugin_?.app,
            doc: {
                id: props.id,
                action: props.actions
            }
        });
        props.dialog.destroy();
        const ele = document.querySelector(`div[data-node-id="${props.id}"]`);
        if (ele) {
            ele.scrollIntoView();
        }
    }

    return (
        <>
            <span class="anchor" data-id={props.id} onClick={open} style={{
                outline: props?.hightlight ? 'solid var(--b3-theme-primary-light)' : 0,
                'font-weight': props?.hightlight ? 'bold' : 'inherit',
            }}>
                {props.children}
            </span>
        </>
    )
}

const OutlineComponent = (props: { docId: string, dialog: Dialog }) => {
    const [outline, setOutline] = createSignal([]);

    // 转换数据结构，保留层级关系
    const iterate = (data) => {
        if (!data) return [];
        return data.map(item => ({
            depth: item.depth,
            name: item.name || item.content,
            id: item.id,
            children: item.count > 0 ? iterate(item.blocks ?? item.children) : []
        }));
    }

    // 递归渲染组件
    const RenderItem = (propsRi: { items: any[] }) => {
        return (
            <ul style={{ "list-style-type": "disc", "margin": "0.5em 0" }}>
                <For each={propsRi.items}>
                    {(item) => (
                        <li>
                            <A id={item.id} dialog={props.dialog}>
                                <span innerHTML={item.name} />
                            </A>
                            <Show when={item.children.length > 0}>
                                <RenderItem items={item.children} />
                            </Show>
                        </li>
                    )}
                </For>
            </ul>
        );
    }

    onMount(async () => {
        let ans = await request('/api/outline/getDocOutline', {
            id: props.docId
        });
        setOutline(iterate(ans));
    });

    return (
        <Show when={outline().length > 0} fallback={<p>{I18n.no}</p>}>
            <div class="outline-container" style={{
                // "padding-left": "1em",
                // "border-left": "2px solid var(--b3-border-color)"
            }}>
                <RenderItem items={outline()} />
            </div>
        </Show>
    );
}


const DocContextComponent = (props: {
    doc: Block, parent: Block, children: Block[], siblings: Block[], docPaths: any[], dialog: Dialog
}) => {
    const { doc, parent, children, siblings, docPaths } = props;

    const focus = () => {
        let dock = document.querySelector(`.dock__items>span[data-type="file"]`) as HTMLElement;
        let ele = document.querySelector('div.file-tree span[data-type="focus"]') as HTMLElement;
        if (!dock && !ele) return;
        if (dock && !dock.classList.contains('dock__item--active')) {
            dock.click();
        }
        if (ele) {
            ele.click();
        }
        props.dialog.destroy();
    }

    const newDoc = (hpath: string) => {
        confirm('确定?', `新建文档: ${hpath}`, async () => {
            let docId = await createDocWithMd(doc.box, hpath, '');
            openTab({
                app: plugin_?.app,
                doc: {
                    id: docId
                }
            });
            props.dialog.destroy();
        });
    }

    const newChild = () => {
        let newPath = `${doc.hpath}/Untitled`;
        console.log(newPath);
        newDoc(newPath);
    }

    const newSibling = () => {
        let newPath = `${parent.hpath}/Untitled`;
        console.log(newPath);
        newDoc(newPath);
    }

    const HR = () => (
        <hr
            style={{
                margin: '5px 0'
            }}
        />
    );

    const DocList = (p: { docs: Block[] }) => (
        <Show when={p.docs.length > 0} fallback={<p>{I18n.no}</p>}>
            <ol>
                <For each={p.docs}>
                    {(item) => {
                        let hightlight = item.id === doc.id;
                        return (
                            <li>
                                <A hightlight={hightlight} id={item.id} dialog={props.dialog}>
                                    {item.name.replace('.sy', '')}
                                </A>
                            </li>
                        );
                    }}
                </For>
            </ol>
        </Show>
    );

    const NewDocBtn = (props: { children: JSXElement, onClick: () => void }) => (
        <div
            style={{
                "text-align": "right", "font-size": "15px",
                display: 'flex', flex: 1,
            }}
        >
            <button
                class="b3-button"
                onclick={props.onClick}
                style={{
                    "margin-left": '10px',
                    'line-height': '17px'
                }}
            >
                {props.children}
            </button>
        </div>
    );

    return (
        <section class="doc-context item__readme b3-typography fn__flex-1" style="margin: 1em;">
            <p>🍞
                [{getNotebook(doc.box).name}]
                {docPaths.map((d) => {
                    return (<> / <A id={d.id.replace('.sy', '')} dialog={props.dialog}>{d.title}</A></>);
                })}
            </p>
            <p class="btn-focus" onClick={focus}>
                🎯 {I18n.focus}
            </p>

            <HR />

            <div style={{ display: 'flex', 'align-items': 'center' }}>
                <h4 style={{ flex: 2 }}>⬆️ {I18n.parent}</h4>
                <div style={{ flex: 1, 'margin-left': '10px' }}>
                    <Show when={parent} fallback={<p>{I18n.no}</p>}>
                        <p><A id={parent.id} dialog={props.dialog}>{parent.content}</A></p>
                    </Show>
                </div>
            </div>

            <HR />

            <div style={{ display: 'flex', 'align-items': 'center' }}>
                <h4 style={{ flex: 2 }}>↔️ {I18n.siblings}</h4>
                <NewDocBtn onClick={newSibling}>📬 新建文档</NewDocBtn>
            </div>
            <DocList docs={siblings} />

            <HR />

            <div style={{ display: 'flex', 'align-items': 'center' }}>
                <h4 style={{ flex: 2 }}>⬇️ {I18n.children}</h4>
                <NewDocBtn onClick={newChild}>📬 新建文档</NewDocBtn>
            </div>
            <DocList docs={children} />

            <div style={{ display: 'flex', 'align-items': 'center' }}>
                <h4>📇 标题大纲</h4>
            </div>
            <OutlineComponent docId={doc.id} dialog={props.dialog} />

        </section>
    );
};


let plugin_: FMiscPlugin;
// const keymapTag = window.siyuan.config.keymap.general.tag;
const Keymap = '⌥S';

const KeymapConfig = window.siyuan.config.keymap;

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin_ = plugin;
    plugin.addCommand({
        langKey: 'fmisc::DocContext',
        langText: `F-misc ${I18n.name}`,
        hotkey: Keymap,
        callback: async () => {
            if (document.querySelector('.doc-context')) return;
            let context = await createContext();
            if (!context) {
                return;
            }

            let element = document.createElement('div');
            element.style.display = 'contents';
            const { dialog } = simpleDialog({
                title: I18n.name,
                ele: element,
                width: "1000px",
            });
            render(() => DocContextComponent({ ...context, dialog }), element);
            let container = dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
            container.style.setProperty('max-width', '80%');
            container.style.setProperty('min-width', '40%');
            container.style.setProperty('max-height', '75%');
        }
    });

    let lastTriggered: Date = new Date();
    /**
     * 控制时间，如果 Action 间隔太短，就关掉中键的文档
     * @returns 
     */
    const speedControl = () => {
        let now = new Date();
        let closeCurrentDoc = () => { };
        if ((now.getTime() - lastTriggered.getTime()) <= 1000) {
            let tab = document.querySelector("div.layout__wnd--active ul.layout-tab-bar>li.item--focus");
            let closeEle = tab.querySelector('span.item__close') as HTMLSpanElement;
            closeCurrentDoc = () => closeEle.click();
        }
        lastTriggered = now;
        return closeCurrentDoc;
    }

    const goToSibling = async (delta: -1 | 1) => {
        let docId = getActiveDoc();
        if (!docId) return
        let doc = await getBlockByID(docId);
        let { path, box } = doc;

        let siblings: { id: string, path: string }[] = await getSibling(path, box);
        let index = siblings.findIndex(sibling => sibling.path === path);
        if ((delta < 0 && index == 0) || (delta > 0 && index == siblings.length - 1)) {
            showMessage(`跳转${delta < 0 ? '最后' : '第'}一篇文档`);
        }

        let postAction = speedControl();

        let newIndex = (index + delta + siblings.length) % siblings.length;
        openTab({
            app: plugin.app,
            doc: {
                id: siblings[newIndex].id
            }
        });
        postAction();
    }

    const goToParent = async () => {
        let docId = getActiveDoc();
        if (!docId) return
        let doc = await getBlockByID(docId);
        let parent = await getParentDocument(doc.path);
        if (!parent) {
            showMessage('无父文档');
            return;
        }

        let postAction = speedControl();
        openTab({
            app: plugin.app,
            doc: {
                id: parent.id
            }
        });
        postAction();
    }

    const goToChild = async () => {
        let docId = getActiveDoc();
        if (!docId) return;

        let doc = await getBlockByID(docId);
        let children = await listChildDocs(doc);
        if (children.length === 0) {
            showMessage('无子文裆');
            return;
        }

        let postAction = speedControl();
        openTab({
            app: plugin.app,
            doc: {
                id: children[0].id
            }
        });
        postAction();
    }

    plugin.addCommand({
        langKey: 'fmisc::last-doc',
        langText: '上一篇文档',
        hotkey: '⌘←',
        callback: async () => goToSibling(-1)
    });
    plugin.addCommand({
        langKey: 'fmisc::next-doc',
        langText: '下一篇文档',
        hotkey: '⌘→',
        callback: async () => goToSibling(1)
    });
    plugin.addCommand({
        langKey: 'fmisc::parent-doc',
        langText: '父文档',
        hotkey: '⌘↑',
        callback: async () => goToParent()
    });
    plugin.addCommand({
        langKey: 'fmisc::child-doc',
        langText: '子文档',
        hotkey: '⌘↓',
        callback: async () => goToChild()
    });
    KeymapConfig.editor.general.collapse.custom = '';
    KeymapConfig.editor.general.expand.custom = '';
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin_ = null;

    plugin.delCommand('fmisc::DocContext')
    plugin.delCommand('fmisc::last-doc')
    plugin.delCommand('fmisc::next-doc')

    KeymapConfig.editor.general.collapse.custom = KeymapConfig.editor.general.collapse.default;
    KeymapConfig.editor.general.expand.custom = KeymapConfig.editor.general.expand.default;
}
