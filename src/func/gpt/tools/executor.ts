import { createStoreRef, IStoreRef } from '@frostime/solid-signal-ref';
import {
    Tool,
    ToolExecuteStatus,
    ToolExecuteResult,
    UserApprovalCallback,
    ResultApprovalCallback,
    ToolGroup,
    ExecutionPolicy,
    ResultApprovalPolicy
} from './types';
import { toolsManager } from '../model/config';
import { DEFAULT_LIMIT_CHAR, truncateContent } from './utils';
import { createReadRuleTool, formatRuleName } from './read-rule';

/**
 * 用户审核记录
 */
interface ApprovalRecord {
    [toolName: string]: Awaited<ReturnType<UserApprovalCallback>>;
}

/**
 * 工具执行器
 */
export class ToolExecutor {

    private registry: Record<string, Tool> = {};
    private executionApprovalCallback: UserApprovalCallback | null = null;
    private resultApprovalCallback: ResultApprovalCallback | null = null;
    private approvalRecords: ApprovalRecord = {};
    public groupRegistry: Record<string, ToolGroup> = {};

    constructor() {
        this.registerTool(createReadRuleTool(() => Object.values(this.groupRegistry)));
    }

    public enablingStore: IStoreRef<{
        group: Record<string, boolean>;
        tool: Record<string, boolean>;
    }> = createStoreRef({
        group: {},
        tool: {}
    });

    /**
     * 获取工具组中已启用的工具名列表
     */
    getEnabledToolNamesInGroup(groupName: string): string[] {
        const group = this.groupRegistry[groupName];
        if (!group) return [];
        return group.tools
            .filter(tool => this.isToolEnabled(tool.definition.function.name))
            .map(tool => tool.definition.function.name);
    }

    /**
     * 解析工具组的 rulePrompt（支持静态字符串和动态函数）
     */
    private resolveGroupRulePrompt(groupName: string): string {
        const group = this.groupRegistry[groupName];
        if (!group) return '';

        const enabledToolNames = this.getEnabledToolNamesInGroup(groupName);

        // 如果没有启用的工具，不返回规则
        if (enabledToolNames.length === 0) return '';

        const ruleContent = typeof group.rulePrompt === 'function'
            ? group.rulePrompt(enabledToolNames)
            : group.rulePrompt;
        const ruleIndex = group.declareSkillRules
            ? this.generateSkillRuleIndex(groupName, group.declareSkillRules)
            : '';
        const finalContent = [ruleContent, ruleIndex].filter(content => content?.trim()).join('\n\n');
        if (!finalContent) return '';

        return `
<tool-group-rule group="${groupName}">

Group "${groupName}" contains following tools: ${enabledToolNames.join(', ')}.

${finalContent}

</tool-group-rule>
`;
    }

    toolRules() {
        if (!this.hasEnabledTools()) return '';
        //保留开头的换行
        let prompt = `
<tool-rules>

- 工具执行或结果发送可能需要用户批准。用户拒绝时，参考其原因调整方案。
- 普通工具输出可通过 \`limit\` 限制字符数；0 或负数表示不限。输出截断后，使用工具的分页/范围参数重新读取来源，没有额外的结果变量缓存。
- 各工具组列出专用规则文档。涉及其领域约定或自定义语法时，先用 \`read-rule({"name": "<规则完整名称>"})\` 阅读对应文档。

</tool-rules>`;

        // 动态解析每个启用的工具组的 rulePrompt
        for (const groupName of Object.keys(this.groupRegistry)) {
            if (!this.isGroupEnabled(groupName)) continue;
            const rule = this.resolveGroupRulePrompt(groupName);
            if (rule) {
                prompt += `\n\n${rule}`;
            }
        }

        return prompt;
    }

    hasEnabledTools() {
        // return Object.values(this.groupEnabled).some(enabled => enabled);
        return Object.values(this.enablingStore()['group']).some(enabled => enabled);
    }

    isGroupEnabled(groupName: string) {
        // return this.groupEnabled[groupName] ?? false;
        return this.enablingStore()['group'][groupName] ?? false;
    }

    toggleGroupEnabled(groupName: string, enabled?: boolean) {
        if (enabled === undefined) {
            // enabled = !this.groupEnabled[groupName];
            enabled = !this.isGroupEnabled(groupName);
        }
        // this.groupEnabled[groupName] = enabled;
        this.enablingStore.update('group', groupName, enabled);
    }


