## 任务：编写 ps1 脚本工具组

编写的 powershell script 脚本会被解析为一套 LLM 工具组，给大模型作为工具调用来源。
故此，请严格遵循下列规范。

```ts
/**
 * 工具对象
 * execute --> format --> truncate --> LLM 模型
 */
export interface Tool {
    definition: IToolDefinition;  // Openai Tool Definition with JSON Schema
    permission: ToolPermission;
}

export interface ToolGroup {
    name: string;
    tools: Tool[];
    /**
     * 工具组的规则提示
     */
    rulePrompt: string;
}
```

**重点规则**

- 顶部文档说明会被解析为工具组的 Rule Prompt
- 所有非私有函数 (不以 `Internal`, `_` `Format` 开头的函数)，会被解析为 Tool，函数的内部文档，会被解析为 definition

## PowerShell 自定义工具脚本规范

### 基本结构

```powershell
<#
.SYNOPSIS
模块级简介，用作工具组的 rulePrompt

.DESCRIPTION
模块的详细说明
#>

# TOOL_CONFIG: { "executionPolicy": "ask-once", "resultApprovalPolicy": "always" }
# executionPolicy : auto | ask-once | ask-always
# resultApprovalPolicy: never | on-error | always

function Get-MyTool {
    <#
    .SYNOPSIS
    工具简介（必需）

    .DESCRIPTION
    详细说明工具的功能和用途

    .PARAMETER Param1
    第一个参数说明（必需）

    .PARAMETER Param2
    第二个参数说明，默认值 10（可选）

    .OUTPUTS
    hashtable 返回值说明
        包含 key1 (string), key2 (int) 字段
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Param1,

        [int]$Param2 = 10,

        [ValidateSet('option1', 'option2')]
        [string]$Mode = 'option1'
    )

    return @{
        key1 = "value"
        key2 = $Param2
    }
}

# 🆕 格式化函数（可选）
# 约定：Format-{FunctionName} 会被自动识别
function Format-Get-MyTool {
    param(
        [hashtable]$Result,     # 工具返回的结果
        [hashtable]$Arguments   # 调用时传入的参数
    )

    return "工具返回: key1=$($Result.key1), key2=$($Result.key2)"
}
```

### 返回值要求

✅ **支持的类型**：`string`, `int`, `double`, `bool`, `hashtable`, `array`, `$null`

✅ **推荐**：使用 `hashtable` (`@{}`) 返回结构化数据

### 格式化机制

当工具返回复杂的结构化数据时，可以定义 `Format-{FunctionName}` 函数：

```powershell
function Get-FileStats {
    param([string]$Path)

    $file = Get-Item $Path
    return @{
        path = $file.FullName
        size = $file.Length
        lastModified = $file.LastWriteTime
    }
}

# 格式化函数（约定命名）
function Format-Get-FileStats {
    param(
        [hashtable]$Result,
        [hashtable]$Arguments
    )

    $sizeMB = [math]::Round($Result.size / 1MB, 2)
    return "文件 $($Result.path) 大小 $sizeMB MB，最后修改于 $($Result.lastModified)"
}
```

**执行流程**：
```
工具返回 → @{ path = "C:\\file.txt", size = 1024, ... }
         ↓ (Format-Get-FileStats)
格式化文本 → "文件 C:\\file.txt 大小 0.001 MB，..."
         ↓
返回给 LLM
```

### 关键要点

- `[CmdletBinding()]` 启用高级函数特性
- `[Parameter(Mandatory=$true)]` 标记必需参数
- `[ValidateSet()]` 定义枚举值
- `.OUTPUTS` 描述返回值结构
- `# TOOL_CONFIG:` 配置模块级权限
- `Format-{FunctionName}` 定义格式化函数
