import { sql } from "@/api";
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { blockMapper, documentMapper } from "./utils";

export const searchDocumentTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'searchDocument',
            description: '搜索指定的文档, name/hpath 两个参数至少提供一个, notebook 为可选的过滤条件',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: '按照文档名称过滤搜索文档'
                    },
                    hpath: {
                        type: 'string',
                        description: '按照文档路径 hpath 过滤搜索文档, 优先级高于 name'
                    },
                    notebook: {
                        type: 'string',
                        description: '笔记本ID, 用于过滤文档所在笔记本'
                    }
                }
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { name?: string; hpath?: string; notebook?: string }): Promise<ToolExecuteResult> => {
        let condition = [];
        if (args.hpath) {
            condition.push(`hpath = '${args.hpath}'`);
        } else if (args.name) {
            condition.push(`content = '${args.name}'`);
        } else {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '至少提供 name 或 hpath 参数'
            };
        }
        if (args.notebook) {
            condition.push(`box = '${args.notebook}'`);
        }
        const fmt = `
        select * from blocks where type='d' and
        ${condition.join(' and ')}
        `;
        const result = await sql(fmt);
        let docs = result.map(documentMapper)
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: JSON.stringify(docs)
        };
    }
}

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

export const sqlUsageHelperTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'sqlUsageHelper',
            description: 'SQL 使用帮助',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (): Promise<ToolExecuteResult> => {
        const file = await fetch('/plugins/sy-f-misc/prompt/sql-helper.md')
        const text = await file.text()
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: text
        };
    }
}

export const querySQLTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'querySQL',
            description: '执行 SQL 查询, 只支持 SELECT 语句; 注意不需要_esc_newline_转义',
            parameters: {
                type: 'object',
                properties: {
                    sql: {
                        type: 'string',
                        description: 'SQL 查询语句'
                    }
                },
                required: ['sql']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { sql: string }): Promise<ToolExecuteResult> => {
        if (!validateInput(args.sql)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: 'SQL 语法错误'
            };
        }
        args.sql = args.sql.replace(/_esc_newline_/g, '\n');
        const code = parseSQLInput(args.sql);
        const result = await sql(code);
        let docs = result.map(blockMapper)
        return {
            status: ToolExecuteStatus.SUCCESS,
            data: JSON.stringify(docs)
        };
    }
}
