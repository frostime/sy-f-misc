/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-29
 * @FilePath     : /src/func/gpt/tools/python-session/tool-group.ts
 * @Description  : Python Session 有状态工具组实现
 */

import {
    Tool,
    ToolExecuteStatus,
    ToolExecuteResult,
    ToolPermissionLevel,
    IStatefulToolGroup,
    IToolGroupContext
} from '../types';
import { VarInfo, ExecResponse } from './types';
import { pythonServiceManager } from './manager';
import { bindPythonSession, unbindPythonSession, getPythonSessionId } from './session-binding';
import { PythonSessionAPI } from './api';

/**
 * Python Session 工具组名称常量
 */
export const PYTHON_SESSION_GROUP_NAME = 'Python Interactive Session';

/**
 * Python Session 工具组的规则提示
 */
const PYTHON_SESSION_RULE_PROMPT = `
## Python Session 工具组 ##

这是一个有状态的 Python 交互式环境，变量和状态会在多轮调用间保持。

**工具说明**:
- PyExec: 执行 Python 代码，支持多行代码，变量会保存在 Session 中
- PyListVars: 列出当前 Session 中的所有用户变量
- PyGetVars: 获取指定变量的详细信息
- PyResetSession: 重置 Session，清除所有变量和状态

**使用技巧**:
- 可以分步骤执行代码，逐步构建复杂逻辑
- 使用 print() 输出中间结果进行调试
- Session 内置了 cd(), pwd(), ls(), cat() 等文件操作辅助函数
- 对于数据分析任务，可以先导入库、加载数据，再逐步处理

**注意事项**:
- 如果服务未启动，工具会返回错误提示
- 长时间运行的代码可能会超时（默认 30 秒）
- 避免执行会阻塞的代码（如无限循环、等待用户输入）
`.trim();

/**
 * 格式化执行结果为字符串
 */
const formatExecResult = (result: ExecResponse): string => {
    const parts: string[] = [];

    // 执行计数
    parts.push(`[In ${result.execution_count}]`);

    // 标准输出
    if (result.stdout && result.stdout.trim()) {
        parts.push(`[stdout]\n${result.stdout.trim()}`);
    }

    // 标准错误
    if (result.stderr && result.stderr.trim()) {
        parts.push(`[stderr]\n${result.stderr.trim()}`);
    }

    // 返回值
    if (result.result_repr) {
        parts.push(`[Out ${result.execution_count}]\n${result.result_repr}`);
    }

    // 错误信息
    if (result.error) {
        parts.push(`[Error: ${result.error.ename}]\n${result.error.evalue}`);
        if (result.error.traceback && result.error.traceback.length > 0) {
            parts.push(`[Traceback]\n${result.error.traceback.join('')}`);
        }
    }

    // 超时标记
    if (result.timed_out) {
        parts.push('[⚠️ 执行超时]');
    }

    return parts.join('\n\n');
};

/**
 * 格式化变量列表
 */
const formatVarList = (vars: VarInfo[]): string => {
    if (vars.length === 0) {
        return '当前 Session 中没有用户变量';
    }

    const lines = vars.map(v => {
        const reprPreview = v.repr.length > 100
            ? v.repr.slice(0, 100) + '...'
            : v.repr;
        return `- ${v.name}: ${v.type} = ${reprPreview}`;
    });

    return `当前 Session 变量 (${vars.length} 个):\n${lines.join('\n')}`;
};

/**
 * Python Session 有状态工具组
 */
export class PythonSessionToolGroup implements IStatefulToolGroup {
    name = 'Python Session';
    tools: Tool[] = [];
    rulePrompt = PYTHON_SESSION_RULE_PROMPT;

    // 绑定的 ChatSession ID
    private chatSessionId: string | null = null;
    // 缓存的变量信息
    private cachedVars: VarInfo[] = [];
    // 执行计数
    private executionCount: number = 0;

    constructor() {
        this.tools = [
            this.createExecuteCodeTool(),
            this.createListVarsTool(),
            this.createGetVarsTool(),
            this.createResetSessionTool(),
        ];
    }

    // ==================== IStatefulToolGroup 接口实现 ====================

    async init(context: IToolGroupContext): Promise<void> {
        this.chatSessionId = context.sessionId;
        this.cachedVars = [];
        this.executionCount = 0;
        console.log(`PythonSessionToolGroup 初始化: ChatSession=${context.sessionId}`);
    }

    async cleanup(): Promise<void> {
        if (this.chatSessionId) {
            await unbindPythonSession(this.chatSessionId);
            console.log(`PythonSessionToolGroup 清理: ChatSession=${this.chatSessionId}`);
        }
        this.chatSessionId = null;
        this.cachedVars = [];
        this.executionCount = 0;
    }

