import {
    Tool,
    ToolPermissionLevel,
    ToolExecuteStatus,
    ToolExecuteResult,
    UserApprovalCallback,
    ResultApprovalCallback
} from './types';


/**
 * 工具注册表
 */
interface ToolRegistry {
    [toolName: string]: Tool;
}

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
    private registry: ToolRegistry = {};
    private executionApprovalCallback: UserApprovalCallback | null = null;
    private resultApprovalCallback: ResultApprovalCallback | null = null;
    private approvalRecords: ApprovalRecord = {};


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
    }

    /**
     * 注册多个工具
     */
    registerTools(tools: Tool[]): void {
        for (const tool of tools) {
            this.registerTool(tool);
        }
    }

    /**
     * 注册工具模块
     * 支持默认导出单个工具或命名导出多个工具
     */
    registerToolModule(module: any): void {
        // 处理默认导出
        if (module.default) {
            if (module.default.definition && module.default.execute) {
                this.registerTool(module.default);
            } else if (Array.isArray(module.default)) {
                this.registerTools(module.default);
            }
        }

        // 处理命名导出的工具列表
        if (module.tools && Array.isArray(module.tools)) {
            this.registerTools(module.tools);
        }

        // 处理单独命名导出的工具
        for (const key in module) {
            if (key !== 'default' && key !== 'tools') {
                const item = module[key];
                if (item && item.definition && item.execute) {
                    this.registerTool(item);
                }
            }
        }
    }

    /**
     * 获取所有工具定义
     */
    getAllToolDefinitions(): IToolDefinition[] {
        return Object.values(this.registry).map(tool => tool.definition);
    }

    /**
     * 获取指定权限级别的工具定义
     */
    getToolDefinitionsByPermission(level: ToolPermissionLevel): IToolDefinition[] {
        return Object.values(this.registry)
            .filter(tool => tool.definition.permissionLevel === level)
            .map(tool => tool.definition);
    }

    /**
     * 获取工具
     */
    getTool(name: string): Tool | undefined {
        return this.registry[name];
    }

    // ==================== Approval ====================

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
        const tool = this.registry[toolName];

        if (!tool) {
            return {
                approved: false,
                rejectReason: `Tool ${toolName} not found`
            };
        }

        const { permissionLevel } = tool.definition;

        // 公开工具，无需审核
        if (permissionLevel === ToolPermissionLevel.PUBLIC) {
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

        // 执行前审批检查
        const shouldCheckExecution = !options?.skipExecutionApproval &&
            (tool.definition.requireExecutionApproval !== false);

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
            (tool.definition.requireResultApproval === true);

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

