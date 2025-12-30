import { createStoreRef, IStoreRef } from '@frostime/solid-signal-ref';
import {
    Tool,
    ToolPermissionLevel,
    ToolExecuteStatus,
    ToolExecuteResult,
    UserApprovalCallback,
    ResultApprovalCallback,
    ToolGroup
} from './types';
import { toolsManager } from '../model/store';
import { cacheToolCallResult, DEFAULT_LIMIT_CHAR, truncateContent } from './utils';

/**
 * 工具注册表
 */
// type ToolRegistry = Record<string, Tool>;

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

    // public groupEnabled: Record<string, boolean> = {};
    // private toolEnabled: Record<string, boolean> = {};

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
        if (!group || !group.rulePrompt) return '';

        const enabledToolNames = this.getEnabledToolNamesInGroup(groupName);

        // 如果没有启用的工具，不返回规则
        if (enabledToolNames.length === 0) return '';

        let ruleContent: string;
        if (typeof group.rulePrompt === 'function') {
            ruleContent = group.rulePrompt(enabledToolNames);
        } else {
            ruleContent = group.rulePrompt;
        }

        if (!ruleContent?.trim()) return '';

        return `
<tool-group-rule group="${groupName}">
Group "${groupName}" contains following tools: ${enabledToolNames.join(', ')}.

${ruleContent.trim()}
</tool-group-rule>
`;
    }

    toolRules() {
        if (!this.hasEnabledTools()) return '';
        let prompt = `<tool-rules>
在当前对话中，如果发现有必要，请使用提供的工具(tools)。以下是使用工具的指导原则：

**工作规范**
- 在调用工具前，请在内部充分规划；当任务复杂或用户明确要求时，再在输出中简要说明你的计划（3–5 行）。
- 在工具调用后，如有必要，可对关键结果做简要反思，但不要输出冗长的思考过程。
- 每个 TOOL 都有一个隐藏可选参数 \`limit\`，来截断限制返回给 LLM 的输出长度。设置为 -1 或 0 表示不限制。

**进入 Tool Call 流程后**
- 当你认为已经足够回答用户问题时，可以提前结束工具链；如果仍有疑问，再与用户交互确认是否需要继续深入
- Tool Call 结束之后, 可能会把完整结果写入本地日志文件；如果你被允许访问文件系统可以尝试读取以获得更多信息。

**用户审核**
- 部分工具在调用的时候会给用户审核，用户可能拒绝调用。
- 如果用户在拒绝的时候提供了原因，请**一定要仔细参考用户给出的原因并适当调整你的方案**

**工具结果呈现**
- 如果USER希望手动调用工具并查看结果（例如网络搜索等），请将工具结果**完整**呈现给USER，不要仅提供总结或选择性提供而导致信息丢失。

**工具调用记录**
- 为了节省资源，工具调用的中间过程消息不会显示给USER，务必确保你最后给出一个完善的回答。
- SYSTEM 会生成工具调用记录 <toolcall-history-log>...</toolcall-history-log> 并插入到消息里，这部分内容不会显示给 USER 看，也不由 ASSISTANT 生成。
- ASSISTANT(你) **不得自行提及或生成** <toolcall-history-log> 标签; 否则可能严重误导后续工具调用 !!IMPORTANT!!
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
        group.tools.forEach(tool => this.registerTool(tool));
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
        return Object.entries(this.enablingStore()['group'])
            .filter(([_groupName, enabled]) => enabled)
            .flatMap(([groupName]) =>
                this.groupRegistry[groupName].tools
                    .filter(tool => this.isToolEnabled(tool.definition.function.name))
                    .map(tool => tool.definition)
            );
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
     */
    private getEffectivePermissionConfig(toolName: string): {
        permissionLevel: ToolPermissionLevel;
        requireExecutionApproval: boolean;
        requireResultApproval: boolean;
    } | null {
        const tool = this.registry[toolName];
        if (!tool) return null;

        const override = toolsManager().toolPermissionOverrides[toolName];

        // 转换字符串形式的权限级别到枚举
        let effectivePermissionLevel = tool.permission.permissionLevel ?? ToolPermissionLevel.PUBLIC;
        if (override?.permissionLevel) {
            switch (override.permissionLevel) {
                case 'public':
                    effectivePermissionLevel = ToolPermissionLevel.PUBLIC;
                    break;
                case 'moderate':
                    effectivePermissionLevel = ToolPermissionLevel.MODERATE;
                    break;
                case 'sensitive':
                    effectivePermissionLevel = ToolPermissionLevel.SENSITIVE;
                    break;
            }
        }

        return {
            permissionLevel: effectivePermissionLevel,
            requireExecutionApproval: override?.requireExecutionApproval ?? tool.permission.requireExecutionApproval ?? true,
            requireResultApproval: override?.requireResultApproval ?? tool.permission.requireResultApproval ?? false
        };
    }

    /**
     * 生成工具调用的唯一键
     * @param toolName 工具名称
     * @param args 参数
     * @returns 唯一键
     */
    private generateApprovalKey(toolName: string, args: Record<string, any>): string {
        return `${toolName}:${JSON.stringify(args)}`;
    }

    /**
     * 检查工具执行权限
     */
    private async checkExecutionApproval(
        toolName: string,
        args: Record<string, any>
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

        const { permissionLevel, requireExecutionApproval } = config;

        // 公开工具，无需审核
        if (permissionLevel === ToolPermissionLevel.PUBLIC || requireExecutionApproval === false) {
            return { approved: true };
        }

        const approvalKey = this.generateApprovalKey(toolName, args);

        // 中等敏感度工具，检查记录
        if (
            permissionLevel === ToolPermissionLevel.MODERATE &&
            this.approvalRecords[approvalKey] !== undefined
        ) {
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
        if (permissionLevel === ToolPermissionLevel.MODERATE) {
            this.approvalRecords[approvalKey] = result;
        }

        return {
            approved: result.approved,
            rejectReason: result.approved ? undefined : (result.rejectReason || 'Execution rejected by user')
        };
    }

    /**
     * 检查工具结果权限
     */
    private async checkResultApproval(
        toolName: string,
        args: Record<string, any>,
        result: ToolExecuteResult
    ): Promise<{
        approved: boolean;
        rejectReason?: string;
    }> {
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

        // 执行前审批检查
        const shouldCheckExecution = !options?.skipExecutionApproval &&
            config.requireExecutionApproval !== false;

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
        let originalLength = formatted.length;
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
            // isTruncated = truncResult.isTruncated;
            isTruncated = finalForLLM.length < originalLength;
        }

        result.formattedText = formatted;
        result.isTruncated = isTruncated;
        result.finalText = finalForLLM;

        // 3. 缓存原始数据到本地文件
        let cacheFile = null;
        if (tool.SKIP_CACHE_RESULT !== true) {
            cacheFile = cacheToolCallResult(toolName, args, result);
            result.cacheFile = cacheFile;
        }

        const sysHintHeader = [];
        if (isTruncated) {
            sysHintHeader.push(`[system log] 原始完整结果内容过长 (${originalLength} 字符)，已截断为 ${finalForLLM.length} 字符`);
        }
        if (result.cacheFile && isTruncated) {
            sysHintHeader.push(`[system log] 原始完整结果已缓存至文件: ${cacheFile}, 如有需求可尝试访问获取所有结果`);
        }
        if (sysHintHeader.length > 0) {
            result.finalText = sysHintHeader.join('\n') + '\n=====\n' + result.finalText;
        }


        // const formattedData = formatToolOutputForLLM({
        //     tool: {
        //         formatForLLM: tool.formatForLLM,
        //         truncateForLLM: tool.truncateForLLM
        //     },
        //     toolName,
        //     rawData: result.data,
        //     args,
        //     cacheFile
        // });

        // 结果审批检查
        const shouldCheckResult =
            !options?.skipResultApproval &&
            config.requireResultApproval === true;

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

