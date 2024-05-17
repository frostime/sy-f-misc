/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-24 16:08:19
 * @FilePath     : /src/func/on-paste.ts
 * @LastEditTime : 2024-05-17 14:29:59
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

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

export let name = 'Zotero';
export let enabled = false;

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    plugin.eventBus.on("paste", onPaste);
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    plugin.eventBus.off("paste", onPaste);
    enabled = false;
}
