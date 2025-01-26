/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:25:34
 * @FilePath     : /src/func/gpt/context-provider/SelectedTextProvider.ts
 * @LastEditTime : 2025-01-26 21:46:12
* @Description  : 
*/

import { id2block } from "@frostime/siyuan-plugin-kits";
const SelectedTextProvider: CustomContextProvider = {
    name: "SelectedText",
    displayTitle: "选中内容",
    description: "用户在思源编辑器中选中的块或者文本等",
    getContextItems: async (options?: any): Promise<ContextItem[]> => {
        const selectedText = await getSelectedText();
        if (!selectedText) {
            return [];
        }
        return [
            {
                name: "Selected Text",
                description: "用户选中的内容",
                content: selectedText,
            },
        ];
    },
};

async function getSelectedText(): Promise<string> {

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return '';
    }

    const range = selection.getRangeAt(0);
    const element = range?.startContainer.parentElement.closest('.protyle-wysiwyg');

    if (!element) return '';

    let nodes = element.querySelectorAll('.protyle-wysiwyg--select');
    if (nodes.length === 0) {
        const selectedText = selection.toString().trim();
        return selectedText || '';
    }

    let blocksIds = [];
    nodes.forEach((node: HTMLElement) => {
        blocksIds.push(node.dataset.nodeId);
    });
    let blocks = await id2block(blocksIds);
    let blocksMap = new Map(blocks.map(block => [block.id, block]));
    let sortedBlocks = blocksIds.map(id => blocksMap.get(id));
    let blockMarkdown = sortedBlocks.map((block) => block?.markdown || '');
    const markdown = blockMarkdown.join('\n\n').trim();
    return markdown;
}


export default SelectedTextProvider;