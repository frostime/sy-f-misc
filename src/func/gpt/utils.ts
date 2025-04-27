/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-22 10:26:12
 * @FilePath     : /src/func/gpt/utils.ts
 * @LastEditTime : 2025-04-27 17:19:09
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

/**
 * 将文本分割为可安全渲染的部分和剩余的纯文本部分
 * 性能优化版本
 *
 * @param text 要分割的文本
 * @returns 包含两部分的对象：可安全渲染的部分和剩余的纯文本部分
 */
export function splitMarkdownForStreaming(text: string): {
    renderablePart: string;
    remainingPart: string;
} {
    if (!text) {
        return { renderablePart: '', remainingPart: '' };
    }

    // 将文本按行分割
    const lines = text.split('\n');
    const lineCount = lines.length;

    // 预分配数组大小以避免动态扩容
    const renderableLines = new Array(lineCount);
    let renderableCount = 0;
    const remainingLines = new Array(lineCount);
    let remainingCount = 0;

    // 用于跟踪代码块和数学公式的状态
    let inCodeBlock = false;
    let inMathBlock = false;
    let codeBlockFence = '';  // 存储代码块的围栏字符（```或~~~）

    // 最后一个空行的索引，用于确定分割点
    let lastEmptyLineIndex = -1;

    // 预编译正则表达式，避免循环中重复编译
    const fenceRegex = /^(`{3,}|~{3,})/;
    const unorderedListRegex = /^[*\-+]\s+/;
    const orderedListRegex = /^\d+\.\s+/;

    // 用于跟踪列表状态
    let inList = false;

    // 检查是否是列表项
    const isListItem = (trimmed: string): boolean => {
        return unorderedListRegex.test(trimmed) || orderedListRegex.test(trimmed);
    };

    // 处理每一行
    for (let i = 0; i < lineCount; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 检查是否为空行
        if (trimmedLine === '') {
            // 如果不在代码块或数学公式块中，记录这个空行索引
            if (!inCodeBlock && !inMathBlock) {
                lastEmptyLineIndex = renderableCount;
                inList = false; // 空行通常结束列表
            }
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 检查代码块开始/结束 - 优化字符串操作
        if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
            // 使用预编译的正则表达式
            const fence = fenceRegex.exec(trimmedLine)?.[0] || '';

            if (!inCodeBlock) {
                // 开始一个新的代码块
                inCodeBlock = true;
                codeBlockFence = fence;
                renderableLines[renderableCount++] = line;
            } else if (trimmedLine.startsWith(codeBlockFence)) {
                // 检查是否是结束标记 - 优化 replace 操作
                const restOfLine = trimmedLine.substring(codeBlockFence.length).trim();
                if (restOfLine === '') {
                    // 结束当前代码块
                    inCodeBlock = false;
                    codeBlockFence = '';
                }
                renderableLines[renderableCount++] = line;
            } else {
                // 代码块内的围栏样式行，但不是结束标记
                renderableLines[renderableCount++] = line;
            }
            continue;
        }

        // 检查数学公式块开始/结束
        if (trimmedLine === '$$') {
            inMathBlock = !inMathBlock;
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 如果在代码块或数学公式块中，继续添加到可渲染部分
        if (inCodeBlock || inMathBlock) {
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 检查是否是列表项
        if (isListItem(trimmedLine)) {
            // 如果是新的列表开始
            if (!inList) {
                inList = true;
            }
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 如果前一行是列表项，检查这一行是否是列表项的延续（缩进）
        if (inList && line.startsWith('    ') && !isListItem(trimmedLine)) {
            renderableLines[renderableCount++] = line;
            continue;
        }

        // 如果之前在列表中，但当前行不是列表项也不是缩进，则列表结束
        if (inList && !isListItem(trimmedLine) && !line.startsWith('    ')) {
            inList = false;
        }

        // 处理普通行
        renderableLines[renderableCount++] = line;
    }

    // 如果代码块或数学公式块未关闭，我们需要将整个未关闭的块移到剩余部分
    if (inCodeBlock || inMathBlock) {
        // 如果有空行，从最后一个空行后分割
        if (lastEmptyLineIndex >= 0) {
            // 将最后一个空行之后的所有内容移到剩余部分
            for (let i = lastEmptyLineIndex + 1; i < renderableCount; i++) {
                remainingLines[remainingCount++] = renderableLines[i];
            }
            // 截断可渲染部分
            renderableCount = lastEmptyLineIndex + 1;
        } else {
            // 如果没有空行，将所有内容移到剩余部分
            for (let i = 0; i < renderableCount; i++) {
                remainingLines[remainingCount++] = renderableLines[i];
            }
            renderableCount = 0;
        }
    }

    // 调整数组大小
    renderableLines.length = renderableCount;
    remainingLines.length = remainingCount;

    // 将行数组合并回字符串
    return {
        renderablePart: renderableLines.join('\n'),
        remainingPart: remainingLines.join('\n')
    };
}

export async function id2block(...ids: BlockId[]): Promise<Block[]> {
    let idList = ids.map((id) => `'${id}'`);
    let sqlCode = `select * from blocks where id in (${idList.join(",")})`;
    let data = await sql(sqlCode);
    return data;
}
