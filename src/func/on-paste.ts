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

export const load = (plugin: FMiscPlugin) => {
    plugin.eventBus.on("paste", onPaste);
}

export const unload = (plugin: FMiscPlugin) => {
    plugin.eventBus.off("paste", onPaste);
}
