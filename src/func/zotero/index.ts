/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-24 16:08:19
 * @FilePath     : /src/func/zotero/index.ts
 * @LastEditTime : 2024-05-30 12:51:54
 * @Description  : 
 */
import { Protyle, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { addProcessor, delProcessor } from "@/global-paste";

import { ZoteroDBModal } from "./zoteroModal";

const pasteProcessor = (detail: ISiyuanEventPaste) => {
    let textPlain = detail.textPlain;
    //处理 Zotero 的粘贴
    const zoteroPat = /^“(?<title>.+?)”\s*\(\[(?<itemName>.+?)\]\((?<itemLink>zotero:.+?)\)\)\s*\(\[pdf\]\((?<annoLink>zotero:.+?)\)\)$/
    const ans = textPlain.match(zoteroPat);
    if (!ans) return false;
    let title = ans.groups.title;
    let itemName = ans.groups.itemName;
    // let itemLink = ans.groups.itemLink;
    let annoLink = ans.groups.annoLink;
    const txt = `“${title}”([${itemName}](${annoLink}))`;
    console.debug("Paste zotero link:", txt);
    detail.resolve({
        textPlain: txt, textHTML: "<!--StartFragment--><!--EndFragment-->",
        files: detail.files, siyuanHTML: detail.siyuanHTML
    });
    return true;
}

let zotero: ZoteroDBModal = null;

export let name = 'Zotero';
export let enabled = false;

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    // plugin.eventBus.on("paste", onPaste);
    addProcessor(name, pasteProcessor);
    enabled = true;

    zotero = new ZoteroDBModal(plugin);
    plugin.addProtyleSlash({
        id: "zotero-cite-selected",
        filter: ["cite"],
        html: '引用 Zotero 选中项',
        callback: async (protyle: Protyle) => {
            const data = await zotero.getSelectedItems();
            protyle.insert(window.Lute.Caret, false, false); //插入特殊字符清除 slash
            if ([null, undefined].includes(data) || data.length === 0) {
                return;
            }
            showMessage(`Zotero: 插入选中的 ${data.length} 篇文献`, 3000);
            let links = data.map(item => `[${item.title}](zotero://select/library/items/${item.key})`);
            if (links.length === 1) {
                protyle.insert(links[0], false, false);
            } else if (links.length > 1) {
                protyle.insert(links.map(s => `- ${s}`).join("\n"), true, false);
            }
        }
    });
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    // plugin.eventBus.off("paste", onPaste);
    delProcessor(name);
    enabled = false;

    zotero = null;
}
