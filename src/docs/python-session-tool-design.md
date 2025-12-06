# Python Session Tool Group 设计文档

> 本文档是与 AI 协作设计 Python Session Tool 的讨论记录和设计方案
> 
> 版本: v0.1 (初稿)
> 日期: 2025-11-29

## 1. 背景与目标

### 1.1 背景

LLM 擅长编写代码，因此与其设计复杂的工具给它，不如让它写代码来解决问题。目前项目中已有的 `script-tools.ts` 提供了自由编写 Python/Shell 脚本的能力，但每次都是从头编写执行完即丢弃，没有状态复用。

受 GPT-5 等模型的 Python Session 功能启发，希望实现一个 **有状态的 Python Interactive Shell 工具**，让 LLM 可以：
- 在多轮对话中复用 Python 变量和状态
- 进行交互式的数据探索和分析
- 逐步调试和优化代码

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                          LLM (GPT-4, Claude等)                   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕  Function Calling
┌─────────────────────────────────────────────────────────────────┐
│                 TypeScript Tool Layer (Node环境)                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Python Session Tool Group                                 │  │
│  │   - StartSession / CloseSession                           │  │
│  │   - ExecuteCode                                           │  │
│  │   - ListVariables / GetVariables                          │  │
│  │   - GetSessionInfo                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │  PythonProcessManager     │  (生命周期 & 连接管理)          │  │
│  │   - 启动/停止 Python 进程 │                                 │  │
│  │   - Token/Port 动态分配   │                                 │  │
│  │   - 健康检查 & 重连       │                                 │  │
│  │   - 状态维护              │                                 │  │
│  └───────────────────────────┼───────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │  HTTP (localhost:port)
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│             Python Session Service (FastAPI 进程)                │
│   - InteractiveInterpreter 封装                                  │
│   - 多 Session 管理                                              │
│   - 代码执行、变量查询、历史记录                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 核心挑战

1. **状态管理** - 现有的 Tool/ToolGroup 都是无状态的，Python Session 需要维护状态
2. **生命周期管理** - 需要管理 Python 进程的启动、停止、异常恢复
3. **动态 Prompt** - System Prompt 需要随 Python Session 状态动态更新
4. **作用域问题** - 每个 ChatSession 需要自己的 Python Session，而非全局共享

## 2. 现有架构分析

### 2.1 Tool/ToolGroup 现有结构

```typescript
// types.ts
export interface Tool {
    definition: ToolDefinitionWithPermission;
    execute: ToolExecuteFunction;
    // ... 可选的格式化、截断函数等
}

export interface ToolGroup {
    name: string;
    tools: Tool[];
    rulePrompt?: string | ((enabledToolNames: string[]) => string);
    // 目前没有 dynamicStatePrompt
}
```

**关键问题**: ToolGroup 是静态对象，无法持有状态。

### 2.2 ToolExecutor 结构

```typescript
// executor.ts
export class ToolExecutor {
    private registry: Record<string, Tool> = {};
    public groupRegistry: Record<string, ToolGroup> = {};
    
    // 生成工具规则提示
    toolRules() {
        // 只获取 rulePrompt，没有动态状态
        for (const groupName of Object.keys(this.groupRegistry)) {
            const rule = this.resolveGroupRulePrompt(groupName);
            // ...
        }
    }
}
```

### 2.3 ChatSession 结构

```typescript
// ChatSession.helper.ts
export const useSession = (props) => {
    // 每个 ChatSession 创建自己的 toolExecutor
    const toolExecutor = toolExecutorFactory({});
    
    // currentSystemPrompt 组装
    const currentSystemPrompt = () => {
        let prompt = systemPrompt().trim() || '';
        if (params.toolExecutor && params.toolExecutor.hasEnabledTools()) {
            prompt += params.toolExecutor.toolRules();
        }
        return `${ptime}\n\n${prompt}`;
    }
}
```

### 2.4 ToolChain 流程

```typescript
// toolchain.ts
export async function executeToolChain(
    toolExecutor: ToolExecutor,
    llmResponseWithToolCalls: CompletionResponse,
    options: ToolChainOptions
): Promise<ToolChainResult> {
    // 每轮调用会用 callbacks.onBeforeSendToLLM 允许修改消息
    // systemPrompt 在 options 中传入，是静态的
}
```

## 3. 设计方案

### 3.1 核心设计决策

#### 3.1.1 Stateful ToolGroup 接口扩展

引入 `IStatefulToolGroup` 接口，为有状态的工具组提供标准接口：

