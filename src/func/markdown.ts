/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-03 17:23:30
 * @FilePath     : /src/func/markdown.ts
 * @LastEditTime : 2025-02-10 13:46:36
 * @Description  : 
 */
import { exportMdContent } from "@/api";
import { getLute, html2ele, id2block, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { getBlockByID, request, updateBlock } from "@frostime/siyuan-plugin-kits/api";
import { Protyle, showMessage } from "siyuan";

export let name = "Markdown";
export let enabled = false;

// Optional: Configure module settings
export const declareToggleEnabled = {
    title: "✏️ Markdown",
    description: "Markdown 文档相关功能",
    defaultEnabled: true
};

const exportDialog = (md: string, title: string) => {

    const html = `
    <div class="fn__flex fn__flex-column" style="height: 100%; flex: 1; gap: 3px; padding: 8px 12px; box-sizing: border-box;">
    <div data-type="row" style="font-size: 17px; display: flex; gap: 5px; align-items: center;">
        <span style="font-weight: 500; flex: 1;">${title}</span>
        <button class="b3-button b3-button--text">Download</button>
    </div>
    <textarea class="b3-text-field fn__block" style="font-size: 18px; resize: none; flex: 1;" spellcheck="false">${md}</textarea>
    </div>
    `;
    const ele = html2ele(html);

    const download = () => {
        let text = ele.querySelector('textarea')?.value;
        if (!text) return;
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = title + '.md';
        a.click();
        showMessage('下载成功');
    }

    ele.querySelector('button')?.addEventListener('click', download);

    simpleDialog({
        title: title,
        ele: ele,
        width: '1200px',
        height: '700px',
    })
}

let disposer = () => { };
export const load = () => {
    if (enabled) return;
    enabled = true;
    const plugin = thisPlugin();
    let d1 = plugin.registerOnClickDocIcon((detail) => {
        const { root_id } = detail;
        detail.menu.addItem({
            label: '查看 Markdown',
            icon: 'iconMarkdown',
            click: async () => {
                let md = await exportMdContent(root_id);
                exportDialog(md.content, md.hPath.split('/').pop() || 'Markdown');
            }
        });
    });
    let d2 = plugin.registerOnClickBlockicon((detail) => {
        // console.log(detail);
        if (detail.blocks.length !== 1) return;
        let block = detail.blocks[0];
        if (block.type !== 'NodeHeading') return;
        detail.menu.addItem({
            label: '查看 Markdown',
            icon: 'iconMarkdown',
            click: async () => {
                let dom = await request('/api/block/getHeadingChildrenDOM', {
                    id: block.id
                });
                let b = await getBlockByID(block.id) as Block;
                const lute = getLute();
                let md = lute.BlockDOM2StdMd(dom);
                exportDialog(md, b.content || 'Markdown');
            }
        });
    });

    /**
     * 格式化引用文本
     * 比如把 「其他文本项目 ((ID 锚文本))」 变为 「((ID 其他文本项目))」
     */
    plugin.addProtyleSlash({
        'id': 'format-refs',
        'filter': ['ref', 'backlink', 'formatref'],
        'html': '格式化双链引用',
        callback(protyle) {
            protyle.insert(window.Lute.Caret, false, false);

            setTimeout(async () => {
                const selection = window.getSelection();
                const focusNode: Node = selection?.focusNode;
                if (!focusNode) {
                    showMessage(`Failed, can't find focus node`, 5000, 'error');
                    return;
                }
                let ele: HTMLElement = focusNode.nodeType === Node.TEXT_NODE ?
                    focusNode.parentElement : focusNode as HTMLElement;
                ele = ele.closest('[data-node-id]') as HTMLElement;
                if (!ele) {
                    return
                }
                let id = ele.dataset.nodeId;

                let block = (await id2block(id))[0] || null;
                if (!block) return;

                const type = ele.dataset.type;

                if (!['NodeParagraph', 'NodeHeading'].includes(type)) return;

                const editable = ele.querySelector('div[contenteditable]');
                if (!editable) return;

                const blockRefs = editable.querySelectorAll('span[data-type="block-ref"]');
                if (blockRefs.length !== 1) return;

                // 获取所有子文本节点
                const textNodes = Array.from(editable.childNodes).filter(node => node.nodeType === Node.TEXT_NODE) as Text[];
                let newText = textNodes.map(node => node.textContent).join('').trim();
                if (newText.length === 0) return;

                const ref = blockRefs[0].cloneNode() as HTMLElement;

                // if (ref.dataset.subtype === 'd') {
                //     const oldText = ref.innerText;
                //     newText += oldText;
                // }
                ref.setAttribute('data-subtype', 's'); //设置为静态锚文本
                ref.innerText = newText;
                //更改 editable 的内容
                editable.innerHTML = '';
                editable.appendChild(ref);

                const inputEvent = new Event('input', {
                    bubbles: true,
                    cancelable: false
                });
                editable.dispatchEvent(inputEvent);
            }, 200);
        },
    });
    plugin.addProtyleSlash({
        id: 'superblock-rows',
        filter: ['superblock-rows', 'sb-rows', 'rows'],
        html: '多行超级块',
        callback: (protyle: Protyle) => {
            protyle.insert(`{{{row

{: id="20250209123606-srmeqlw" }

}}}
`.trim(), true);
        }
    });
    plugin.addProtyleSlash({
        id: 'superblock-cols',
        filter: ['cols-2'],
        html: '双列超级块',
        callback: (protyle: Protyle) => {
            protyle.insert(`{{{col

Col 1
{: id="20250209123606-aaaaaaa" }

Col 2
{: id="20250209123606-bbbbbbb" }

}}}
`.trim(), true);
        }
    });
    disposer = () => {
        d1();
        d2();
    }
};

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    disposer();
    disposer = () => { };
    const plugin = thisPlugin();
    plugin.delProtyleSlash('format-refs');
    plugin.delProtyleSlash('superblock-rows');
};