/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-07 16:52:25
 * @FilePath     : /src/func/gpt/context-provider/TextSearchProvider.ts
 * @LastEditTime : 2025-02-07 17:55:10
 * @Description  : Reference to https://ld246.com/article/1738895231883
 */
import { getNotebook } from "@frostime/siyuan-plugin-kits";
import { request } from "@frostime/siyuan-plugin-kits/api";


const TextSearchProvider: CustomContextProvider = {
    name: 'TextSearch',
    displayTitle: '关键词搜索',
    description: '在笔记库中搜索关键词',
    type: 'input-line',
    icon: 'iconFont',
    async getContextItems(options) {
        let { query } = options;

        query = query.trim();
        if (!query) {
            return [];
        }

        const payload = {
            query: query,
            method: 0,
            types: {
                audioBlock: false,
                blockquote: true,
                codeBlock: false,
                databaseBlock: true,
                document: true,
                embedBlock: false,
                heading: true,
                htmlBlock: false,
                iframeBlock: false,
                list: false,
                listItem: false,
                mathBlock: true,
                paragraph: true,
                superBlock: false,
                table: true,
                videoBlock: false,
                widgetBlock: false,
            },
            paths: [],
            groupBy: 0,
            orderBy: 0,
            page: 1,
            reqId: Date.now(),
        };

        try {
            const data = await request('/api/search/fullTextSearchBlock', payload);

            const blocks = data.blocks as {
                id: string;
                fcontent: string;
                content: string;
                name: string;
                markdown: string;
                hPath: string;
                type: string;
                box: string;
            }[];
            // 去掉 <mark> 和 </mark>
            let noMark = (text: string) => text.replace(/<mark>|<\/mark>/g, '');
            return blocks.map(block => ({
                name: block.content.length > 20 ? noMark(block.content).slice(0, 20) + '...' : noMark(block.content),
                description: `[${block.type}] <a class="popover__block" data-id="${block.id}" href="siyuan://blocks/${block.id}">siyuan://blocks/${block.id}</a>, 父文档路径: /${getNotebook(block.box).name}${block.hPath}`,
                content: noMark(block.markdown || block.content),
            }));
        } catch (error) {
            console.error('TextSearch error:', error);
            return [{
                name: '搜索出错',
                description: '搜索过程中发生错误',
                content: String(error),
            }];
        }
    }
};

export default TextSearchProvider;