    // ==================== Callback ====================

    /**
     * 设置执行审批回调函数
     */
    setExecutionApprovalCallback(callback: UserApprovalCallback): void {
        this.executionApprovalCallback = callback;
    }

    /**
     * 设置结果审批回调函数
     */
    setResultApprovalCallback(callback: ResultApprovalCallback): void {
        this.resultApprovalCallback = callback;
    }

    /**
     * 检查是否有执行审批回调
     * @returns 是否有执行审批回调
     */
    hasExecutionApprovalCallback(): boolean {
        return !!this.executionApprovalCallback;
    }

    /**
     * 检查是否有结果审批回调
     * @returns 是否有结果审批回调
     */
    hasResultApprovalCallback(): boolean {
        return !!this.resultApprovalCallback;
    }

    // ==================== Register ====================

    /**
     * 注册单个工具
     */
    registerTool(tool: Tool): void {
        const toolName = tool.definition.function.name;

        if (this.registry[toolName]) {
            console.warn(`Tool ${toolName} already registered, overwriting...`);
        }

        this.registry[toolName] = tool;
        // 工具组内的工具默认启用
        // this.toolEnabled[toolName] = true;
        this.enablingStore.update('tool', toolName, true);
    }

    registerToolGroup(group: ToolGroup | (() => ToolGroup)): void {
        if (typeof group === 'function') {
            group = group();
        }
        if (group.tools.length === 0) return;

        group.tools.forEach(tool => {
            this.registerTool(tool);
            this.setToolEnabled(tool.definition.function.name, group.defaultToolEnabled ?? true);
        });
        this.groupRegistry[group.name] = group;
        // rulePrompt 现在在 toolRules() 中动态解析，不再在此处静态存储
        //工具组默认禁用
        this.enablingStore.update('group', group.name, false);

    }

    /**
     * 设置工具级别的启用状态
     */
    setToolEnabled(toolName: string, enabled: boolean): void {
        this.enablingStore.update('tool', toolName, enabled);
    }

    private generateSkillRuleIndex(
        groupName: string,
        rules: NonNullable<ToolGroup['declareSkillRules']>
    ): string {
        const lines: string[] = [];
        const alwaysLoadRules: Array<[string, NonNullable<ToolGroup['declareSkillRules']>[string]]> = [];
        const onDemandRules: Array<[string, NonNullable<ToolGroup['declareSkillRules']>[string]]> = [];

        // 分类规则
        for (const [ruleName, rule] of Object.entries(rules)) {
            if (rule.alwaysLoad) {
                alwaysLoadRules.push([ruleName, rule]);
            } else {
                onDemandRules.push([ruleName, rule]);
            }
        }

        // 渲染总是加载的规则
        if (alwaysLoadRules.length > 0) {
            lines.push('**Pinned Rules:**');
            for (const [_ruleName, rule] of alwaysLoadRules) {
                lines.push(`\n**${rule.desc}:**`);
                lines.push(rule.prompt);
            }
        }

        // 渲染按需加载的规则（表格格式）
        if (onDemandRules.length > 0) {
            if (alwaysLoadRules.length > 0) {
                lines.push('');  // 添加空行分隔
            }
            lines.push('**On-Demand Rules:**');
            lines.push('| Rule | Description | When to Use |');
            lines.push('|-----|-------------|-------------|');
            for (const [ruleName, rule] of onDemandRules) {
                const name = formatRuleName(groupName, ruleName);
                const when = rule.when || 'As needed';
                lines.push(`| \`${name}\` | ${rule.desc} | ${when} |`);
            }
            lines.push('');
            lines.push('*Read with: read-rule({"name": "<Rule>"})*');
        }

        return lines.join('\n');
    }

    /**
     * 获取工具级别的启用状态
     */
    isToolEnabled(toolName: string): boolean {
        return this.enablingStore()['tool'][toolName] ?? false;
    }

