/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-24 16:08:19
 * @FilePath     : /src/func/zotero/index.ts
 * @LastEditTime : 2024-07-04 20:23:12
 * @Description  : 
 */
import { Menu, Protyle, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { addProcessor, delProcessor } from "@/global-paste";
import { ILute } from "@/utils/lute";

import { ZoteroDBModal } from "./zoteroModal";
import { html2ele } from "@/utils";

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

const SPECIAL_CHAR_DOLLAR = '焯！转义美元';

const parseNoteHtml = (html: string) => {
    let div = document.createElement('div');
    div.innerHTML = html;
    let ele = div.firstElementChild as HTMLElement;
    console.log(ele)

    ele.querySelectorAll('span.citation')?.forEach((span: HTMLSpanElement) => {
        let anchor: HTMLAnchorElement = document.createElement('a');
        anchor.innerHTML = span.innerHTML;
        let data = decodeURIComponent(span.dataset.citation);
        const citationObject = JSON.parse(data);
        let href: string = citationObject['citationItems'][0]['uris'][0];
        anchor.href = href.replace(/https?:\/\/zotero\.org\/users\/\d+/, 'zotero://select/library')
        if (span.parentNode) {
            span.parentNode.replaceChild(anchor, span);
        }
    });
    ele.querySelectorAll('span.math')?.forEach((span: HTMLSpanElement) => {
        const math = document.createElement('span');
        math.className = 'language-math';
        let text = span.innerText;
        text = text.replaceAll('$', SPECIAL_CHAR_DOLLAR);
        math.innerText = text;
        if (span.parentNode) {
            span.parentNode.replaceChild(math, span);
        }
    });
    ele.querySelectorAll('span[data-annotation]')?.forEach((span: HTMLSpanElement) => {
        let anchor: HTMLAnchorElement = document.createElement('a');
        anchor.innerHTML = span.innerHTML;
        let data = decodeURIComponent(span.dataset.annotation);
        const citationObject = JSON.parse(data);
        let href: string = citationObject[`attachmentURI`] + `?page=${citationObject['pageLabel']}&annotation=${citationObject['annotationKey']}`
        anchor.href = href.replace(/https?:\/\/zotero\.org\/users\/\d+/, 'zotero://open-pdf/library')
        if (span.parentNode) {
            span.parentNode.replaceChild(anchor, span);
        }
    });
    ele.querySelectorAll('img[data-attachment-key]')?.forEach((img: HTMLImageElement) => {
        let key = img.getAttribute('data-attachment-key');
        let zoteroDir = 'H:\\Media\\Zotero';
        let imagePath = `${zoteroDir}/storage/${key}/image.png`;
        let uri = `file:///${imagePath.replace(/\\/g, '/')}`;
        let newimg: HTMLImageElement = document.createElement('img');
        newimg.alt = img.innerHTML;
        newimg.src = uri;
        if (img.parentNode) {
            img.parentNode.replaceChild(newimg, img);
        }
    });
    // console.log(ele)
    return ele.innerHTML;
}

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
    plugin.addProtyleSlash({
        id: "zotero-seleted-note",
        filter: ["cite"],
        html: '导入 Zotero 选中项笔记',
        callback: async (protyle: Protyle) => {
            console.log(protyle);
            const data: Object = await zotero.getItemNote();
            if (!data) return;
            let keys = Object.keys(data);

            if (keys.length === 1) {

                let html = parseNoteHtml(data[keys[0]]);
                let lute: ILute = window.Lute.New();
                let md = lute.HTML2Md(html);
                // md = `我是 $\\alpha$ 河梁哦`
                md = md.replaceAll(SPECIAL_CHAR_DOLLAR, '$');
                md = md.replace(/\\+/g, '\\');
                md = md.replace(/\\([_^])/g, '$1');;
                // console.log(md);
                protyle.insert(md, true);
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