    isActive(): boolean {
        if (!this.chatSessionId) {
            return false;
        }
        const pythonSessionId = getPythonSessionId(this.chatSessionId);
        return !!pythonSessionId;
    }

    async dynamicStatePrompt(): Promise<string> {
        if (!this.isActive()) {
            // 未激活时，检查服务状态并给出提示
            const status = pythonServiceManager.getStatus();
            if (!status.running) {
                return ''; // 服务未运行，不注入任何状态
            }
            return ''; // 服务运行但未创建 Session，等待第一次调用
        }

        // 获取最新变量信息
        await this.refreshVariables();

        return this.generateStatePrompt();
    }

    // ==================== 私有方法 ====================

    /**
     * 确保有可用的 Python Session
     * 如果没有则尝试创建
     */
    private async ensureSession(): Promise<string | null> {
        if (!this.chatSessionId) {
            return null;
        }

        // 检查是否已有绑定
        let pythonSessionId = getPythonSessionId(this.chatSessionId);
        if (pythonSessionId) {
            return pythonSessionId;
        }

        // 检查服务是否运行
        if (!pythonServiceManager.getStatus().running) {
            return null;
        }

        // 创建新的 Python Session
        pythonSessionId = await bindPythonSession(this.chatSessionId);
        return pythonSessionId;
    }

    /**
     * 获取 API 客户端
     */
    private getAPI(): PythonSessionAPI | null {
        return pythonServiceManager.getAPI();
    }

    /**
     * 刷新变量缓存
     */
    private async refreshVariables(): Promise<void> {
        if (!this.chatSessionId) return;

        const pythonSessionId = getPythonSessionId(this.chatSessionId);
        if (!pythonSessionId) return;

        const api = this.getAPI();
        if (!api) return;

        try {
            const response = await api.listVariables(pythonSessionId);
            this.cachedVars = response.variables;
        } catch (error) {
            console.warn('刷新变量失败:', error);
        }
    }

    /**
     * 生成状态提示
     */
    private generateStatePrompt(): string {
        const pythonSessionId = this.chatSessionId
            ? getPythonSessionId(this.chatSessionId)
            : null;

        if (!pythonSessionId) {
            return '';
        }

        const varsInfo = this.cachedVars.length > 0
            ? this.cachedVars.map(v => {
                const reprPreview = v.repr.length > 80
                    ? v.repr.slice(0, 80) + '...'
                    : v.repr;
                return `  - ${v.name}: ${v.type} = ${reprPreview}`;
            }).join('\n')
            : '  (无变量)';

        return `
<python-session status="active" session_id="${pythonSessionId}" exec_count="${this.executionCount}">
当前 Python Session 状态:
- 执行次数: ${this.executionCount}
- 变量列表:
${varsInfo}
</python-session>
`.trim();
    }

    // ==================== Tool 定义 ====================

