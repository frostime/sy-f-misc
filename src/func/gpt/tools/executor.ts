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
import { toolsManager } from '../setting/store';


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
    public groupRules: Record<string, string> = {};

    // public groupEnabled: Record<string, boolean> = {};
    // private toolEnabled: Record<string, boolean> = {};

    public enablingStore: IStoreRef<{
        group: Record<string, boolean>;
        tool: Record<string, boolean>;
    }> = createStoreRef({
        group: {},
        tool: {}
    });

    toolRules() {
        if (!this.hasEnabledTools()) return '';
        let prompt = `<tool-rules>
在当前对话中，如果发现有必要，请使用提供的工具(tools)。以下是使用工具的指导原则：

**工作规范**
- 在每次工具调用之前，必须进行详细的规划。
- 在每次工具调用之后，必须对结果进行深入的反思。
- 不要仅仅给出工具调用的请求而不输出中间的思考和规划来——否则这可能严重影响 ASSISTANT 解决问题的能力和深入思考的能力。这一点非常重要！

**进入 Tool Call 流程后**
- 持续进行直到USER的问题完全解决，确保在结束 ASSISTANT 的回合并返回给USER之前，问题已经得到解决。
- 只有在确定问题已解决时，才终止 ASSISTANT 的回合。

**用户审核**
- 部分工具在调用的时候会给用户审核，用户可能拒绝调用。
- 如果用户在拒绝的时候提供了原因，请**一定要仔细参考用户给出的原因并适当调整你的方案**

**工具结果呈现**
- 如果USER希望手动调用工具并查看结果（例如网络搜索等），请将工具结果**完整**呈现给USER，不要仅提供总结或选择性提供而导致信息丢失。

**工具调用记录**
- 为了节省资源，工具调用的中间过程消息不会显示给USER。
- SYSTEM 会生成工具调用记录 <tool-trace>...</tool-trace> 并插入到消息里，这部分内容不会显示给 USER 看，也不由 ASSISTANT 生成。
- ASSISTANT(你) **不得自行提及或生成** <tool-trace> 标签; 否则可能严重误导后续工具调用 !!IMPORTANT!!
</tool-rules>`;
        for (const [name, rule] of Object.entries(this.groupRules)) {
            if (!this.isGroupEnabled(name)) continue;
            prompt += `\n\n${rule}`;
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
        if (group.rulePrompt?.trim()) {
            this.groupRules[group.name] = (`
<tool-group-rule group="${group.name}">
Group "${group.name}" contains following tools: ${group.tools.map(tool => tool.definition.function.name).join(', ')}.

${group.rulePrompt.trim()}
</tool-group-rule>
`);
        }
        //工具组默认禁用
        // this.groupEnabled[group.name] = false;
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
        let effectivePermissionLevel = tool.definition.permissionLevel ?? ToolPermissionLevel.PUBLIC;
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
            requireExecutionApproval: override?.requireExecutionApproval ?? tool.definition.requireExecutionApproval ?? true,
            requireResultApproval: override?.requireResultApproval ?? tool.definition.requireResultApproval ?? false
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
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Error executing tool ${toolName}: ${error.message}`
            };
        }

        // 如果工具执行失败，直接返回结果
        if (result.status !== ToolExecuteStatus.SUCCESS) {
            return result;
        }

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
                    error: 'Result not approved for LLM',
                    rejectReason: approval.rejectReason
                };
            }
        }

        // 返回成功结果
        return result;
    }
}

