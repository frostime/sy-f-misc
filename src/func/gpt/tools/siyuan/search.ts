import { sql } from "@/api";
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";
import { documentMapper } from "./utils";

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

// Tools depends on QueryView

export let queryViewTools: Tool[] = [];
if (globalThis.Query && globalThis.Query.DataView) {
    
}
