import type FMiscPlugin from "@/index";

import { simpleDialog } from "@/components/dialog";
import { getBlockByID } from "@/api";
import { getActiveDoc, html2ele, getChildDocs, getNotebook } from "@/utils";

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

const createContextDom = async () => {
    let docId = getActiveDoc();
    if (!docId) {
        return null;
    }
    let doc = await getBlockByID(docId);
    let parent = await getParentDocument(doc.path);
    let children = await getChildDocs(doc.id);
    const dom = `
<section class="item__readme b3-typography fn__flex-1" style="margin: 1em; font-size: 1.2rem;">
    <p>【${getNotebook(doc.box).name}】${doc.hpath}</p>
    <h3>上级文档</h3>
    ${
        parent === null ? "<p>无</p>" : `
        <p><a href="siyuan://blocks/${parent.id}">${parent.content}</a></p>
        `
    }
    <h3>子文档</h3>
    ${
        children.length === 0 ? "<p>无</p>" : `

        <ol style="column-count: 3; column-gap: 25px;">
            ${
                children.map((item) => {
                    return `<li><a href="siyuan://blocks/${item.id}">${item.content}</a></li>`;
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
            simpleDialog({
                title: "文档上下文",
                ele: dom,
                width: "750px",
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