    /**
     * 获取启用的工具定义
     */
    getEnabledToolDefinitions(): IToolDefinition[] {
        const allTools = Object.entries(this.enablingStore()['group'])
            .filter(([_groupName, enabled]) => enabled)
            .flatMap(([groupName]) =>
                this.groupRegistry[groupName].tools
                    .filter(tool => this.isToolEnabled(tool.definition.function.name))
                    .map(tool => tool.definition)
            );
        const needsRuleReader = Object.values(this.groupRegistry).some(group =>
            this.isGroupEnabled(group.name)
            && this.getEnabledToolNamesInGroup(group.name).length > 0
            && Object.values(group.declareSkillRules ?? {}).some(rule => !rule.alwaysLoad)
        );
        if (needsRuleReader && !allTools.some(tool => tool.function.name === 'read-rule')) {
            allTools.push(this.registry['read-rule'].definition);
        }
        return allTools;
    }

    getGroupToolDefinitions(groupName: string, shouldBeEnabled = true): IToolDefinition[] {
        let tools = this.groupRegistry[groupName].tools.map(tool => tool.definition);
        if (shouldBeEnabled) {
            tools = tools.filter(tool => this.isToolEnabled(tool.function.name));
        }
        return tools;
    }

    /**
     * 获取工具
     */
    getTool(name: string): Tool | undefined {
        return this.registry[name];
    }

    // ==================== Approval ====================

    /**
     * 获取工具的有效权限配置（合并用户覆盖和工具默认值）
     * 优先使用新格式（executionPolicy + resultApprovalPolicy），向后兼容旧格式
     */
    private getEffectivePermissionConfig(toolName: string): {
        executionPolicy: ExecutionPolicy;
        resultApprovalPolicy: ResultApprovalPolicy;
    } | null {
        const tool = this.registry[toolName];
        if (!tool) return null;

        const override = toolsManager().toolPermissionOverrides[toolName];
        const permission = tool.permission;

        // 优先使用新格式（V2）
        let executionPolicy: ExecutionPolicy;
        let resultApprovalPolicy: ResultApprovalPolicy;

        // 1. 尝试从 override 的新格式字段获取
        if (override?.executionPolicy) {
            executionPolicy = override.executionPolicy;
        }
        // 2. 尝试从 tool permission 的新格式字段获取
        else if ('executionPolicy' in permission && permission.executionPolicy) {
            executionPolicy = permission.executionPolicy;
        }
        // 3. 从 override 的旧格式字段转换
        else if (override && ('permissionLevel' in override || 'requireExecutionApproval' in override)) {
            //@ts-ignore - 旧格式兼容
            if (override.requireExecutionApproval === false) {
                executionPolicy = 'auto';
            } else {
                //@ts-ignore - 旧格式兼容
                const level = override.permissionLevel || 'public';
                switch (level) {
                    case 'public':
                        executionPolicy = 'auto';
                        break;
                    case 'moderate':
                        executionPolicy = 'ask-once';
                        break;
                    case 'sensitive':
                        executionPolicy = 'ask-always';
                        break;
                    default:
                        executionPolicy = 'auto';
                }
            }
        }
        // 4. 从 tool permission 的旧格式字段转换
        else {
            const oldPerm = permission as any;  // Type assertion for backward compatibility
            if (oldPerm.requireExecutionApproval === false) {
                executionPolicy = 'auto';
            } else {
                const level = oldPerm.permissionLevel || 'public';
                switch (level) {
                    case 'public':
                        executionPolicy = 'auto';
                        break;
                    case 'moderate':
                        executionPolicy = 'ask-once';
                        break;
                    case 'sensitive':
                        executionPolicy = 'ask-always';
                        break;
                    default:
                        executionPolicy = 'auto';
                }
            }
        }

        // 结果审批策略
        if (override?.resultApprovalPolicy) {
            resultApprovalPolicy = override.resultApprovalPolicy;
        } else if ('resultApprovalPolicy' in permission && permission.resultApprovalPolicy) {
            resultApprovalPolicy = permission.resultApprovalPolicy;
        } else {
            // 从旧格式转换
            const oldPerm = permission as any;
            //@ts-ignore - 旧格式兼容
            const requireResultApproval = override?.requireResultApproval ?? oldPerm.requireResultApproval ?? false;
            resultApprovalPolicy = requireResultApproval ? 'always' : 'never';
        }

        return {
            executionPolicy,
            resultApprovalPolicy
        };
    }

