/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:25:34
 * @FilePath     : /src/func/gpt/context-provider/SQLSearchProvicer.ts
 * @LastEditTime : 2025-02-23 21:09:26
*/

import { BlockTypeName, confirmDialog, getMarkdown } from "@frostime/siyuan-plugin-kits";
import { sql, request } from "@frostime/siyuan-plugin-kits/api";
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
    name: "QuerySearch",
    icon: 'iconSQL',
    displayTitle: "SQL/JS 查询",
    description: "使用嵌入块语法搜索笔记的内容; 默认视为 SQL 语句, 如果输入文本以 //!js 开头，则视为 js 代码. 查询语法必须返回块对象列表.",
    getContextItems: async (options: {
        query: string;
    }): Promise<ContextItem[]> => {
        let blocks = [];
        // if (!validateInput(options.query)) {
        //     showMessage("SQL 语法错误", 4000, "error");
        //     return null;
        // }
        let codeType = 'sql';
        let code = '';
        if (options.query.trim().startsWith('//!js')) {
            codeType = 'js';
            code = options.query.trim();
        } else {
            if (!validateInput(options.query)) {
                showMessage("查询语法错误", 4000, "error");
                return [];
            }
            code = parseSQLInput(options.query);
        }
        try {
            // blocks = await sql(code);
            if (codeType === 'sql') {
                blocks = await sql(code);
            } else {
                // blocks = await eval(code);
                code = `
                async function main(){
                    ${code}
                }
                return main();
                `;
                const func = new Function('request', 'sql', code);
                blocks = await func(request, sql);
            }
        } catch (error) {
            console.error(error);
            confirmDialog({
                title: "查询错误",
                content: error.message,
            });
            return [];
        }
        let results = [];
        let index = 0;
        for (let block of blocks) {
            const markdown = await getMarkdown(block.id);
            const result = {
                name: `搜索结果 ${index + 1}`,
                description: `来自文档 ${block.hpath}; 块类型: ${BlockTypeName[block.type]}; 块ID: ${block.id}`,
                content: markdown || block.content,
            };
            results.push(result);
            index++;
        }
        return results;
    },
};


export default SQLSearchProvicer;