```typescript
// types.ts - 新增
export interface IStatefulToolGroup extends ToolGroup {
    /**
     * 动态状态 prompt，会在每次发送给 LLM 前调用
     * 用于告知 LLM 当前工具的状态（如 Python Session 的变量列表）
     */
    dynamicStatePrompt?: () => string | Promise<string>;
    
    /**
     * 初始化状态（绑定到特定 ChatSession）
     */
    init?: (context: IToolGroupContext) => void | Promise<void>;
    
    /**
     * 清理资源（ChatSession 关闭时调用）
     */
    cleanup?: () => void | Promise<void>;
    
    /**
     * 判断工具组是否活跃（用于决定是否注入动态 prompt）
     */
    isActive?: () => boolean;
}

export interface IToolGroupContext {
    sessionId: string;  // ChatSession ID
    // 可扩展其他上下文信息
}
```

#### 3.1.2 Python Session 管理方案

采用「手动管理 + 懒启动提示」策略：

1. **用户手动管理进程** - 在设置面板提供「启动/停止 Python 服务」按钮
2. **懒启动提示** - Tool 调用时发现服务未启动，返回友好错误提示
3. **自动清理** - 插件 unload 时自动关闭服务进程

```typescript
// python-session/manager.ts

export interface PythonServiceStatus {
    running: boolean;
    port?: number;
    token?: string;
    sessionCount?: number;
    error?: string;
}

export class PythonProcessManager {
    private process: ChildProcess | null = null;
    private port: number | null = null;
    private token: string | null = null;
    private status: PythonServiceStatus = { running: false };
    
    // 启动 Python 服务
    async start(options?: { workdir?: string }): Promise<boolean>;
    
    // 停止 Python 服务
    async stop(): Promise<void>;
    
    // 健康检查
    async healthCheck(): Promise<boolean>;
    
    // 获取当前状态
    getStatus(): PythonServiceStatus;
    
    // 获取服务 URL
    getServiceUrl(): string | null;
    
    // 获取 Token
    getToken(): string | null;
}

// 全局单例
export const pythonServiceManager = new PythonProcessManager();
```

#### 3.1.3 每个 ChatSession 的 Python Session

每个 ChatSession 关联一个独立的 Python Session：

```typescript
// python-session/session-binding.ts

// ChatSession ID -> Python Session ID 的映射
const sessionBindings = new Map<string, string>();

export const bindPythonSession = async (
    chatSessionId: string
): Promise<string | null> => {
    // 如果已绑定，返回现有的
    if (sessionBindings.has(chatSessionId)) {
        return sessionBindings.get(chatSessionId)!;
    }
    
    // 检查服务是否运行
    if (!pythonServiceManager.getStatus().running) {
        return null;
    }
    
    // 创建新的 Python Session
    const pythonSessionId = await createPythonSession();
    if (pythonSessionId) {
        sessionBindings.set(chatSessionId, pythonSessionId);
    }
    return pythonSessionId;
}

export const unbindPythonSession = async (chatSessionId: string): Promise<void> => {
    const pythonSessionId = sessionBindings.get(chatSessionId);
    if (pythonSessionId) {
        await closePythonSession(pythonSessionId);
        sessionBindings.delete(chatSessionId);
    }
}
```

### 3.2 Python Session Tool Group 实现

```typescript
// tools/python-session/index.ts

import { IStatefulToolGroup, Tool, ToolExecuteStatus } from '../types';
import { pythonServiceManager, bindPythonSession, unbindPythonSession } from './manager';
import { PythonSessionAPI } from './api';

class PythonSessionToolGroup implements IStatefulToolGroup {
    name = 'Python Session';
    tools: Tool[] = [];
    rulePrompt = PYTHON_SESSION_RULE_PROMPT;
    
    // 绑定的 ChatSession ID
    private chatSessionId: string | null = null;
    // 对应的 Python Session ID
    private pythonSessionId: string | null = null;
    // 缓存的变量信息
    private cachedVars: VarInfo[] = [];
    
    constructor() {
        this.tools = [
            this.createExecuteCodeTool(),
            this.createListVarsTool(),
            this.createGetVarsTool(),
            this.createResetSessionTool(),
        ];
    }
    
    // ========== IStatefulToolGroup 接口实现 ==========
    
    async init(context: IToolGroupContext): Promise<void> {
        this.chatSessionId = context.sessionId;
        // 懒加载：不立即创建 Python Session，等第一次调用时创建
    }
    
    async cleanup(): Promise<void> {
        if (this.chatSessionId && this.pythonSessionId) {
            await unbindPythonSession(this.chatSessionId);
        }
        this.pythonSessionId = null;
        this.chatSessionId = null;
        this.cachedVars = [];
    }
    
    isActive(): boolean {
        return this.pythonSessionId !== null;
    }
    
    async dynamicStatePrompt(): Promise<string> {
        if (!this.isActive()) {
            return '';  // 未激活时不注入状态
        }
        
        // 获取最新变量信息
        await this.refreshVariables();
        
        return this.generateStatePrompt();
    }
    
    // ========== 私有方法 ==========
    
    private async ensureSession(): Promise<string | null> {
        if (this.pythonSessionId) {
            return this.pythonSessionId;
        }
        
        if (!pythonServiceManager.getStatus().running) {
            return null;  // 服务未运行
        }
        
        this.pythonSessionId = await bindPythonSession(this.chatSessionId!);
        return this.pythonSessionId;
    }
    
    private async refreshVariables(): Promise<void> {
        if (!this.pythonSessionId) return;
        try {
            this.cachedVars = await PythonSessionAPI.listVariables(this.pythonSessionId);
        } catch (e) {
            console.warn('Failed to refresh variables:', e);
        }
    }
    
    private generateStatePrompt(): string {
        const varsInfo = this.cachedVars.map(v => 
            `  - ${v.name}: ${v.type_name} = ${v.repr_str.slice(0, 100)}`
        ).join('\n');
        
        return `
