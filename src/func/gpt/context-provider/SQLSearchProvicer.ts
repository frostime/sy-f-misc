/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:25:34
 * @FilePath     : /src/func/gpt/context-provider/SQLSearchProvicer.ts
 * @LastEditTime : 2025-01-29 22:52:07
*/

import { BlockTypeName, getMarkdown } from "@frostime/siyuan-plugin-kits";
import { sql } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";


const parseSQLInput = (sqlCode: any) => {
    // 将 SQL 语句中的 \*、\[、\] 和 \S 替换为 \\*、\\[、\\] 和 \\S
    // 这样在 JavaScript 中，它们将被解析为原本期望的正则表达式
    return sqlCode.replace(/\\(\*|\[|\]|\S)/g, '\\\\$1');
}

const validateInput = (sqlCode: any) => {
    //是否是 SQL 语法
    let pat = /select\s+([\s\S]+?)\s+from\s+([\s\S]+?)\s*$/i;
    if (!pat.test(sqlCode)) {
        return false;
    }
    return true;
}

const SQLSearchProvicer: CustomContextProvider = {
    type: "query",
    name: "SQL",
    icon: 'iconSQL',
    displayTitle: "SQL 查询",
    description: "使用 SQL 查询思源的笔记内容",
    getContextItems: async (options: {
        query: string;
    }): Promise<ContextItem[]> => {
        let blocks = [];
        if (!validateInput(options.query)) {
            showMessage("SQL 语法错误", 4000, "error");
            return null;
        }
        let code = parseSQLInput(options.query);
        try {
            blocks = await sql(code);
        } catch (error) {
            console.error(error);
            return [];
        }
        let results = [];
        let index = 0;
        for (let block of blocks) {
            const markdown = await getMarkdown(block.id);
            const result = {
                name: `搜索结果 ${index + 1}`,
                description: `来自文档 ${block.hpath}; ${BlockTypeName[block.type]}: ${block.id}`,
                content: markdown || block.content,
            };
            results.push(result);
            index++;
        }
        return results;
    },
};


export default SQLSearchProvicer;