    /**
     * 创建代码执行工具
     */
    private createExecuteCodeTool(): Tool {
        const self = this;

        return {
            definition: {
                type: 'function',
                function: {
                    name: 'PyExec',
                    description: '在 Python Interactive Session 中执行代码。变量和状态会在多次调用间保持。支持多行代码。',
                    parameters: {
                        type: 'object',
                        properties: {
                            code: {
                                type: 'string',
                                description: '要执行的 Python 代码'
                            },
                            timeout: {
                                type: 'number',
                                description: '超时秒数，默认 30。设置为 0 表示不限制（谨慎使用）'
                            }
                        },
                        required: ['code']
                    }
                },
                permissionLevel: ToolPermissionLevel.SENSITIVE,
                requireExecutionApproval: true,
                requireResultApproval: true
            },
            declaredReturnType: {
                type: 'string',
                note: '包含 stdout、stderr、返回值和错误信息的格式化文本'
            },
            execute: async (args: { code: string; timeout?: number }): Promise<ToolExecuteResult> => {
                const sessionId = await self.ensureSession();
                if (!sessionId) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: 'Python 服务未运行。请在「设置 → GPT → Python Session」中手动启动服务。'
                    };
                }

                const api = self.getAPI();
                if (!api) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: '无法获取 API 客户端'
                    };
                }

                try {
                    const result = await api.executeCode(sessionId, args.code, args.timeout);

                    // 更新执行计数
                    self.executionCount = result.execution_count;

                    // 执行后更新变量缓存
                    await self.refreshVariables();

                    const formatted = formatExecResult(result);

                    return {
                        status: result.ok ? ToolExecuteStatus.SUCCESS : ToolExecuteStatus.ERROR,
                        data: formatted,
                        error: result.ok ? undefined : (result.error?.evalue || '执行失败')
                    };
                } catch (error) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `执行失败: ${error.message}`
                    };
                }
            },
            compressArgs: (args) => {
                const codePreview = args.code?.length > 50
                    ? args.code.slice(0, 50) + '...'
                    : args.code;
                return `code="${codePreview}"`;
            },
            compressResult: (result) => {
                if (result.status === ToolExecuteStatus.SUCCESS) {
                    return `exec_count=${self.executionCount}`;
                }
                return `error`;
            }
        };
    }

    /**
     * 创建列出变量工具
     */
    private createListVarsTool(): Tool {
        const self = this;

        return {
            definition: {
                type: 'function',
                function: {
                    name: 'PyListVars',
                    description: '列出当前 Python Session 中的所有用户变量',
                    parameters: {
                        type: 'object',
                        properties: {},
                        required: []
                    }
                },
                permissionLevel: ToolPermissionLevel.PUBLIC,
                requireExecutionApproval: false,
                requireResultApproval: false
            },
            declaredReturnType: {
                type: 'string',
                note: '变量列表，格式为 "- name: type = repr"'
            },
            execute: async (): Promise<ToolExecuteResult> => {
                const sessionId = await self.ensureSession();
                if (!sessionId) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: 'Python 服务未运行或 Session 未创建'
                    };
                }

                const api = self.getAPI();
                if (!api) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: '无法获取 API 客户端'
                    };
                }

                try {
                    const response = await api.listVariables(sessionId);
                    self.cachedVars = response.variables;

                    return {
                        status: ToolExecuteStatus.SUCCESS,
                        data: formatVarList(response.variables)
                    };
                } catch (error) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `获取变量列表失败: ${error.message}`
                    };
                }
            }
        };
    }

    /**
     * 创建获取变量工具
     */
    private createGetVarsTool(): Tool {
        const self = this;

        return {
            definition: {
                type: 'function',
                function: {
                    name: 'PyGetVars',
                    description: '获取 Python Session 中指定变量的详细信息',
                    parameters: {
                        type: 'object',
                        properties: {
                            names: {
                                type: 'array',
                                items: { type: 'string' },
                                description: '要获取的变量名列表'
                            }
                        },
                        required: ['names']
                    }
                },
                permissionLevel: ToolPermissionLevel.PUBLIC,
                requireExecutionApproval: false,
                requireResultApproval: false
            },
            declaredReturnType: {
                type: 'Record<string, { name: string; type: string; repr: string } | null>',
                note: '变量名到变量信息的映射，不存在的变量值为 null'
            },
            execute: async (args: { names: string[] }): Promise<ToolExecuteResult> => {
                const sessionId = await self.ensureSession();
                if (!sessionId) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: 'Python 服务未运行或 Session 未创建'
                    };
                }

                const api = self.getAPI();
                if (!api) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: '无法获取 API 客户端'
                    };
                }

                try {
                    const response = await api.getVariables(sessionId, args.names);

                    // 格式化输出
                    const lines = args.names.map(name => {
                        const info = response.values[name];
                        if (!info) {
                            return `- ${name}: (未定义)`;
                        }
                        return `- ${name}: ${info.type} = ${info.repr}`;
                    });

                    return {
                        status: ToolExecuteStatus.SUCCESS,
                        data: lines.join('\n')
                    };
                } catch (error) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `获取变量失败: ${error.message}`
                    };
                }
            }
        };
    }

    /**
     * 创建重置 Session 工具
     */
    private createResetSessionTool(): Tool {
        const self = this;

        return {
            definition: {
                type: 'function',
                function: {
                    name: 'PyResetSession',
                    description: '重置 Python Session，清除所有变量和执行历史',
                    parameters: {
                        type: 'object',
                        properties: {},
                        required: []
                    }
                },
                permissionLevel: ToolPermissionLevel.MODERATE,
                requireExecutionApproval: true,
                requireResultApproval: false
            },
            execute: async (): Promise<ToolExecuteResult> => {
                const sessionId = await self.ensureSession();
                if (!sessionId) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: 'Python 服务未运行或 Session 未创建'
                    };
                }

                const api = self.getAPI();
                if (!api) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: '无法获取 API 客户端'
                    };
                }

                try {
                    await api.resetSession(sessionId);
                    self.cachedVars = [];
                    self.executionCount = 0;

                    return {
                        status: ToolExecuteStatus.SUCCESS,
                        data: 'Python Session 已重置，所有变量和历史已清除'
                    };
                } catch (error) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `重置 Session 失败: ${error.message}`
                    };
                }
            }
        };
    }
}

/**
 * 工厂函数：创建 Python Session 工具组实例
 * 每个 ChatSession 应该创建独立的实例
 */
export const createPythonSessionToolGroup = (): IStatefulToolGroup => {
    return new PythonSessionToolGroup();
};