<python-session status="active" session_id="${this.pythonSessionId}">
当前 Python Session 状态:
- 执行次数: ${this.executionCount}
- 变量列表:
${varsInfo || '  (无变量)'}
</python-session>
`.trim();
    }
    
    // ========== Tool 定义 ==========
    
    private createExecuteCodeTool(): Tool {
        return {
            definition: {
                type: 'function',
                function: {
                    name: 'PyExec',
                    description: '在 Python Interactive Session 中执行代码，支持状态复用',
                    parameters: {
                        type: 'object',
                        properties: {
                            code: {
                                type: 'string',
                                description: '要执行的 Python 代码'
                            },
                            timeout: {
                                type: 'number',
                                description: '超时秒数，默认 30'
                            }
                        },
                        required: ['code']
                    }
                },
                permissionLevel: ToolPermissionLevel.SENSITIVE,
                requireResultApproval: true
            },
            execute: async (args) => {
                const sessionId = await this.ensureSession();
                if (!sessionId) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: 'Python 服务未运行。请在设置中手动启动 Python Session 服务。'
                    };
                }
                
                try {
                    const result = await PythonSessionAPI.execute(
                        sessionId, 
                        args.code, 
                        args.timeout
                    );
                    
                    // 执行后更新变量缓存
                    await this.refreshVariables();
                    
                    return {
                        status: result.ok ? ToolExecuteStatus.SUCCESS : ToolExecuteStatus.ERROR,
                        data: this.formatExecutionResult(result),
                        error: result.ok ? undefined : result.error?.evalue
                    };
                } catch (e) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `执行失败: ${e.message}`
                    };
                }
            }
        };
    }
    
    // ... 其他 Tool 定义
}

// 工厂函数：为每个 ChatSession 创建独立的 ToolGroup 实例
export const createPythonSessionToolGroup = (): IStatefulToolGroup => {
    return new PythonSessionToolGroup();
};
```

### 3.3 ToolExecutor 扩展

需要扩展 ToolExecutor 以支持有状态的工具组：

```typescript
// executor.ts - 扩展

export class ToolExecutor {
    // 新增：有状态工具组的实例
    private statefulGroups: Map<string, IStatefulToolGroup> = new Map();
    
    /**
     * 注册有状态的工具组
     */
    registerStatefulToolGroup(
        factory: () => IStatefulToolGroup,
        context: IToolGroupContext
    ): void {
        const group = factory();
        group.init?.(context);
        
        this.statefulGroups.set(group.name, group);
        
        // 同时注册到普通工具组
        this.registerToolGroup(group);
    }
    
    /**
     * 获取动态状态 prompt（所有活跃的有状态工具组）
     */
    async getDynamicStatePrompts(): Promise<string> {
        const prompts: string[] = [];
        
        for (const group of this.statefulGroups.values()) {
            if (group.isActive?.() && group.dynamicStatePrompt) {
                const prompt = await group.dynamicStatePrompt();
                if (prompt) {
                    prompts.push(prompt);
                }
            }
        }
        
        return prompts.join('\n\n');
    }
    
    /**
     * 清理所有有状态工具组
     */
    async cleanupStatefulGroups(): Promise<void> {
        for (const group of this.statefulGroups.values()) {
            await group.cleanup?.();
        }
        this.statefulGroups.clear();
    }
}
```

