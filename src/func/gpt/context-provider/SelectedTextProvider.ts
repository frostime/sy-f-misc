/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:25:34
 * @FilePath     : /src/func/gpt/context-provider/SelectedTextProvider.ts
 * @LastEditTime : 2025-03-30 21:54:32
* @Description  : 
*/

import { getLute } from "@frostime/siyuan-plugin-kits";

const getSelectedBlock = () => {
    let nodes = document.querySelectorAll('.protyle-wysiwyg--select');
    if (nodes.length === 0) {
        return [];
    }
    // 获取所有选中的块的父级 .protyle-content 元素
    const contentMap = new Map<HTMLElement, HTMLElement[]>();
    nodes.forEach((node: HTMLElement) => {
        let content = node.closest('.protyle-content') as HTMLElement;
        if (content) {
            if (!contentMap.has(content)) {
                contentMap.set(content, []);
            }
            contentMap.get(content)?.push(node);
        }
    });

    // 对每个 .protyle-content 下的节点进行排序并获取 markdown
    const contextItems: ContextItem[] = [];
    const lute = getLute();
    for (const [protyle, nodes] of contentMap) {
        if (nodes.length === 0) {
            continue;
        }
        // 根据 data-node-index 排序
        nodes.sort((a, b) => {
            const indexA = parseInt(a.getAttribute('data-node-index') || '0', 10);
            const indexB = parseInt(b.getAttribute('data-node-index') || '0', 10);
            return indexA - indexB;
        });
        let markdowns = [];
        nodes.forEach((node: HTMLElement) => {
            let markdown = lute.BlockDOM2StdMd(node.outerHTML);
            markdowns.push(markdown);
        });
        let markdown = markdowns.join('\n').trim();

        const title = protyle.querySelector('.protyle-title__input');
        const displayTitle = title?.textContent ?? '';
        contextItems.push({
            name: markdown.length > 15 ? markdown.substring(0, 15) + '...' : markdown,
            description: `用户在文档${displayTitle ? `[${displayTitle}]` : ''}中选中的内容块`,
            content: markdown,
        });
    }
    return contextItems;
}

const getSelectedText = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return [];
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) return [];
    return [{
        name: '选中文本',
        description: '',
        content: selectedText,
    }];
}

const SelectedTextProvider: CustomContextProvider = {
    name: "SelectedText",
    icon: 'iconSelectText',
    displayTitle: "选中内容",
    description: "用户在思源编辑器中选中的块或者文本等",
    getContextItems: async (options?: any): Promise<ContextItem[]> => {
        const selectedBlockContext = getSelectedBlock();
        // return selectedBlockContext;
        if (selectedBlockContext.length > 0) {
            return selectedBlockContext;
        }
        return getSelectedText();
    },
};


export default SelectedTextProvider;