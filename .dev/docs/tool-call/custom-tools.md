---
name: 自定义脚本工具（custom-program-tools）
description: Python/PowerShell 自定义工具的描述格式、解析流程、加载机制
updated: 2026-02-22
scope:
  - /src/func/gpt/tools/custom-program-tools/**
deprecated: false
---

# 自定义脚本工具（custom-program-tools）

**仅桌面端可用**（`IS_IN_APP` 检查），需本地安装 Python 或 PowerShell。

---

## 文件对结构

每个工具模块由**两个文件**组成（存放于同一目录）：

```
{name}.py         # Python 脚本  ← 包含工具实现
{name}.ps1        # PowerShell 脚本  ← 包含工具实现
{name}.tool.json  # 已解析的工具定义（由框架生成/缓存）
```

`{name}.tool.json` 是解析结果的持久化缓存，格式：

```json
{
    "type": "PythonModule",        // 或 "PowerShellModule"
    "name": "工具组名",
    "scriptPath": "相对路径",
    "tools": [ ...IToolDefinition[] ],  // OpenAI function spec 数组
    "rulePrompt": "工具组规则说明",
    "defaultPermissions": {
        "executionPolicy": "ask-once",
        "resultApprovalPolicy": "never"
    }
}
```

---

## Python 脚本规范

**位置规则文档**：`/src/func/gpt/tools/custom-program-tools/rule-custom-python-tool.md`

### 模块→ToolGroup 映射

| Python 元素 | 映射到 |
|------------|--------|
| 模块级 `__doc__` | `ToolGroup.rulePrompt` |
| 非 `_` 开头的公开函数 | `Tool.definition`（函数文档字符串解析为 description + params） |
| `_` 开头的函数 | 忽略（私有辅助函数） |

### 函数 docstring 格式

```python
def my_tool(param1: str, param2: int = 10) -> dict:
    """工具简介（解析为 function.description）

    详细说明...

    Args:
        param1 (str): 参数说明（必需）
        param2 (int): 参数说明，默认值 10（可选）
    """
```

Args 块解析为 JSON Schema `properties`；有默认值的参数不加入 `required`。

### 函数属性扩展

权限配置（挂在函数对象上）：

```python
my_tool.executionPolicy = "ask-always"   # 覆盖 defaultPermissions
my_tool.resultApprovalPolicy = "never"
```

格式化函数：

```python
my_tool.format = lambda result, args: f"结果：{result['key']}"
# 等价于 Tool.formatForLLM
```

---

## PowerShell 脚本规范

**位置规则文档**：`/src/func/gpt/tools/custom-program-tools/rule-custom-powershell-tool.md`

映射规则类似 Python，但使用 PowerShell 风格的文档注释和参数定义（`param()` 块 + `<# ... #>` 注释）。

---

## ParsedToolModule（`types.ts`）

```typescript
interface ParsedToolModule {
    scriptName: string;       // 文件名（不含扩展名）
    scriptPath: string;       // 脚本绝对路径
    toolJsonPath: string;     // .tool.json 绝对路径
    scriptType: 'python' | 'powershell';
    moduleData: {
        type: 'PythonModule' | 'PowerShellModule';
        name: string;
        scriptPath: string;
        tools: IToolDefinition[];
        rulePrompt?: string;
        defaultPermissions?: ToolPermission;
    };
    lastModified: number;     // 脚本文件修改时间（ms），用于智能缓存
}
```

---

## 解析与加载流程

### 智能加载（Smart Load）

`scanAllCustomScriptsWithSmartLoad()` 流程：

```
1. checkSyncIgnore()  ← 检查 .syncignore 配置
2. 并行扫描：
   scanPythonScriptsWithSmartLoad()
   scanPowerShellScriptsWithSmartLoad()
3. listToolJsonFiles() 获取所有 .tool.json 列表
4. 对每个 .tool.json:
   a. loadToolDefinition(jsonPath) 读取缓存
   b. 根据 type 确定脚本扩展名（.py / .ps1）
   c. fileExists(scriptPath) 检查脚本是否存在
   d. 构建 ParsedToolModule（含 lastModified）
```

**智能重解析规则**：
- 若脚本文件修改时间 > `.tool.json` 修改时间 → 重新解析脚本并更新 json
- 否则使用 json 缓存直接构建 ToolGroup（避免每次启动都调用 Python/PS1）

### 初次解析（ScriptParse）

当脚本被修改或 json 不存在时：

```
启动子进程运行脚本（Python/PowerShell）
→ 脚本输出 JSON 格式的 moduleData（type, name, tools, rulePrompt, defaultPermissions）
→ 框架保存到 {name}.tool.json
→ 基于 moduleData 构建 ParsedToolModule
```

解析逻辑分别在：
- `resolve/python.ts:scanPythonScriptsWithSmartLoad()`
- `resolve/powershell.ts:scanPowerShellScriptsWithSmartLoad()`

---

## ToolGroup 构建与注册

`createCustomScriptToolGroupsFromCache()` → `createToolGroupFromModule()` → `createToolsFromModule()`：

```typescript
// 每个 IToolDefinition → Tool
tool.execute = async (args) => {
    const executor = isPython ? executeCustomPythonTool : executeCustomPowerShellTool;
    return executor({ scriptPath, functionName: toolDef.function.name, args });
};
```

**执行时**（`execute/python.ts` / `execute/powershell.ts`）：
- 启动子进程，传入 `functionName` + `args` (JSON)
- 脚本运行对应函数并输出 JSON 结果
- 框架解析输出，构建 `ToolExecuteResult`

---

## 在 toolExecutorFactory 中的集成

```typescript
// index.ts
if (IS_IN_APP) {
    const groups = createCustomScriptToolGroupsFromCache();  // ← 同步，使用缓存
    for (const group of groups) {
        toolExecutor.registerToolGroup(group);
        // 应用 groupDefaults 持久化设置
        if (toolsManager().groupDefaults[group.name] !== undefined) {
            toolExecutor.toggleGroupEnabled(group.name, toolsManager().groupDefaults[group.name]);
        }
    }
}
```

**注意**：
- `toolExecutorFactory` 调用 `createCustomScriptToolGroupsFromCache()`（同步，直接用 `cachedModules`）
- `loadAndCacheCustomScriptTools()` 是异步的，由插件初始化时预加载（填充 `cachedModules`）
- 若未预加载，`cachedModules` 为空，则 `toolExecutorFactory` 不注册任何自定义工具
