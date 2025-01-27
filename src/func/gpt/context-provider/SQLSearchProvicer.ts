/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:25:34
 * @FilePath     : /src/func/gpt/context-provider/SQLSearchProvicer.ts
 * @LastEditTime : 2025-01-27 15:48:59
*/

import { BlockTypeName } from "@frostime/siyuan-plugin-kits";
import { sql } from "@frostime/siyuan-plugin-kits/api";

const SQLSearchProvicer: CustomContextProvider = {
    type: "query",
    name: "SQL",
    displayTitle: "SQL 查询",
    description: "使用 SQL 查询思源的笔记内容",
    getContextItems: async (options: {
        query: string;
    }): Promise<ContextItem[]> => {
        let blocks = [];
        try {
            blocks = await sql(options.query);
        } catch (error) {
            console.error(error);
            return [];
        }
        return blocks.map((block, index) => ({
            name: `搜索结果 ${index + 1}`,
            description: `来自文档 ${block.hpath}; ${BlockTypeName[block.type]}: ${block.id}`,
            content: block.markdown || block.content,
        }));
    },
};


export default SQLSearchProvicer;