### 3.4 ChatSession 集成

```typescript
// ChatSession.helper.ts - 修改

const useGptCommunication = (params) => {
    // 修改 currentSystemPrompt 以包含动态状态
    const currentSystemPrompt = async () => {
        let ptime = `It's: ${new Date().toString()}`;
        let prompt = systemPrompt().trim() || '';
        
        if (params.toolExecutor && params.toolExecutor.hasEnabledTools()) {
            prompt += params.toolExecutor.toolRules();
            
            // 新增：获取动态状态 prompt
            const dynamicState = await params.toolExecutor.getDynamicStatePrompts();
            if (dynamicState) {
                prompt += '\n\n' + dynamicState;
            }
        }
        
        return `${ptime}\n\n${prompt}`;
    }
    
    // ...
}

export const useSession = (props) => {
    // ...
    
    const toolExecutor = toolExecutorFactory({});
    
    // 新增：注册 Python Session 工具组（如果启用）
    if (isPythonSessionEnabled()) {
        toolExecutor.registerStatefulToolGroup(
            createPythonSessionToolGroup,
            { sessionId: sessionId() }
        );
    }
    
    // 新增：Session 销毁时清理
    onCleanup(async () => {
        await toolExecutor.cleanupStatefulGroups();
    });
}
```

### 3.5 设置面板 UI

```tsx
// setting/PythonSessionSetting.tsx

const PythonSessionSetting: Component = () => {
    const [status, setStatus] = createSignal<PythonServiceStatus>(
        pythonServiceManager.getStatus()
    );
    
    const startService = async () => {
        const success = await pythonServiceManager.start();
        setStatus(pythonServiceManager.getStatus());
    };
    
    const stopService = async () => {
        await pythonServiceManager.stop();
        setStatus(pythonServiceManager.getStatus());
    };
    
    return (
        <div class="python-session-setting">
            <div class="b3-card">
                <h4>Python Session 服务</h4>
                
                <div class="status-display">
                    <span class={`status-indicator ${status().running ? 'running' : 'stopped'}`} />
                    <span>{status().running ? '运行中' : '已停止'}</span>
                    {status().running && (
                        <span class="status-detail">
                            Port: {status().port} | Sessions: {status().sessionCount}
                        </span>
                    )}
                </div>
                
                <div class="controls">
                    <Show when={!status().running}>
                        <button class="b3-button b3-button--primary" onClick={startService}>
                            启动服务
                        </button>
                    </Show>
                    <Show when={status().running}>
                        <button class="b3-button b3-button--warning" onClick={stopService}>
                            停止服务
                        </button>
                    </Show>
                </div>
                
                <Show when={status().error}>
                    <div class="error-message">{status().error}</div>
                </Show>
            </div>
        </div>
    );
};
```

## 4. 生命周期管理

### 4.1 Python 服务进程生命周期

```
┌─────────────────────────────────────────────────────────────┐
│                    Python Service 状态机                      │
└─────────────────────────────────────────────────────────────┘

    ┌───────────┐                              
    │  Stopped  │←─────────────────────────────┐
    └─────┬─────┘                              │
          │ user.start()                       │
          ↓                                    │
    ┌───────────┐     process.exit()     ┌────┴────┐
    │ Starting  │─────────────────────→│  Error  │
    └─────┬─────┘                        └─────────┘
          │ healthCheck() OK                   ↑
          ↓                                    │
    ┌───────────┐     crash / timeout          │
    │  Running  │─────────────────────────────┘
    └─────┬─────┘
          │ user.stop() / plugin.unload()
          ↓
    ┌───────────┐
    │ Stopping  │
    └─────┬─────┘
          │
          ↓
    ┌───────────┐
    │  Stopped  │
    └───────────┘
```

### 4.2 关键清理时机

1. **用户手动停止** - 设置面板点击「停止服务」
2. **插件 unload** - GPT 功能被禁用或插件卸载
3. **应用退出** - window.beforeunload 事件
4. **进程异常退出** - 监听 process.exit 事件，记录状态

```typescript
// manager.ts

export class PythonProcessManager {
    async start(): Promise<boolean> {
        // 生成随机 Token
        this.token = crypto.randomUUID();
        
        // 动态分配端口
        this.port = await findAvailablePort();
        
        // 启动进程
        this.process = spawn('python', [SCRIPT_PATH], {
            env: {
                ...process.env,
                PYSESSION_TOKEN: this.token,
                PYSESSION_PORT: String(this.port),
            }
        });
        
        // 监听进程退出
        this.process.on('exit', (code) => {
            this.handleProcessExit(code);
        });
        
        // 健康检查等待服务就绪
        const ready = await this.waitForReady();
        return ready;
    }
    
