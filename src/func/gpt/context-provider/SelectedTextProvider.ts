/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:25:34
 * @FilePath     : /src/func/gpt/context-provider/SelectedTextProvider.ts
 * @LastEditTime : 2025-01-27 21:26:38
* @Description  : 
*/

import { id2block } from "@frostime/siyuan-plugin-kits";

const id2md = async (blocksIds: BlockId[]) => {
    // let blocksIds = [];
    // nodes.forEach((node: HTMLElement) => {
    //     blocksIds.push(node.dataset.nodeId);
    // });
    let blocks = await id2block(blocksIds);
    let blocksMap = new Map(blocks.map(block => [block.id, block]));
    let sortedBlocks = blocksIds.map(id => blocksMap.get(id));
    let blockMarkdown = sortedBlocks.map((block) => block?.markdown || '');
    const markdown = blockMarkdown.join('\n\n').trim();
    return markdown;
}

const SelectedTextProvider: CustomContextProvider = {
    name: "SelectedText",
    icon: 'iconSelectText',
    displayTitle: "选中内容",
    description: "用户在思源编辑器中选中的块或者文本等",
    getContextItems: async (options?: any): Promise<ContextItem[]> => {
        let nodes = document.querySelectorAll('.protyle-wysiwyg--select');
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
        for (const [protyle, nodes] of contentMap) {
            // 根据 data-node-index 排序
            nodes.sort((a, b) => {
                const indexA = parseInt(a.getAttribute('data-node-index') || '0', 10);
                const indexB = parseInt(b.getAttribute('data-node-index') || '0', 10);
                return indexA - indexB;
            });
            let blocksIds: BlockId[] = [];
            nodes.forEach((node: HTMLElement) => {
                blocksIds.push(node.dataset.nodeId as BlockId);
            });
            if (blocksIds.length > 0) {
                const markdown = await id2md(blocksIds);
                const title = protyle.querySelector('.protyle-title__input');
                const displayTitle = title.textContent;
                contextItems.push({
                    name: markdown.length > 15 ? markdown.substring(0, 15) + '...' : markdown,
                    description: `用户在文档 ${displayTitle} 中选中的文本`,
                    content: markdown,
                });
            }

        }
        return contextItems;
    },
};


export default SelectedTextProvider;