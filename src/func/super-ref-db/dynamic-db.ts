/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-20
 * @FilePath     : /src/func/super-ref-db/dynamic-db.ts
 * @Description  : Dynamic database functionality for super-ref-db
 */

import { html2ele, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { getBlockAttrs, setBlockAttrs, getBlockByID } from "@frostime/siyuan-plugin-kits/api";
import { sql, request } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";

import { inputDialogForProvider } from "../gpt/context-provider/InputForProvder";
import { configs, syncDatabaseFromSearchResults } from "./core";


// Define block ID type
type BlockId = string;

// Custom attribute name for dynamic database
export const DYNAMIC_DB_ATTR = 'custom-dynamic-database';

/**
 * Set a dynamic database by saving a query to the block attributes
 * 
 * @param blockId - ID of the database block
 * @param query - SQL query to be executed when updating the dynamic database
 * @returns - Promise resolving to boolean indicating success
 */
const setDynamicDatabase = async (blockId: BlockId, query: string): Promise<boolean> => {
    try {
        await setBlockAttrs(blockId, {
            [DYNAMIC_DB_ATTR]: query,
        });
        return true;
    } catch (error) {
        console.error('设置动态数据库属性失败:', error);
        return false;
    }
};

/**
 * Parse SQL input to handle escaping
 * 
 * @param sqlCode - SQL code to parse
 * @returns - Parsed SQL code
 */
const parseSQLInput = (sqlCode: string): string => {
    // Replace special characters in SQL statements
    return sqlCode.replace(/\\(\*|\[|\]|\S)/g, '\\\\$1');
};

/**
 * Validate SQL input to ensure it's a SELECT statement
 * 
 * @param sqlCode - SQL code to validate
 * @returns - Boolean indicating if valid
 */
const validateInput = (sqlCode: string): boolean => {
    // Check if it follows SQL SELECT syntax
    const pat = /select\s+([\s\S]+?)\s+from\s+([\s\S]+?)\s*$/i;
    return pat.test(sqlCode);
};


const renderVars = (code: string, vars: Record<string, string>): string => {
    for (const [key, value] of Object.entries(vars)) {
        if (value === undefined || value === null) {
            console.warn(`Variable ${key} is undefined or null, skipping replacement.`);
            continue;
        }
        // Replace {{key}} with value
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        code = code.replace(regex, value);
    }
    return code;
}
/**
 * Execute a query that can be either SQL or JavaScript
 * 
 * @param query - Query to execute (SQL or JavaScript prefixed with //!js)
 * @returns - Array of blocks from query results
 */
const executeQuery = async (query: string): Promise<Block[]> => {
    let codeType = 'sql';
    let code = query.trim();

    // Check if it's a JavaScript query
    if (code.startsWith('//!js')) {
        codeType = 'js';
    } else if (!validateInput(code)) {
        throw new Error("Invalid SQL query: Must be a SELECT statement");
    }

    try {
        if (codeType === 'sql') {
            const parsedQuery = parseSQLInput(code);
            return await sql(parsedQuery);
        } else {
            // Execute JavaScript code
            code = `
            async function main(){
                ${code}
            }
            return main();
            `;
            const func = new Function('request', 'sql', code);
            return await func(request, sql);
        }
    } catch (error) {
        console.error(`${codeType.toUpperCase()} execution error:`, error);
        throw error;
    }
};

/**
 * Show dialog to set SQL query for a dynamic database
 * 
 * @param blockId - ID of the database block
 * @returns - Promise resolving to boolean indicating success
 */
export const showDynamicDatabaseDialog = async (blockId: BlockId) => {
    const attrs = await getBlockAttrs(blockId);
    let query = attrs[DYNAMIC_DB_ATTR] || '';
    // await showDynamicDatabaseDialog(block.id);
    inputDialogForProvider({
        type: 'area',
        title: '设置动态数据库',
        description: `
        <p>请输入查询语句，用于动态更新数据库内容。支持嵌入块查询代码:</p>
    <p><strong>SQL 查询：</strong></p>
    <pre style="background: var(--b3-code-background); padding: 8px; border-radius: 4px; font-family: monospace;">SELECT * FROM blocks WHERE content LIKE '%关键词%'</pre>
    <p><strong>JavaScript 查询：</strong> (以 //!js 开头, 返回块 ID)</p>
    <pre style="background: var(--b3-code-background); padding: 8px; border-radius: 4px; font-family: monospace;">//!js
const blocks = await sql("SELECT * FROM blocks WHERE content LIKE '%关键词%'");
return blocks.map(b => b.id);
</pre>
${configs.useVarInDynamicDb === true ? `
<p>当前开启了变量插值, 可以使用 {{CurDocId}} 来指代当前文档的 ID</p>
` : ''}
        `,
        initialText: query,
        confirm: (text) => {
            const query = text.trim();
            if (!query) {
                showMessage('查询语句不能为空', 3000, 'error');
                return;
            }
            if (!query.startsWith('//!js') && !validateInput(query)) {
                showMessage('无效的SQL查询语句', 3000, 'error');
                return;
            }
            setDynamicDatabase(blockId, query);
        }
    })
};

/**
 * Update a dynamic database using its SQL query
 * 
 * @param blockId - ID of the database block
 * @param avId - ID of the attribute view
 * @returns - Promise resolving to boolean indicating success
 */
export const updateDynamicDatabase = async (blockId: BlockId, avId: BlockId): Promise<boolean> => {
    try {
        // Check if this is a dynamic database
        const attrs = await getBlockAttrs(blockId);
        if (!attrs || !attrs[DYNAMIC_DB_ATTR]) {
            showMessage('不是动态数据库', 3000, 'error');
            return false;
        }

        let query = attrs[DYNAMIC_DB_ATTR];

        if (configs.useVarInDynamicDb === true) {
            const avBlock = await getBlockByID(blockId);
            query = renderVars(query, {
                CurDocId: avBlock.root_id
            });
        }

        // Execute the query
        const blocks = await executeQuery(query);
        if (!blocks || blocks.length === 0) {
            showMessage('查询没有返回结果', 3000, 'info');
            return true;
        }

        // Create a redirect map (no redirections in this case)
        const redirectMap = {};

        // Sync database with search results
        await syncDatabaseFromSearchResults({
            database: { block: blockId, av: avId },
            newBlocks: blocks,
            redirectMap,
            removeOrphanRows: configs.orphanOfDynamicDb,
            askRemovePrompt: '动态数据库'
        });

        showMessage(`更新成功: 找到 ${blocks.length} 个块`, 3000, 'info');
        return true;
    } catch (error) {
        console.error('更新动态数据库时出错:', error);

        const html = `
        <div style="padding: 8px; max-width: 500px;">
            <div style="font-weight: bold; margin-bottom: 8px;">查询错误</div>
            <div style="margin-bottom: 8px; color: var(--b3-theme-error);">${error.message || '未知错误'}</div>
        </div>
        `;
        const errorElement = html2ele(html);

        simpleDialog({
            title: '查询错误',
            ele: errorElement,
            width: '500px'
        });

        return false;
    }
};


/**
 * Add rows to database from a temporary query
 * 
 * @param avBlockId - ID of the attribute view block
 * @returns - Promise resolving to boolean indicating success
 */
export const addRowsToDatabaseFromQuery = async (input: {
    blockId: BlockId,
    avId: BlockId
}) => {
    try {
        // Get the parent block ID of the attribute view
        const avBlock = await getBlockByID(input.blockId);
        if (!avBlock) {
            showMessage('无法找到数据库块', 3000, 'error');
            return false;
        }

        // Show dialog to get query from user
        inputDialogForProvider({
            type: 'area',
            title: '从查询结果添加条目',
            description: `
            <p>请输入临时查询语句，用于添加数据库条目。支持嵌入块查询代码:</p>
            <p><strong>SQL 查询：</strong></p>
            <pre style="background: var(--b3-code-background); padding: 8px; border-radius: 4px; font-family: monospace;">SELECT * FROM blocks WHERE content LIKE '%关键词%'</pre>
            <p><strong>JavaScript 查询：</strong> (以 //!js 开头, 返回块 ID)</p>
            <pre style="background: var(--b3-code-background); padding: 8px; border-radius: 4px; font-family: monospace;">//!js
const blocks = await sql("SELECT * FROM blocks WHERE content LIKE '%关键词%'");
return blocks.map(b => b.id);
</pre>
            <b>注: 同动态数据库不同，本操作是一次性的，查询代码不会绑定到数据库中。</b>
${configs.useVarInDynamicDb === true ? `
<p>当前开启了变量插值, 可以使用 {{CurDocId}} 来指代当前文档的 ID</p>
` : ''}
            `,
            initialText: '',
            confirm: async (query) => {
                if (!query.trim()) {
                    showMessage('查询语句不能为空', 3000, 'error');
                    return;
                }

                if (!query.startsWith('//!js') && !validateInput(query)) {
                    showMessage('无效的SQL查询语句', 3000, 'error');
                    return;
                }

                if (configs.useVarInDynamicDb === true) {
                    query = renderVars(query, {
                        CurDocId: avBlock.root_id
                    });
                }

                try {
                    // Execute the query
                    const blocks = await executeQuery(query);
                    if (!blocks || blocks.length === 0) {
                        showMessage('查询没有返回结果', 3000, 'info');
                        return;
                    }

                    // Create a redirect map (no redirections in this case)
                    const redirectMap = {};

                    // Sync database with search results
                    await syncDatabaseFromSearchResults({
                        database: { block: input.blockId, av: input.avId },
                        newBlocks: blocks,
                        redirectMap,
                        removeOrphanRows: 'no' // Don't remove existing rows
                    });

                    showMessage(`添加成功: 添加了 ${blocks.length} 个块`, 3000, 'info');
                } catch (error) {
                    console.error('执行查询时出错:', error);

                    const html = `
                    <div style="padding: 8px; max-width: 500px;">
                        <div style="font-weight: bold; margin-bottom: 8px;">查询错误</div>
                        <div style="margin-bottom: 8px; color: var(--b3-theme-error);">${error.message || '未知错误'}</div>
                    </div>
                    `;
                    const errorElement = html2ele(html);

                    simpleDialog({
                        title: '查询错误',
                        ele: errorElement,
                        width: '500px'
                    });
                }
            }
        });

        return true;
    } catch (error) {
        console.error('从查询结果添加条目时出错:', error);
        showMessage('操作失败', 3000, 'error');
        return false;
    }
}
