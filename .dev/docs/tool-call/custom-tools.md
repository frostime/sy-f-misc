---
name: 自定义脚本工具（custom-program-tools）
description: Python/PowerShell 自定义工具的解析、缓存加载与注册机制
updated: 2026-10-31
scope:
  - /src/func/gpt/tools/custom-program-tools/**
deprecated: false
---

# 自定义脚本工具（custom-program-tools）

**仅桌面端可用**（`IS_IN_APP` 检查），需本地安装 Python 或 PowerShell。

脚本如何编写成工具，权威规范在模型侧规则文档里（开发者写脚本规范时也以它们为准，勿在本文转述）：

| 脚本类型 | 规范文档 |
|---|---|
| Python | `src/func/gpt/tools/custom-program-tools/rule-custom-python-tool.md` |
| PowerShell | `src/func/gpt/tools/custom-program-tools/rule-custom-powershell-tool.md` |

核心合同（两份规范文档共同覆盖）：模块 `__doc__` → `rulePrompt`；非 `_` 开头函数 → `Tool.definition`；函数挂 `executionPolicy` / `resultApprovalPolicy` / `format` 扩展属性。

## 文件对结构

```
{name}.py|.ps1     # 脚本本体
{name}.tool.json   # 解析结果缓存（框架生成）
```

`.tool.json` 内容：`type`（`PythonModule` / `PowerShellModule`）、`name`、`scriptPath`、`tools[]`（IToolDefinition）、`rulePrompt?`、`defaultPermissions?`。

## ParsedToolModule（`types.ts`）

解析中间产物：`scriptName` / `scriptPath` / `toolJsonPath` / `scriptType`（`python` | `powershell`）/ `moduleData` / `lastModified`（脚本 mtime，用于缓存判断）。

## 解析与加载

### 智能加载（Smart Load，`scanAllCustomScriptsWithSmartLoad()`）

1. `checkSyncIgnore()` — 检查 `.syncignore`；
2. 并行扫描 Python 与 PowerShell 脚本目录；
3. `listToolJsonFiles()` 列出全部缓存；对每份缓存：读取 → 按 `type` 确定脚本扩展名 → 校验脚本文件存在 → 构建模块。

**重解析规则**：脚本 mtime > `.tool.json` mtime 才重新解析，否则直接用缓存构建 ToolGroup（避免每次启动起子进程）。

### 初次解析（ScriptParse）

脚本被修改或缓存不存在时：启动子进程运行脚本 → 脚本输出 JSON `moduleData` → 框架写入 `{name}.tool.json`。解析逻辑在：

- `resolve/python.ts`（`scanPythonScriptsWithSmartLoad()`）
- `resolve/powershell.ts`（`scanPowerShellScriptsWithSmartLoad()`）

## ToolGroup 构建、执行与注册

`createCustomScriptToolGroupsFromCache()` → 每个 `IToolDefinition` 的 `execute` 绑定 `executeCustomPythonTool` / `executeCustomPowerShellTool`：执行时启动子进程传入 `functionName` + JSON args，框架解析脚本输出为 `ToolExecuteResult`。

在 `toolExecutorFactory` 中：`IS_IN_APP` 时同步调用 `createCustomScriptToolGroupsFromCache()`（只读 `cachedModules` 现状），逐组注册并应用 `toolsManager().groupDefaults`。异步的 `loadAndCacheCustomScriptTools()` 由插件初始化时预加载填充缓存；若未预加载完成，工厂数为空、自定义工具组不出现，本次启动不等待。
