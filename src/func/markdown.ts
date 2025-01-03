/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-03 17:23:30
 * @FilePath     : /src/func/markdown.ts
 * @LastEditTime : 2025-01-03 18:13:33
 * @Description  : 
 */
import { exportMdContent } from "@/api";
import { getLute, html2ele, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { getBlockByID, request } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";

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
        console.log(detail);
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
};