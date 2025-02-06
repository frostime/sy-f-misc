/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-22 10:26:12
 * @FilePath     : /src/func/gpt/utils.ts
 * @LastEditTime : 2025-01-27 18:05:40
 * @Description  : 
 */

import { sql } from "@/api";

//https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/util/addScript.ts
export const addScript = (path: string, id: string) => {
    return new Promise((resolve) => {
        if (document.getElementById(id)) {
            // 脚本加载后再次调用直接返回
            resolve(false);
            return false;
        }
        const scriptElement = document.createElement("script");
        scriptElement.src = path;
        scriptElement.async = true;
        // 循环调用时 Chrome 不会重复请求 js
        document.head.appendChild(scriptElement);
        scriptElement.onload = () => {
            if (document.getElementById(id)) {
                // 循环调用需清除 DOM 中的 script 标签
                scriptElement.remove();
                resolve(false);
                return false;
            }
            scriptElement.id = id;
            resolve(true);
        };
    });
};


// https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/util/addStyle.ts
export const addStyle = (url: string, id: string) => {
    if (!document.getElementById(id)) {
        const styleElement = document.createElement("link");
        styleElement.id = id;
        styleElement.rel = "stylesheet";
        styleElement.type = "text/css";
        styleElement.href = url;
        const pluginsStyle = document.querySelector("#pluginsStyle");
        if (pluginsStyle) {
            pluginsStyle.before(styleElement);
        } else {
            document.getElementsByTagName("head")[0].appendChild(styleElement);
        }
    }
};

/**
 * Converts GPT-style math formulas to Markdown format
 * - Converts inline formulas from \(...\) to $...$
 * - Converts block formulas from \[...\] to $$...$$
 */
export function convertMathFormulas(text: string): string {
    // Handle multiline text by processing it in steps

    // Step 1: Replace block formulas first to avoid conflicts
    // Look for \[...\] patterns and replace with $$...$$
    let result = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
        // Add newlines before and after block formulas for better markdown compatibility
        return `\n$$\n${formula.trim()}\n$$\n`;
    });

    // Step 2: Replace inline formulas
    // Look for \(...\) patterns and replace with $...$
    result = result.replace(/\\\((.*?)\\\)/g, (match, formula) => {
        return `$${formula.trim()}$`;
    });

    return result;
}


export async function id2block(...ids: BlockId[]): Promise<Block[]> {
    let idList = ids.map((id) => `'${id}'`);
    let sqlCode = `select * from blocks where id in (${idList.join(",")})`;
    let data = await sql(sqlCode);
    return data;
}
