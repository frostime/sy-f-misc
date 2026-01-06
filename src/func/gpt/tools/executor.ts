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
import { createVFS, VFSManager } from '@/libs/vfs';
import { createValSystemTools } from './vars/index';
import { VariableSystem } from './vars/core';


const AgentSkillRules: ToolGroup['declareSkillRules'] = {
    VarRef: {
        desc: '使用 $VAR_REF{{name}} 语法直接引用变量作为 Tool Call 的参数值',
        prompt: `当工具返回大量数据时，系统会自动保存到变量。可以在后续工具参数中引用这些变量，实现零 Token 数据传递。
**语法**：
- \`$VAR_REF{{name}}\` - 引用完整变量内容
- \`$VAR_REF{{name:start:length}}\` - 引用切片（从 start 开始，读取 length 字符）

**支持位置**：工具参数中的任何位置（字符串、嵌套对象、数组）

**使用示例**：
// 步骤 1：调用工具产生大结果
{ "name": "FetchWebPage", "arguments": { "url": "..." } }
// → 系统提示：完整结果已保存至变量 FetchWebPage_123456

// 步骤 2：使用变量引用，避免重复传输
{
    "name": "ExtractTable",
    "arguments": {
        "html": "$VAR_REF{{FetchWebPage_123456}}"  // ← 直接引用
    }
}`
    }
};

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

    public vfs: VFSManager;
    public varSystem: VariableSystem;

    private varToolNames: Set<string> = new Set();

    constructor(options: {
        vfs?: VFSManager;
    }) {
        this.vfs = options.vfs || createVFS({
            local: true,
            memory: true,
        });

        const { varSystem, toolGroup } = createValSystemTools();
        this.varSystem = varSystem;
        this.registerToolGroup(toolGroup);

        toolGroup.tools.forEach(tool => {
            this.varToolNames.add(tool.definition.function.name);
        });

        this.registerSkillRules('Agent', AgentSkillRules);
    }

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

        let finalContent = ruleContent.trim();

        if (group.declareSkillRules) {
            finalContent += '\n\n' + this.generateSkillRuleIndex(groupName, group.declareSkillRules);
        }

        return `
<tool-group-rule group="${groupName}">
Group "${groupName}" contains following tools: ${enabledToolNames.join(', ')}.

${finalContent}
</tool-group-rule>
`;
    }

    toolRules() {
        if (!this.hasEnabledTools()) return '';
        let prompt = `<tool-rules>
Assistant/Agent 务必遵循如下规范:

在当前对话中，如果发现有必要，请使用提供的工具(tools)。

### 基本规范

**工作规范**
- 在调用工具前，请在内部充分规划；当任务复杂或用户明确要求时，再在输出中简要说明你的计划（3–5 行）。
- 每个 TOOL 都有一个隐藏可选参数 \`limit\`，来截断限制返回给 LLM 的输出长度。设置为 -1 或 0 表示不限制。

**用户审核**
- 部分工具在调用的时候会给用户审核，用户可能拒绝调用。
- 如果用户在拒绝的时候提供了原因，请**一定要仔细参考用户给出的原因并适当调整你的方案**

### System Log - 重要约束
- 为了节省资源，在工具调用结束之后，会生成调用日志单隐藏 Tool Call 的结果
   "[System Tool Call Log]...."
- Agent 可以利用变量机制查看历史工具调用结果
- ❌ **绝对禁止**生成任何类似 "[System Tool Call Log]<Tool Name>..." 格式的文本来替代正确的工具调用!

### ⚠️ 重要约束 - 禁止伪造系统日志 ###

**严格禁止**：
1. 不得生成任何 \`**[System Tool Call Log]<Tool Name>**\` 格式的 System Log
2. 不得模仿工具调用的响应格式
3. 不得伪造工具执行结果
4. 系统日志由 SYSTEM 自动生成，Assistant 绝对不得提及或模仿

**正确做法**：
- 需要工具时：直接调用 tool_calls，系统会自动生成日志
- 不需要工具时：正常回复，不要提及工具调用过程

**违规示例**（绝对禁止）：
❌ "**[System Log] Tool Call**: SearchWeb..."
❌ "Response: ✓ 执行成功..."
❌ 任何模仿系统格式的内容

### 变量机制

**处理截断结果**
- 如果工具返回结果过长被截断，系统会自动将完整结果保存到变量中，并在结果中提示变量名。
- 你可以使用 ListVars/ReadVar 工具来读取变量内容。

**工具组: ListVars/ReadVar**
- 专门用于缓存长文本使用; 总是可用
- ListVars 会列出当前所有变量的信息，包括名称、字符长度、描述和创建时间。
- ReadVar 参数: \`name\` (变量名), \`start\` (Char 起始位置, 0-based), \`length\` (读取长度)。

**变量引用机制**
- 使用类似 $VAR_REF 语法直接引用变量的值作为工具调用参数 —— 可大大节省 Token
- 具体用法使用 ReadVar 查看 Rule::Agent::VarRef 中的高级文档
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

        if (group.declareSkillRules) {
            this.registerSkillRules(group.name, group.declareSkillRules);
        }
    }

    /**
     * 设置工具级别的启用状态
     */
    setToolEnabled(toolName: string, enabled: boolean): void {
        this.enablingStore.update('tool', toolName, enabled);
    }

    private registerSkillRules(
        groupName: string,
        rules: NonNullable<ToolGroup['declareSkillRules']>
    ): void {
        for (const [ruleName, rule] of Object.entries(rules)) {
            const varName = `Rule::${groupName}::${ruleName}`;

            this.varSystem.addVariable(
                varName,
                rule.prompt,
                'RULE',
                `Skill rule for ${groupName}: ${rule.desc}`
            );

            const variable = this.varSystem.getVariable(varName);
            if (variable) {
                variable.keep = true;
            }
        }
    }

    private generateSkillRuleIndex(
        groupName: string,
        rules: NonNullable<ToolGroup['declareSkillRules']>
    ): string {
        const lines = ['**Advanced Documentation (Stored as Variables):**'];

        for (const [ruleName, rule] of Object.entries(rules)) {
            const varName = `Rule::${groupName}::${ruleName}`;

            if (rule.alwaysLoad) {
                lines.push(`\n**${rule.desc}:**`);
                lines.push(rule.prompt);
            } else {
                lines.push(`- ${rule.desc}`);
                lines.push(`  Access via: ReadVar({"name": "${varName}"})`);
            }
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
        if (allTools.length > 0) {
            // 检查是否有 ReadVar 和 ListVars 工具
            const toolNames = allTools.map(t => t.function.name);
            const varGroup = this.groupRegistry['vars'];

            if (!varGroup) {
                console.warn('vars group not registered, skipping auto-injection');
                return allTools;
            }

            if (!toolNames.includes('ReadVar')) {
                const readVarTool = varGroup.tools.find(t => t.definition.function.name === 'ReadVar');
                if (readVarTool) {
                    allTools.push(readVarTool.definition);
                }
            }
            if (!toolNames.includes('ListVars')) {
                const listVarsTool = varGroup.tools.find(t => t.definition.function.name === 'ListVars');
                if (listVarsTool) {
                    allTools.push(listVarsTool.definition);
                }
            }
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
     * 递归解析对象中的变量引用
     */
    private resolveVarReferences(
        obj: any,
        visited: Set<string> = new Set()
    ): any {
        if (typeof obj === 'string') {
            return this.replaceVarInString(obj, visited);
        }

        if (Array.isArray(obj)) {
            // ✅ 每个元素独立的 visited
            return obj.map(item =>
                this.resolveVarReferences(item, new Set(visited))
            );
        }

        if (obj && typeof obj === 'object') {
            const resolved: Record<string, any> = {};
            for (const [key, val] of Object.entries(obj)) {
                // ✅ 每个属性独立的 visited
                resolved[key] = this.resolveVarReferences(val, new Set(visited));
            }
            return resolved;
        }

        return obj;
    }


    /**
     * 在字符串中替换变量引用，并检测循环引用
     */
    private replaceVarInString(str: string, visited: Set<string>): string {
        const varRefRegex = /\$VAR_REF\{\{([a-zA-Z0-9_-]+)(?::(\d+)(?::(\d+))?)?\}\}/g;

        return str.replace(varRefRegex, (_match, varName, start, length) => {
            // ✅ 检测循环引用
            if (visited.has(varName)) {
                const chain = Array.from(visited).join(' → ');
                throw new Error(
                    `Circular variable reference detected: ${chain} → ${varName}`
                );
            }

            const variable = this.varSystem.getVariable(varName);
            if (!variable) {
                const available = this.varSystem.listVariables()
                    .map(v => v.name)
                    .join(', ');
                throw new Error(
                    `Variable '${varName}' not found. Available: ${available || '(none)'}`
                );
            }

            let value = variable.value;

            // 处理切片
            if (start !== undefined) {
                const startIdx = parseInt(start);
                const endIdx = length ? startIdx + parseInt(length) : undefined;

                if (typeof value === 'string') {
                    value = value.slice(startIdx, endIdx);
                } else {
                    throw new Error(
                        `Cannot slice non-string variable '${varName}' (type: ${typeof value})`
                    );
                }
            }

            // ✅ 类型转换
            let resolvedValue: string;
            if (typeof value === 'string') {
                resolvedValue = value;
            } else if (typeof value === 'object' && value !== null) {
                resolvedValue = JSON.stringify(value);
            } else {
                resolvedValue = String(value);
            }

            // ✅ 递归解析嵌套引用
            visited.add(varName);
            const finalValue = this.replaceVarInString(resolvedValue, visited);
            visited.delete(varName);

            return finalValue;
        });
    }



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

        // 检查变量引用机制
        try {
            args = this.resolveVarReferences(args);
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: error instanceof Error ? error.message : String(error),
                finalText: error instanceof Error ? error.message : String(error)
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
        let keptLength = originalLength;
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
            keptLength = truncResult.shownLength;
            // isTruncated = truncResult.isTruncated;
            isTruncated = finalForLLM.length < originalLength;
        }

        result.formattedText = formatted;
        result.isTruncated = isTruncated;
        result.finalText = finalForLLM;

        const leftLength = originalLength - keptLength;

        // 3. 缓存原始数据到本地文件
        // 暂时先放在这里; 这段代码姑且保留，以后可能会用到
        // let cacheFile = null;
        // if (tool.SKIP_CACHE_RESULT !== true) {
        //     cacheFile = cacheToolCallResult(toolName, args, result);
        //     result.cacheFile = cacheFile;
        // }


        // ================================================================
        // 变量缓存机制
        // ================================================================
        // 保存策略：仅在截断时保存，或结果超过一定阈值

        let shouldSaveToVar = false;

        const isVarTool = this.varToolNames.has(toolName);

        if (!isVarTool) {
            shouldSaveToVar = true;
            const varName = `${toolName}_${window.Lute.NewNodeID()}`;
            const vitalArgs = Object.entries(args).map(([key, val]) => {
                let valStr = typeof val === 'string' ? val : JSON.stringify(val);
                if (valStr.length > 20) {
                    valStr = valStr.slice(0, 20) + '...';
                }
                return `${key}=${valStr}`;
            });

            result.cacheVarResult = varName + '_result';
            this.varSystem.addVariable(
                result.cacheVarResult,
                formatted,
                'ToolCallResult',
                `Call ${toolName} with args: ${vitalArgs.join(', ')}.`,
            );

            // 保存参数到变量
            const argsVarName = varName + '_args';
            const argsJson = JSON.stringify(args, null, 2);
            this.varSystem.addVariable(
                argsVarName,
                argsJson,
                'ToolCallArgs',
                `Arguments for tool call: ${toolName}`,
            );
            result.cacheVarArgs = argsVarName;
        }

        // 生成提示信息
        const sysHintHeader = [];
        if (shouldSaveToVar && result.cacheVarResult) {
            sysHintHeader.push(`<!--ToolCallLog:Begin-->`);
            sysHintHeader.push(`[system log] 完整结果已保存至变量: ${result.cacheVarResult} (${formatted.length} 字符)`);

            if (isTruncated) {
                sysHintHeader.push(`[system log] 结果已截断为 ${keptLength} 字符`);
                sysHintHeader.push(`[system hint] 使用变量引用获取完整内容: $VAR_REF{{${result.cacheVarResult}}}`);
                sysHintHeader.push(`[system hint] 或使用 ReadVar 分块读取: {"name": "ReadVar", "arguments": {"name": "${result.cacheVarResult}", "start": ${keptLength}, "length": ${Math.min(leftLength, 2000)}} —— 注意, 请认真考虑是否有必要读取完整内容`);
            } else {
                sysHintHeader.push(`[system hint] 可使用变量引用: $VAR_REF{{${result.cacheVarResult}}}`);
            }

            // if (result.cacheFile) {
            //     sysHintHeader.push(`[system log] 日志已缓存至: ${cacheFile}`);
            // }

            result.finalText = result.finalText + '\n' + sysHintHeader.join('\n') + '\n<!--ToolCallLog:End-->';
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

