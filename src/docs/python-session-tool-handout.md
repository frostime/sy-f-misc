# Python Session Tool 实现交接文档

> 给下一个 AI Assistant 的工作交接
> 
> 日期: 2025-11-29
> 状态: **基础实现完成，待测试**

## 1. 项目背景

本次工作是根据 `python-session-tool-design.md` 设计文档，实现一个**有状态的 Python Interactive Session 工具组**，让 LLM 可以在多轮对话中复用 Python 变量和状态。

关联的设计文档: `tmp/python-session-tool-design.md`

## 2. 已完成的工作

### 2.1 新增文件清单

```
src/func/gpt/tools/python-session/
├── types.ts           # API 响应类型定义 (VarInfo, ExecResponse 等)
├── api.ts             # PythonSessionAPI HTTP 客户端
├── manager.ts         # PythonProcessManager 进程管理器 (单例)
├── session-binding.ts # ChatSession <-> Python Session 绑定管理
├── tool-group.ts      # PythonSessionToolGroup 有状态工具组实现
└── index.ts           # 模块导出入口

src/func/gpt/setting/
└── PythonSessionSetting.tsx  # 服务启动/停止设置面板
```

### 2.2 修改的文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/func/gpt/tools/types.ts` | 新增 `IToolGroupContext` 和 `IStatefulToolGroup` 接口 |
| `src/func/gpt/tools/executor.ts` | 扩展支持有状态工具组的注册、管理、动态 Prompt 获取 |
| `src/func/gpt/tools/index.ts` | 注册 Python Session 工具组工厂 |
| `src/func/gpt/chat/ChatSession/ChatSession.helper.ts` | 将 `currentSystemPrompt` 改为 async，集成动态状态 Prompt |
| `src/func/gpt/setting/index.tsx` | 在"工具"标签页集成 PythonSessionSetting 组件 |
| `src/func/gpt/index.ts` | 在 unload 时添加 Python 服务清理逻辑 |

### 2.3 实现的核心功能

#### 2.3.1 IStatefulToolGroup 接口 (`types.ts`)

```typescript
export interface IStatefulToolGroup extends ToolGroup {
    init(): Promise<void>;
    cleanup(): Promise<void>;
    isActive(): boolean;
    dynamicStatePrompt(): Promise<string>;
}
```

#### 2.3.2 提供的 LLM 工具

| 工具名 | 功能 |
|--------|------|
| `PyExec` | 执行 Python 代码，变量保存在 Session 中 |
| `PyListVars` | 列出当前 Session 中所有变量 |
| `PyGetVars` | 获取指定变量的详细信息 |
| `PyResetSession` | 重置当前 Python Session |

#### 2.3.3 ToolExecutor 新增方法

```typescript
// 注册有状态工具组工厂
registerStatefulToolGroupFactory(factory, groupName): void

// 初始化有状态工具组实例
initStatefulToolGroup(groupName, context): Promise<boolean>

// 清理指定/所有有状态工具组
cleanupStatefulToolGroup(groupName): Promise<void>
cleanupAllStatefulToolGroups(): Promise<void>

// 获取动态状态 Prompt
getDynamicStatePrompts(): Promise<string>
```

### 2.4 架构流程

```
用户操作流程:
1. 设置面板 → 工具 → Python 交互服务 → 点击"启动服务"
2. Python FastAPI 服务在后台启动 (动态端口 + Token 认证)
3. 在工具管理中启用 "Python Interactive Session" 工具组
4. 聊天中 LLM 可调用 PyExec 等工具

技术流程:
ChatSession 创建
    → toolExecutorFactory() 注册工厂
    → 用户启用工具组时 initStatefulToolGroup()
    → 创建 PythonSessionToolGroup 实例
    → init() 时懒绑定 Python Session
    → 首次 PyExec 调用时真正创建 Python Session
    → 每次 LLM 请求前通过 getDynamicStatePrompts() 注入变量状态
    → ChatSession 关闭时 cleanup()
```

## 3. 待完成/待测试的工作

### 3.1 必须完成

- [ ] **实际功能测试** - 启动服务、执行代码、变量持久化
- [ ] **错误处理验证** - 服务未启动时的友好提示
- [ ] **Python 脚本兼容性** - 确认 `public/scripts/python_session_service.py` 与 API 接口匹配

### 3.2 可能的问题

1. **工具组启用流程** - 当前实现中，工厂只是注册了，需要确认用户启用工具组时是否正确触发 `initStatefulToolGroup`

2. **Session 绑定时机** - 当前是懒加载，第一次调用工具时才绑定 Python Session，需要验证这个流程

3. **ToolChain 中的动态 Prompt** - 设计文档提到在 ToolChain 多轮调用中 systemPrompt 可能不会更新，当前只在初始请求时调用 `currentSystemPrompt()`，ToolChain 内部的后续轮次可能需要进一步处理

### 3.3 后续优化建议

1. **自动启动选项** - 当前是手动启动，可以考虑添加"首次调用时自动启动"的选项
2. **Session 超时清理** - 长时间不活跃的 Python Session 自动清理
3. **执行结果格式化** - 优化 PyExec 输出的格式化展示
4. **图表支持** - 支持 matplotlib 等图表的 base64 输出

## 4. 关键代码位置索引

| 功能 | 文件 | 关键函数/类 |
|------|------|-------------|
| 有状态接口定义 | `tools/types.ts` | `IStatefulToolGroup`, `IToolGroupContext` |
| 进程管理 | `tools/python-session/manager.ts` | `PythonProcessManager`, `pythonServiceManager` |
| API 客户端 | `tools/python-session/api.ts` | `PythonSessionAPI` |
| Session 绑定 | `tools/python-session/session-binding.ts` | `bindPythonSession`, `unbindPythonSession` |
| 工具组实现 | `tools/python-session/tool-group.ts` | `PythonSessionToolGroup` |
| 工厂注册 | `tools/index.ts` | `toolExecutorFactory` 中的 `registerStatefulToolGroupFactory` |
| 动态 Prompt | `chat/ChatSession/ChatSession.helper.ts` | `currentSystemPrompt()` (已改为 async) |
| 设置 UI | `setting/PythonSessionSetting.tsx` | `PythonSessionSetting` |
| 生命周期清理 | `gpt/index.ts` | `unload()` 中的清理逻辑 |

## 5. Python 服务端信息

Python 服务脚本位于: `public/scripts/python_session_service.py`

### API 端点 (FastAPI)

| 端点 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/session/create` | POST | 创建新 Session |
| `/session/{session_id}` | DELETE | 关闭 Session |
| `/session/{session_id}/exec` | POST | 执行代码 |
| `/session/{session_id}/vars` | GET | 列出变量 |
| `/session/{session_id}/vars` | POST | 获取指定变量详情 |
| `/session/{session_id}/reset` | POST | 重置 Session |

认证方式: HTTP Header `X-Auth-Token`

## 6. 构建验证

```bash
# 已通过构建
pnpm run build
# ✓ built in 5.20s
```

## 7. 接手建议

1. 先阅读设计文档 `python-session-tool-design.md` 了解整体架构
2. 运行 `pnpm run dev:publish` 启动开发模式
3. 在思源笔记中测试:
   - 打开设置 → GPT → 工具 → Python 交互服务
   - 点击"启动服务"
   - 启用 Python Interactive Session 工具组
   - 新建对话，让 LLM 使用 PyExec 工具
4. 检查控制台日志排查问题

---

*交接文档结束 - 祝工作顺利！*
