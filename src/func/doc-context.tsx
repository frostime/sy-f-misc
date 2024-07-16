/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-06-10 14:55:35
 * @FilePath     : /src/func/doc-context.tsx
 * @LastEditTime : 2024-07-16 21:24:28
 * @Description  : 
 */
import { For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { type Dialog, openTab, showMessage, IProtyle } from "siyuan";

import { simpleDialog } from "@/libs/dialog";
import { getBlockByID, listDocsByPath } from "@/api";
import { getActiveDoc, getNotebook } from "@/utils";
import type FMiscPlugin from '..';


let I18n: any = {
    name: '文档上下文',
    focus: '跳转聚焦到文档',
    parent: '上级文档',
    children: '子文档',
    siblings: '同级文档',
    no: '无'
}


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

    let siblings = await listChildDocs({path: parentPath, box});
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
    let parentNode = parent ?? {
        box: doc.box,
        path: '/',
    };
    let siblingsPromise = listChildDocs(parentNode);
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


const A = (props: { id: string, hightlight?: boolean, children: any, dialog: Dialog }) => {

    const open = () => {
        openTab({
            app: plugin_?.app,
            doc: {
                id: props.id
            }
        });
        props.dialog.destroy();
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


const DocContextComponent = (props: {
    doc: any, parent: any, children: any[], siblings: any[], docPaths: any[], dialog: Dialog
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
            <h4>⬆️ {I18n.parent}</h4>
            <Show when={parent} fallback={<p>{I18n.no}</p>}>
                <p><A id={parent.id} dialog={props.dialog}>{parent.content}</A></p>
            </Show>
            <h4>⬇️ {I18n.children}</h4>
            <Show when={children.length > 0} fallback={<p>{I18n.no}</p>}>
                <ol>
                    <For each={children}>
                        {(item) => (
                            <li><A id={item.id} dialog={props.dialog}>{item.name.replace('.sy', '')}</A></li>
                        )}
                    </For>
                </ol>
            </Show>
            <h4>↔️ {I18n.siblings}</h4>
            <Show when={siblings.length > 0} fallback={<p>{I18n.no}</p>}>
                <ol>
                    <For each={siblings}>
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
        </section>
    );
};


let plugin_: FMiscPlugin;
// const keymapTag = window.siyuan.config.keymap.general.tag;
const Keymap = '⌥S';

const KeymapConfig = window.siyuan.config.keymap;

export let name = "DocContext";
export let enabled = false;
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
            let dialog = simpleDialog({
                title: I18n.name,
                ele: element,
                width: "800px",
            });
            render(() => DocContextComponent({ ...context, dialog }), element);
            let container = dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
            container.style.setProperty('max-width', '80%');
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
        let closeCurrentDoc = () => {};
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

        let siblings: {id: string, path: string}[] = await getSibling(path, box);
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
