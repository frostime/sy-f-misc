import { sql } from "@/api";
import { request } from "@frostime/siyuan-plugin-kits/api";
import { getNotebook } from "@frostime/siyuan-plugin-kits";
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
            data: docs
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
            data: docs
        };
    }
}

/**
 * 关键词搜索工具
 * 基于思源笔记的全文搜索API实现
 */
export const searchKeywordTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'searchKeyword',
            description: '在笔记库中搜索关键词',
            parameters: {
                type: 'object',
                properties: {
                    keyword: {
                        type: 'string',
                        description: '要搜索的关键词'
                    },
                    notebook: {
                        type: 'string',
                        description: '笔记本ID，用于限定搜索范围'
                    },
                    limit: {
                        type: 'number',
                        description: '限制返回结果数量，默认为24'
                    }
                },
                required: ['keyword']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE,
        requireResultApproval: true
    },

    execute: async (args: {
        keyword: string;
        notebook?: string;
        limit?: number;
    }): Promise<ToolExecuteResult> => {
        // 验证关键词
        const keyword = args.keyword?.trim();
        if (!keyword) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '请提供搜索关键词'
            };
        }

        // 构建搜索请求参数
        const payload = {
            query: keyword,
            method: 0, // 精确匹配
            types: {
                // 默认搜索常用块类型
                document: true,
                heading: true,
                paragraph: true,
                blockquote: true,
                codeBlock: false,
                mathBlock: true,
                table: true,
                list: false,
                listItem: false,
                databaseBlock: true,
                htmlBlock: false,
                embedBlock: false,
                audioBlock: false,
                videoBlock: false,
                iframeBlock: false,
                widgetBlock: false,
                superBlock: false
            },
            paths: args.notebook ? [args.notebook] : [], // 如果指定了笔记本，则限定搜索范围
            groupBy: 0,
            orderBy: 0,
            page: 1,
            pageSize: args.limit || 24, // 默认返回20条结果
            reqId: Date.now(),
        };

        // 调用思源笔记的搜索API
        const data = await request('/api/search/fullTextSearchBlock', payload);

        // 处理返回结果
        const blocks = data.blocks as {
            id: string;
            fcontent: string;
            content: string;
            name: string;
            markdown: string;
            hPath: string;
            type: string;
            box: string;
            rootID: string;
            parentID: string;
        }[];

        // 去掉搜索结果中的<mark>标签
        const noMark = (text: string) => text.replace(/<mark>|<\/mark>/g, '');

        // 格式化搜索结果
        const results = blocks.map(block => ({
            id: block.id,
            type: block.type,
            content: noMark(block.content),
            root_id: block.rootID,
            parent_id: block.parentID,
            hpath: block.hPath,
            notebook: {
                id: block.box,
                name: getNotebook(block.box)?.name || '未知笔记本'
            }
        }));

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: results
        };
    }
}
