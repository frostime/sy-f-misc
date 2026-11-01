import { Tool, ToolExecuteStatus, ToolGroup } from './types';

export const formatRuleName = (groupName: string, ruleName: string): string =>
    `Rule/${groupName}/${ruleName}`;

/** Rule 文档来自工具组定义，不进入可写变量或会话级缓存。 */
export const createReadRuleTool = (getGroups: () => ToolGroup[]): Tool => ({
    definition: {
        type: 'function',
        function: {
            name: 'read-rule',
            description: '读取工具组索引中列出的规则文档。仅提供只读文档，不读取临时变量或历史工具结果。',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: '规则索引中的完整名称，例如 Rule/siyuan-tools/sql-blocks-table。'
                    }
                },
                required: ['name']
            }
        }
    },
    permission: {
        executionPolicy: 'auto',
        resultApprovalPolicy: 'never'
    },
    // 专用语法需要完整说明；普通工具的输出截断策略不适用于规则文档。
    SKIP_EXTERNAL_TRUNCATE: true,
    execute: async ({ name }) => {
        if (typeof name !== 'string' || !name) {
            return { status: ToolExecuteStatus.ERROR, error: 'Rule name must be a non-empty string.' };
        }

        for (const group of getGroups()) {
            for (const [ruleName, rule] of Object.entries(group.declareSkillRules ?? {})) {
                if (formatRuleName(group.name, ruleName) === name) {
                    return { status: ToolExecuteStatus.SUCCESS, data: rule.prompt };
                }
            }
        }

        return { status: ToolExecuteStatus.NOT_FOUND, error: `Rule not found: ${name}` };
    }
});
