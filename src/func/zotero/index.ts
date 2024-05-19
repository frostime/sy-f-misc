/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-24 16:08:19
 * @FilePath     : /src/func/zotero/index.ts
 * @LastEditTime : 2024-05-19 18:43:08
 * @Description  : 
 */
import { Protyle, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";

import { ZoteroDBModal } from "./zoteroModal";

const onPaste = async (event) => {
    let textPlain = event.detail.textPlain;
    globalThis.textPlain = textPlain;

    //处理 Zotero 的粘贴
    const zoteroPat = /^“(?<title>.+?)”\s*\(\[(?<itemName>.+?)\]\((?<itemLink>zotero:.+?)\)\)\s*\(\[pdf\]\((?<annoLink>zotero:.+?)\)\)$/
    const ans = textPlain.match(zoteroPat);
    if (ans) {
        let title = ans.groups.title;
        let itemName = ans.groups.itemName;
        let itemLink = ans.groups.itemLink;
        const txt = `“${title}”([${itemName}](${itemLink}))`;
        console.debug("Paste zotero link:", txt);
        event.detail.resolve({
            textPlain: txt, textHTML: "<!--StartFragment--><!--EndFragment-->",
            files: event.detail.files, siyuanHTML: event.detail.siyuanHTML
        });
    }
}

let zotero: ZoteroDBModal = null;

export let name = 'Zotero';
export let enabled = false;

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    plugin.eventBus.on("paste", onPaste);
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
    plugin.eventBus.off("paste", onPaste);
    enabled = false;

    zotero = null;
}
