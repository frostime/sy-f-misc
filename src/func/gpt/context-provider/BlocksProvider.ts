/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:25:34
 * @FilePath     : /src/func/gpt/context-provider/BlocksProvider.ts
 * @LastEditTime : 2025-03-14 15:31:15
*/

import { BlockTypeName, getBlockByID, getMarkdown } from "@frostime/siyuan-plugin-kits";

const BLOCK_ID_REGEX = /(\d{14}-[0-9a-z]{7})/;

const parseID = (text: string) => {
    const match = text.match(BLOCK_ID_REGEX);
    return match?.[1] ?? null;
}

const BlocksProvider: CustomContextProvider = {
    type: "input-area",
    name: "SiyuanBlocks",
    icon: 'iconH2',
    displayTitle: "指定块内容",
    description: "每行输入一个块的 ID/链接/引用（包含块 ID 即可），自动查询对应块的内容并汇总起来",
    getContextItems: async (options: {
        query: string;
    }): Promise<ContextItem[]> => {
        const lines = options.query.split('\n').filter(line => line.trim());
        let ids: string[] = [];

        // Extract block IDs from each line
        for (const line of lines) {
            const id = parseID(line);
            if (id) {
                ids.push(id);
            }
        }

        // Retrieve block content for each ID
        let blocks = await Promise.all(ids.map(async (id) => {
            const block = await getBlockByID(id);
            if (!block) {
                return null;
            }
            let content = block.markdown;
            if (block.type === 'd' || block.type === 'h') {
                content = await getMarkdown(id);
            }
            return {
                name: `来自块: ${id}`,
                description: `${BlockTypeName[block.type]}，来自文档 ${block.hpath}`,
                content: content,
            };
        }));
        blocks = blocks.filter(block => block !== null);

        return blocks;
    },
};

export default BlocksProvider;
