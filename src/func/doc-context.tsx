/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-06-10 14:55:35
 * @FilePath     : /src/func/doc-context.tsx
 * @LastEditTime : 2024-06-23 16:35:57
 * @Description  : 
 */
import { For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { type Plugin, type Dialog, openTab } from "siyuan";

import { simpleDialog } from "@/libs/dialog";
import { getBlockByID, listDocsByPath } from "@/api";
import { getActiveDoc, getNotebook } from "@/utils";


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
            <span data-id={props.id} onClick={open} style={{
                outline: props?.hightlight ? 'solid var(--b3-theme-primary-light)' : 0,
                'font-weight': props?.hightlight ? 'bold' : 'inherit',
            }}>
                {props.children}
            </span>
            <style jsx>
                {`
                    span {
                        cursor: pointer;
                        color: var(--b3-theme-primary);
                        padding: 1px 2px;
                    }
                    span:hover {
                        background-color: var(--b3-theme-primary-lightest);
                    }
                `}
            </style>
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
            <style jsx>{`
                .btn-focus {
                    font-size: 19px;
                    font-weight: bold;
                    color: var(--b3-theme-primary);
                    cursor: pointer;
                }
                ol {
                    font-size: 18px;
                    column-gap: 30px;
                    column-count: 3;
                }
            `}</style>
        </section>
    );
};


let plugin_: Plugin;
// const keymapTag = window.siyuan.config.keymap.general.tag;
const Keymap = '⌥S';

export let name = "DocContext";
export let enabled = false;
export const load = (plugin: Plugin) => {
    if (enabled) return;
    enabled = true;
    plugin_ = plugin;
    plugin.addCommand({
        langKey: 'F-Misc::DocContext',
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
}

export const unload = (plugin: Plugin) => {
    if (!enabled) return;
    enabled = false;
    plugin_ = null;
    plugin.commands = plugin.commands.filter((command) => command.langKey !== 'F-Misc::DocContext');
}