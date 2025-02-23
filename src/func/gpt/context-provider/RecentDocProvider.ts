/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-24 00:24:24
 * @FilePath     : /src/func/gpt/context-provider/RecentDocProvider.ts
 * @LastEditTime : 2025-02-24 00:43:45
 * @Description  : 
 */
import { getMarkdown, getBlockByID, getNotebook, formatSiYuanDate, parseSiYuanTimestamp } from "@frostime/siyuan-plugin-kits";

import { sql } from "@frostime/siyuan-plugin-kits/api"

const recentUpdatedDoc = (limit: number = 16): Promise<Block[]> => {
    return sql(`
        select * from blocks where type='d'
        order by updated desc limit ${limit};
    `)
}


const RecentUpdatedDocProvider: CustomContextProvider = {
    name: "RecentUpdatedDoc",
    icon: 'iconFile',
    displayTitle: "近期文档",
    description: "最近更新的文档",
    type: "submenu",
    getContextItems: async (options: {
        selected: ContextSubmenuItem[];
    }): Promise<ContextItem[]> => {

        const parseItem = async (item: ContextSubmenuItem) => {
            const content = await getMarkdown(item.id);
            return {
                name: item.title,
                description: `文档: ${item.description}`,
                content: content,
            };
        };

        let contextItems: ContextItem[] = [];
        for (const item of options.selected) {
            let contextItem = await parseItem(item);
            if (contextItem) {
                contextItems.push(contextItem);
            }
        }
        return contextItems;
    },
    loadSubmenuItems: async (args: any) => {
        let recentlyUpdatedDocs = await recentUpdatedDoc();

        let items: ContextSubmenuItem[] = [];
        for (const doc of recentlyUpdatedDocs) {
            const description = getNotebook(doc.box).name + doc.hpath + ' | ' + parseSiYuanTimestamp(doc.updated).format('yyyy-MM-dd HH:mm:ss')
            items.push({
                id: doc.id,
                title: doc.content,
                description: description
            });
        }
        return items;
    }
};

export {
    RecentUpdatedDocProvider
};