    private handleProcessExit(code: number | null): void {
        this.status = {
            running: false,
            error: code !== 0 ? `进程异常退出 (code: ${code})` : undefined
        };
        
        // 清理所有绑定的 session
        // 通知 UI 更新
    }
}
```

## 5. ToolChain 中的动态 Prompt 更新

### 5.1 问题

在 `toolchain.ts` 的多轮工具调用中，System Prompt 是在开始时传入的，中间不会更新。如果 LLM 执行了 Python 代码创建了新变量，下一轮调用时 LLM 看到的变量列表仍是旧的。

### 5.2 解决方案

在 `ToolChainOptions.callbacks.onBeforeSendToLLM` 中刷新动态状态：

```typescript
// toolchain.ts

const handleToolChain = async (...) => {
    // ...
    
    const toolChainResult = await executeToolChain(params.toolExecutor, initialResponse, {
        // ...
        callbacks: {
            onBeforeSendToLLM: async (messages) => {
                // 刷新 System Prompt 中的动态状态
                const updatedSystemPrompt = await currentSystemPrompt();
                
                // 找到并更新 system message
                // 或者在 toolchain 内部支持动态 systemPrompt
            },
            // ...
        }
    });
}
```

更好的方案是让 `ToolChainOptions.systemPrompt` 支持函数形式：

```typescript
export interface ToolChainOptions {
    // 支持字符串或动态函数
    systemPrompt?: string | (() => Promise<string>);
}
```

## 6. 文件结构

```
src/func/gpt/tools/python-session/
├── index.ts           # Tool Group 入口，导出工厂函数
├── types.ts           # 类型定义
├── manager.ts         # PythonProcessManager 进程管理
├── api.ts             # HTTP API 客户端封装
├── session-binding.ts # ChatSession <-> Python Session 绑定
└── skill-doc.ts       # 使用说明文档

src/func/gpt/setting/
├── PythonSessionSetting.tsx  # 设置面板组件
└── ...
```

## 7. 待讨论问题

### 7.1 关于懒启动 vs 自动启动

**当前方案**: 懒启动 + 手动管理
- 优点: 简单，用户控制
- 缺点: 需要用户手动操作，体验不够流畅

**备选方案**: 自动启动
- 第一次调用 Python 工具时自动启动服务
- 需要处理启动延迟和失败情况
- 增加了复杂性

建议先实现简单的手动管理方案，后续可以考虑加入自动启动选项。

### 7.2 关于 Session 隔离级别

**当前方案**: 每个 ChatSession 一个 Python Session
- 完全隔离，互不影响
- 资源消耗较大

**备选方案**: 全局共享单个 Python Session
- 资源节省
- 变量可能冲突
- 不推荐

### 7.3 关于动态 Prompt 更新时机

1. **每次发送消息前** - 最新状态，但增加延迟
2. **工具调用后** - 仅在执行 Python 代码后更新
3. **定时刷新** - 不推荐

建议采用方案 2，在 Python 执行工具调用后触发变量刷新。

### 7.4 Stateful ToolGroup 的通用性

`IStatefulToolGroup` 接口设计是否足够通用，可以支持未来其他有状态的工具组（如 Memory 机制）？

建议在实现 Python Session 后再评估接口设计是否需要调整。

## 8. 实施计划

### Phase 1: 基础设施
1. 实现 `PythonProcessManager` 进程管理
2. 实现 HTTP API 客户端
3. 实现设置面板 UI

### Phase 2: Tool 实现
1. 定义 `IStatefulToolGroup` 接口
2. 实现 `PythonSessionToolGroup`
3. 扩展 `ToolExecutor` 支持有状态工具组

### Phase 3: 集成
1. 在 `ChatSession.helper.ts` 中集成
2. 在 `toolchain.ts` 中支持动态 System Prompt
3. 处理生命周期清理

### Phase 4: 测试与优化
1. 单元测试
2. 集成测试
3. 性能优化
4. 文档完善

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Python 进程崩溃 | 工具不可用 | 检测并提示用户重启 |
| 端口冲突 | 启动失败 | 动态端口分配 + 重试 |
| 长时间执行 | 阻塞 | 超时机制 |
| 内存泄漏 | 性能下降 | Session 资源限制 |
| 安全问题 | 恶意代码 | 用户审核 + 沙箱考虑 |

---

*文档结束 - 等待讨论反馈*