    /**
     * 生成工具调用的唯一键（用于 approvalRecords）
     * 使用 hash 缩短长参数，避免 key 过长
     * @param toolName 工具名称
     * @param args 参数
     * @returns 唯一键
     */
    private generateApprovalKey(toolName: string, args: Record<string, any>): string {
        const argsJson = JSON.stringify(args);

        // 如果参数较短，直接使用
        if (argsJson.length <= 100) {
            return `${toolName}:${argsJson}`;
        }

        // 参数较长，使用简单 hash 缩短
        // 使用 hash 确保相同参数生成相同 key，不同参数生成不同 key
        const simpleHash = (str: string): string => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return Math.abs(hash).toString(36);
        };

        return `${toolName}:${simpleHash(argsJson)}`;
    }

    /**
     * 检查工具执行权限（基于新的 executionPolicy）
     */
    private async checkExecutionApproval(
        toolName: string,
        args: Record<string, any>
    ): Promise<{
        approved: boolean;
        rejectReason?: string;
    }> {
        const config = this.getEffectivePermissionConfig(toolName);

        //#if [IS_DEV]
        console.log(`[DEBUG] checkExecutionApproval - Tool: ${toolName}`);
        console.log(`[DEBUG] executionPolicy:`, config?.executionPolicy);
        console.log(`[DEBUG] override:`, toolsManager().toolPermissionOverrides[toolName]);
        console.log(`[DEBUG] tool.permission:`, this.registry[toolName]?.permission);
        //#endif

        if (!config) {
            return {
                approved: false,
                rejectReason: `Tool ${toolName} not found`
            };
        }

        const { executionPolicy } = config;

        // 使用清晰的 switch 语句替代双重否定逻辑
        switch (executionPolicy) {
            case 'auto':
                // 自动批准，无需询问
                return { approved: true };

            case 'ask-once': {
                // 首次询问，记住选择（基于工具+参数hash）
                const approvalKey = this.generateApprovalKey(toolName, args);

                // 检查是否已有记录
                if (this.approvalRecords[approvalKey] !== undefined) {
                    return this.approvalRecords[approvalKey];
                }

                // 需要用户审核
                if (!this.executionApprovalCallback) {
                    return {
                        approved: false,
                        rejectReason: 'No execution approval callback set'
                    };
                }

                const tool = this.registry[toolName];
                const result = await this.executionApprovalCallback(
                    toolName,
                    tool.definition.function.description || '',
                    args
                );

                // 记住用户选择
                this.approvalRecords[approvalKey] = result;

                return {
                    approved: result.approved,
                    rejectReason: result.approved ? undefined : (result.rejectReason || 'Execution rejected by user')
                };
            }

            case 'ask-always': {
                // 每次都询问
                if (!this.executionApprovalCallback) {
                    return {
                        approved: false,
                        rejectReason: 'No execution approval callback set'
                    };
                }

                const tool = this.registry[toolName];
                const result = await this.executionApprovalCallback(
                    toolName,
                    tool.definition.function.description || '',
                    args
                );

                return {
                    approved: result.approved,
                    rejectReason: result.approved ? undefined : (result.rejectReason || 'Execution rejected by user')
                };
            }

            default:
                // 默认自动批准
                return { approved: true };
        }
    }

    /**
     * 检查工具结果权限（基于新的 resultApprovalPolicy）
     * 支持三种模式：'never' | 'on-error' | 'always'
     */
    private async checkResultApproval(
        toolName: string,
        args: Record<string, any>,
        result: ToolExecuteResult
    ): Promise<{
        approved: boolean;
        rejectReason?: string;
    }> {
        const config = this.getEffectivePermissionConfig(toolName);

        if (!config) {
            return {
                approved: false,
                rejectReason: `Tool ${toolName} not found`
            };
        }

        const { resultApprovalPolicy } = config;

        switch (resultApprovalPolicy) {
            case 'never':
                // 不审批结果
                return { approved: true };

            case 'on-error':
                // 仅在工具执行错误时审批
                if (result.status === ToolExecuteStatus.SUCCESS) {
                    return { approved: true };
                }
                // 执行出错，需要审批
                break;

            case 'always':
                // 总是审批结果
                break;

            default:
                // 默认不审批
                return { approved: true };
        }

        // 需要审批
        if (!this.resultApprovalCallback) {
            return {
                approved: false,
                rejectReason: 'No result approval callback set'
            };
        }

        return await this.resultApprovalCallback(
            toolName,
            args,
            result
        );
    }


    // ==================== Execute ====================
    /**
     * 执行工具
     * 集成执行前审批检查和结果审批检查
     */
    async execute(
        toolName: string,
        args: Record<string, any>,
        options?: {
            skipExecutionApproval?: boolean;  // 跳过执行前审批检查
            skipResultApproval?: boolean;     // 跳过结果审批检查
        }
    ): Promise<ToolExecuteResult> {
        const tool = this.registry[toolName];

        if (!tool) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `Tool ${toolName} not found`
            };
        }

        const config = this.getEffectivePermissionConfig(toolName);
        if (!config) {
            return {
                status: ToolExecuteStatus.NOT_FOUND,
                error: `Tool ${toolName} configuration not found`
            };
        }

        // 执行前审批检查（基于新的 executionPolicy）
        const shouldCheckExecution = !options?.skipExecutionApproval;

        if (shouldCheckExecution) {
            const approval = await this.checkExecutionApproval(toolName, args);
            if (!approval.approved) {
                return {
                    status: ToolExecuteStatus.EXECUTION_REJECTED,
                    error: 'Execution not approved',
                    rejectReason: approval.rejectReason
                };
            }
        }

        // 执行工具
        let result: ToolExecuteResult;
        try {
            result = await tool.execute(args);
        } catch (error) {
            const errorResult: ToolExecuteResult = {
                status: ToolExecuteStatus.ERROR,
                error: `Error executing tool ${toolName}: ${error.message}`,
                finalText: `Error executing tool ${toolName}: ${error.message}`
            };
            return errorResult;
        }

        // 如果工具执行失败，为错误也生成 finalText
        if (result.status !== ToolExecuteStatus.SUCCESS) {
            result.finalText = result.error || 'Tool execution failed';
            return result;
        }

        // === 处理成功结果的数据 ===
        // 1. 格式化：将原始数据转为文本
        // 如果工具执行时已经提供了 formattedText（如 Python 脚本自定义 format），则直接使用
        let formatted: string;
        if (result.formattedText) {
            formatted = result.formattedText;
        } else {
            try {
                if (tool.formatForLLM) {
                    formatted = tool.formatForLLM(result.data, args || {});
                } else if (typeof result.data === 'string') {
                    formatted = result.data;
                } else {
                    formatted = JSON.stringify(result.data, null, 2);
                }
            } catch (error) {
                formatted = `[格式化错误] ${error.message}`;
            }
        }

        //2. 截断处理
        const originalLength = formatted.length;
        let finalForLLM = formatted;
        let isTruncated = false;
        if (tool.SKIP_EXTERNAL_TRUNCATE === true) {
            // 不截断
        }
        else if (tool.truncateForLLM) {
            // 使用工具自己的截断逻辑（可能考虑 args 中的 limit/begin）
            finalForLLM = tool.truncateForLLM(formatted, args);
            isTruncated = finalForLLM.length < originalLength;
        } else {
            let limit = tool.DEFAULT_OUTPUT_LIMIT_CHAR || DEFAULT_LIMIT_CHAR;
            if (args.limit !== undefined) {
                // 0 意味着不截断
                limit = args.limit <= 0 ? Number.POSITIVE_INFINITY : args.limit;
            }
            // 使用默认的头尾截断
            const truncResult = truncateContent(formatted, limit);
            finalForLLM = truncResult.content;
            isTruncated = truncResult.isTruncated;
        }

        result.formattedText = formatted;
        result.isTruncated = isTruncated;
        result.finalText = finalForLLM;

        // 结果审批检查（基于新的 resultApprovalPolicy）
        const shouldCheckResult = !options?.skipResultApproval;

        if (shouldCheckResult) {
            const approval = await this.checkResultApproval(toolName, args, result);
            if (!approval.approved) {
                return {
                    status: ToolExecuteStatus.RESULT_REJECTED,
                    data: result.data,  // 保留原始数据，以便调用者可以访问
                    formattedText: result.formattedText,
                    cacheFile: result.cacheFile,
                    isTruncated: result.isTruncated,
                    error: 'Result not approved for LLM',
                    rejectReason: approval.rejectReason
                };
            }
        }

        // 返回增强后的成功结果
        return result;
    }
}

