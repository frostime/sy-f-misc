import type FMiscPlugin from "@/index";

import { simpleDialog } from "@/components/dialog";
import { getBlockByID, listDocsByPath } from "@/api";
import { getActiveDoc, html2ele, getNotebook } from "@/utils";


async function getParentDocument(path: string) {
    //path 的样式: /<1>/<2>/<3>
    //目标: 上一层的文档的 ID，如果不存在则返回空
    let pathArr = path.split("/").filter((item) => item != "");
    pathArr.pop();
    if (pathArr.length == 0) {
        return null;
    } else {
        let id = pathArr[pathArr.length - 1];
        return getBlockByID(id);
    }
}

const listChildDocs = async (doc: Block) => {
    let data = await listDocsByPath(doc.box, doc.path);
    console.log(data);
    return data?.files;
}

const createContextDom = async () => {
    let docId = getActiveDoc();
    if (!docId) {
        return null;
    }
    let doc = await getBlockByID(docId);
    let parent = await getParentDocument(doc.path);
    let children = await listChildDocs(doc);
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
<section class="item__readme b3-typography fn__flex-1" style="margin: 1em; font-size: 1.2rem;">
    <p>【${getNotebook(doc.box).name}】/${docPaths.map((d) => {
        return `<a href="siyuan://blocks/${d.id}">${d.title}</a>`;
    }).join('/')}</p>
    <p class="btn-focus" style="font-weight: bold; color: var(--b3-theme-primary); cursor: pointer;">
    🎯 跳转聚焦到文档
    </p>
    <h3>上级文档</h3>
    ${
        parent === null ? "<p>无</p>" : `
        <p><a href="siyuan://blocks/${parent.id}">${parent.content}</a></p>
        `
    }
    <h3>子文档</h3>
    ${
        children.length === 0 ? "<p>无</p>" : `

        <ol style="column-count: 3; column-gap: 30px;">
            ${
                children.map((item) => {
                    return `<li><a href="siyuan://blocks/${item.id}">${item.name.replace('.sy', '')}</a></li>`;
                }).join("")
            }
        </ol>
        `
    }
</section>
`;
    return html2ele(dom);
}


const keymapTag = window.siyuan.config.keymap.general.tag;

export let name = "DocContext";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    keymapTag.custom = '';
    plugin.addCommand({
        langKey: 'F-Misc::DocContext',
        langText: 'F-misc 上下文文档',
        hotkey: keymapTag.default,
        callback: async () => {
            let dom = await createContextDom();
            if (!dom) {
                return;
            }
            let dialog = simpleDialog({
                title: "文档上下文",
                ele: dom,
                width: "750px",
            });
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

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.commands = plugin.commands.filter((command) => command.langKey !== 'F-Misc::DocContext');
    keymapTag.custom = keymapTag.default;
}