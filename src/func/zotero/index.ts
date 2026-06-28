/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-24 16:08:19
 * @FilePath     : /src/func/zotero/index.ts
 * @LastEditTime : 2025-03-24 15:38:59
 * @Description  : 
 */
import { Menu, Protyle, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { addProcessor, delProcessor } from "@/func/global-paste";

import { ZoteroDBModal } from "./zoteroModal";
import { ensureZoteroConfigLoaded, getZoteroDir, markMigrationPromptShown, shouldShowMigrationPrompt } from "./config";
import { documentDialog } from "@/libs/dialog";

export { declareModuleConfig } from "./config";

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
let migrationPromptChecked = false;

const SPECIAL_CHAR_DOLLAR = '转义美元真麻烦';

const showMigrationGuideIfNeeded = async () => {
    await ensureZoteroConfigLoaded();
    if (migrationPromptChecked || !shouldShowMigrationPrompt()) {
        return;
    }
    migrationPromptChecked = true;
    await markMigrationPromptShown();
    documentDialog({
        title: 'Zotero 功能升级提示',
        sourceUrl: `{{docs}}/zotero-migration.md`,
    });
}

const parseNoteHtml = (html: string, zoteroDir: string) => {
    console.group('Parse note html');

    let div = document.createElement('div');
    div.innerHTML = html;
    let ele = div.firstElementChild as HTMLElement;
    if (process.env.DEV_MODE) {
        console.debug(ele.cloneNode(true));
    }

    if (!ele) return html;

    ele.querySelectorAll('span.citation')?.forEach((span: HTMLSpanElement) => {
        // Create a container to hold the formatted citation
        const container = document.createElement('span');

        // Add opening parenthesis
        container.append('(');

        // Get all citation items
        const citationItems = span.querySelectorAll('.citation-item');

        // Parse the citation data
        let data = decodeURIComponent(span.dataset.citation);
        const citationObject = JSON.parse(data);

        // Process each citation item
        citationItems.forEach((item: HTMLSpanElement, index: number) => {
            // Create anchor for this citation item
            const anchor = document.createElement('a');
            anchor.innerHTML = item.innerHTML;

            // Get the corresponding URI from the citation object
            if (citationObject.citationItems && citationObject.citationItems[index] && citationObject.citationItems[index].uris) {
                let href: string = citationObject.citationItems[index].uris[0];

                // Transform the URI format
                href = href.replace(/https?:\/\/zotero\.org\/users\/local\/[^/]+\/items\/([^?]+)/, 'zotero://select/library/items/$1');
                href = href.replace(/https?:\/\/zotero\.org\/users\/\d+/, 'zotero://select/library');

                anchor.href = href;
            }

            // Add the anchor to the container
            container.appendChild(anchor);

            // Add separator between items if not the last one
            if (index < citationItems.length - 1) {
                container.append('; ');
            }
        });

        // Add closing parenthesis
        container.append(')');

        // Replace the original span with the container
        if (span.parentNode) {
            span.parentNode.replaceChild(container, span);
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
        // Create a container to hold both the text span and the link
        const container = document.createElement('span');

        // Create a text span to hold the original content
        const textSpan = document.createElement('span');
        textSpan.innerHTML = span.innerHTML;

        // Create the anchor element for the link
        const anchor = document.createElement('a');
        anchor.textContent = 'PDF'; // Using a document emoji for the link

        // Process the annotation data
        let data = decodeURIComponent(span.dataset.annotation);
        const citationObject = JSON.parse(data);
        let href: string = citationObject[`attachmentURI`] + `?page=${citationObject['pageLabel']}&annotation=${citationObject['annotationKey']}`
        // First try to match local pattern, then fall back to original pattern
        href = href.replace(/https?:\/\/zotero\.org\/users\/local\/[^/]+\/items\/([^?]+)(.*)/, 'zotero://open-pdf/library/items/$1$2');
        href = href.replace(/https?:\/\/zotero\.org\/users\/\d+/, 'zotero://open-pdf/library');
        anchor.href = href;

        // Add both elements to the container
        container.appendChild(textSpan);
        container.append('(');
        container.appendChild(anchor);
        container.append(')');

        // Replace the original span with the container
        if (span.parentNode) {
            span.parentNode.replaceChild(container, span);
        }
    });
    ele.querySelectorAll('img[data-attachment-key]')?.forEach((img: HTMLImageElement) => {
        let key = img.getAttribute('data-attachment-key');
        // let zoteroDir = 'H:\\Media\\Zotero';
        let imagePath = `${zoteroDir}/storage/${key}/image.png`;
        let uri = `file:///${imagePath.replace(/\\/g, '/')}`;
        let newimg: HTMLImageElement = document.createElement('img');
        newimg.alt = img.innerHTML;
        newimg.src = uri;

        let anchorSrc;
        if (img.getAttribute('data-annotation')) {
            let data = decodeURIComponent(img.dataset.annotation);
            const citationObject = JSON.parse(data);
            let href: string = citationObject[`attachmentURI`] + `?page=${citationObject['pageLabel']}&annotation=${citationObject['annotationKey']}`
            // First try to match local pattern, then fall back to original pattern
            href = href.replace(/https?:\/\/zotero\.org\/users\/local\/[^/]+\/items\/([^?]+)(.*)/, 'zotero://open-pdf/library/items/$1$2');
            href = href.replace(/https?:\/\/zotero\.org\/users\/\d+/, 'zotero://open-pdf/library');
            anchorSrc = document.createElement('a');
            anchorSrc.href = href;
            anchorSrc.textContent = 'PDF';
        }

        if (img.parentNode) {
            const parent = img.parentNode as HTMLElement;
            parent.replaceChild(newimg, img);
            // 插入到 parent> newimg 后面
            if (anchorSrc) {
                parent.append('(', anchorSrc, ')');
            }
        }
    });
    console.groupEnd();
    // console.log(ele)
    return ele.innerHTML;
}

export let name = 'Zotero';
export let enabled = false;


export const declareToggleEnabled = {
    title: '📚 Zotero',
    description: '启用 Zotero 相关功能',
    defaultEnabled: false
};

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    // plugin.eventBus.on("paste", onPaste);
    addProcessor(name, pasteProcessor);
    enabled = true;

    ensureZoteroConfigLoaded();
    zotero = new ZoteroDBModal();
    plugin.addProtyleSlash({
        id: "zotero-cite-selected",
        filter: ["cite", "zotero"],
        html: '引用 Zotero 选中项',
        callback: async (protyle: Protyle) => {
            await showMigrationGuideIfNeeded();
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
        filter: ["cite", "zotero"],
        html: '导入 Zotero 选中项笔记',
        callback: async (protyle: Protyle) => {
            // console.log(protyle);
            await showMigrationGuideIfNeeded();
            const data: Object = await zotero.getItemNote();
            if (!data) return;
            let keys = Object.keys(data);

            const parseNote = (inputHTML: string) => {
                let html = parseNoteHtml(inputHTML, getZoteroDir());
                let lute = window.Lute.New();
                let md = lute.HTML2Md(html);
                md = md.replaceAll(SPECIAL_CHAR_DOLLAR, '$');
                md = md.replace(/\\+/g, '\\');
                return md;
            }

            if (keys.length === 1) {
                let md = parseNote(data[keys[0]]);
                protyle.insert(md, true);
            } else if (keys.length > 1) {
                const selection = document.getSelection();
                // 获取第一个范围（通常只有一个范围）
                const range = selection.getRangeAt(0);

                // 获取范围的边界矩形
                const rect = range.getBoundingClientRect();

                let menu = new Menu();
                const maxLength = 30;
                keys.forEach((key, index) => {
                    menu.addItem({
                        label: key.length > maxLength ? key.slice(0, maxLength) + '...' : key,
                        click: () => {
                            let md = parseNote(data[keys[index]]);
                            protyle.insert(md, true);
                        }
                    });
                });
                menu.open({
                    x: rect.x,
                    y: rect.y
                });
            }
        }
    });

    globalThis.ZoteroSDK = {
        checkConnection: async () => {
            return await zotero.checkZoteroRunning();
        }
    }
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    // plugin.eventBus.off("paste", onPaste);
    delProcessor(name);
    plugin.delProtyleSlash("zotero-cite-selected");
    plugin.delProtyleSlash("zotero-seleted-note");
    enabled = false;

    zotero = null;
    migrationPromptChecked = false;
    delete globalThis.ZoteroSDK;
}
