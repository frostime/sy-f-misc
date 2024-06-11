/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-06-10 14:55:35
 * @FilePath     : /src/func/doc-context.ts
 * @LastEditTime : 2024-06-10 15:21:03
 * @Description  : 
 */
import { type Plugin } from "siyuan";

import { simpleDialog } from "@/libs/dialog";
import { getBlockByID, listDocsByPath } from "@/api";
import { getActiveDoc, html2ele, getNotebook } from "@/utils";


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

const createContextDom = async () => {
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
    const dom = `
<section class="doc-context item__readme b3-typography fn__flex-1" style="margin: 1em;">
    <p>🍞 [${getNotebook(doc.box).name}]/${docPaths.map((d) => {
        return `<a href="siyuan://blocks/${d.id}">${d.title}</a>`;
    }).join('/')}</p>
    <p class="btn-focus" style="font-weight: bold; color: var(--b3-theme-primary); cursor: pointer;">
    🎯 ${I18n.focus}
    </p>
    <h4>⬆️ ${I18n.parent}</h4>
    ${
        parent === null ? `<p>${I18n.no}</p>` : `
        <p><a href="siyuan://blocks/${parent.id}">${parent.content}</a></p>
        `
    }
    <h4>⬇️ ${I18n.children}</h4>
    ${
        children.length === 0 ? `<p>${I18n.no}</p>` : `

        <ol style="font-size: 18px; ${children.length >= 3 ? 'column-count: 3; column-gap: 30px;' : ''}">
            ${
                children.map((item) => {
                    return `<li><a href="siyuan://blocks/${item.id}">${item.name.replace('.sy', '')}</a></li>`;
                }).join("")
            }
        </ol>
        `
    }

    <h4>↔️ ${I18n.siblings}</h4>
    ${
        siblings.length === 0 ? `<p>${I18n.no}</p>` : `

        <ol style="font-size: 18px; ${siblings.length >= 3 ? 'column-count: 3; column-gap: 30px;' : ''}">
            ${
                siblings.map((item) => {
                    let style = item.id === doc.id ? 'font-weight: bold; color: var(--b3-theme-primary); border-bottom: 2px solid var(--b3-theme-primary)' : '';
                    return `<li><a style="${style}" href="siyuan://blocks/${item.id}">${item.name.replace('.sy', '')}</a></li>`;
                }).join("")
            }
        </ol>
        `
    }

</section>
`;
    return html2ele(dom);
}


// const keymapTag = window.siyuan.config.keymap.general.tag;
const Keymap = '⌥S';

export let name = "DocContext";
export let enabled = false;
export const load = (plugin: Plugin) => {
    if (enabled) return;
    enabled = true;

    plugin.addCommand({
        langKey: 'F-Misc::DocContext',
        langText: `F-misc ${I18n.name}`,
        hotkey: Keymap,
        callback: async () => {
            if (document.querySelector('.doc-context')) return;
            let dom = await createContextDom();
            if (!dom) {
                return;
            }
            let dialog = simpleDialog({
                title: I18n.name,
                ele: dom,
                width: "800px",
            });
            let container = dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
            container.style.setProperty('max-width', '80%');
            container.style.setProperty('max-height', '75%');
            dialog.element.querySelector('section').addEventListener('click', (e) => {
                let target = e.target as HTMLElement;
                if (target.closest('p.btn-focus')) {
                    let dock = document.querySelector(`.dock__items>span[data-type="file"]`) as HTMLElement;
                    let ele = document.querySelector('div.file-tree span[data-type="focus"]') as HTMLElement;
                    if (!dock && !ele) return;
                    if (dock && !dock.classList.contains('dock__item--active')) {
                        dock.click();
                    }
                    if (ele) {
                        ele.click();
                    }
                    dialog.destroy();
                } else if (target.closest('a')) {
                    dialog.destroy();
                }
            });
        }
    });
}

export const unload = (plugin: Plugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.commands = plugin.commands.filter((command) => command.langKey !== 'F-Misc::DocContext');
}