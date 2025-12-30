<#
.SYNOPSIS
将 PowerShell 脚本解析为 Tool 定义 JSON

.PARAMETER Files
要处理的 PowerShell 文件列表

.PARAMETER Dir
要处理的目录

.PARAMETER WithMtime
是否在 JSON 中存储修改时间
#>
[CmdletBinding()]
param(
    [string[]]$Files,
    [string]$Dir,
    [switch]$WithMtime
)

$ErrorActionPreference = 'Stop'

function ConvertTo-JsonSchemaType {
    param([Type]$Type)

    switch ($Type.Name) {
        'Int32' { 'integer' }
        'Int64' { 'integer' }
        'Double' { 'number' }
        'Single' { 'number' }
        'Boolean' { 'boolean' }
        'SwitchParameter' { 'boolean' }
        'String[]' { 'array' }
        'Object[]' { 'array' }
        'Hashtable' { 'object' }
        default { 'string' }
    }
}

function Get-ParameterDescription {
    param(
        [System.Management.Automation.Language.FunctionDefinitionAst]$FunctionAst,
        [string]$ParameterName
    )

    # 从 Comment-Based Help 中提取参数描述
    $helpContent = $FunctionAst.GetHelpContent()
    if ($helpContent -and $helpContent.Parameters) {
        $paramHelp = $helpContent.Parameters[$ParameterName]
        if ($paramHelp) {
            return ($paramHelp -join ' ').Trim()
        }
    }
    return ''
}

function Get-OutputType {
    param([System.Management.Automation.Language.FunctionDefinitionAst]$FunctionAst)

    $helpContent = $FunctionAst.GetHelpContent()
    if ($helpContent -and $helpContent.Outputs) {
        $outputText = ($helpContent.Outputs -join ' ').Trim()
        # 尝试解析 "type description" 格式
        if ($outputText -match '^(\S+)\s+(.+)$') {
            return @{
                type = $Matches[1]
                note = $Matches[2]
            }
        }
        return @{ type = $outputText }
    }
    return $null
}

function Parse-FunctionDefinition {
    param([System.Management.Automation.Language.FunctionDefinitionAst]$FunctionAst)

    $funcName = $FunctionAst.Name

    # 跳过私有函数
    if ($funcName -like '_*' -or $funcName -like 'Internal-*') {
        return $null
    }

    # 🆕 跳过格式化函数（约定：Format-* 用于格式化工具返回值）
    if ($funcName -like 'Format-*') {
        Write-Host "  > 跳过格式化函数: $funcName()" -ForegroundColor DarkGray
        return $null
    }

    # 获取 Help 内容
    $helpContent = $FunctionAst.GetHelpContent()
    $description = ''
    if ($helpContent) {
        $description = $helpContent.Synopsis
        if ($helpContent.Description) {
            $description += "`n" + ($helpContent.Description -join "`n")
        }
    }

    # 构建参数 schema
    $properties = @{}
    $required = @()

    $paramBlock = $FunctionAst.Body.ParamBlock
    if ($paramBlock) {
        foreach ($param in $paramBlock.Parameters) {
            $paramName = $param.Name.VariablePath.UserPath
            $paramType = 'string'
            $paramDescription = Get-ParameterDescription -FunctionAst $FunctionAst -ParameterName $paramName
            $enumValues = $null
            $defaultValue = $null

            # 获取类型
            foreach ($attr in $param.Attributes) {
                if ($attr.TypeName.GetReflectionType()) {
                    $paramType = ConvertTo-JsonSchemaType -Type $attr.TypeName.GetReflectionType()
                }

                # 检查 ValidateSet（转为 enum）
                if ($attr.TypeName.Name -eq 'ValidateSet') {
                    $enumValues = $attr.PositionalArguments | ForEach-Object {
                        $_.SafeGetValue()
                    }
                }

                # 检查 Mandatory
                if ($attr.TypeName.Name -eq 'Parameter') {
                    foreach ($namedArg in $attr.NamedArguments) {
                        if ($namedArg.ArgumentName -eq 'Mandatory') {
                            $isMandatory = $namedArg.Argument.SafeGetValue()
                            if ($isMandatory) {
                                $required += $paramName
                            }
                        }
                    }
                }
            }

            # 获取默认值
            if ($param.DefaultValue) {
                try {
                    $defaultValue = $param.DefaultValue.SafeGetValue()
                }
                catch {
                    # 复杂表达式无法静态求值，忽略
                }
            }

            # 构建参数 schema
            $paramSchema = @{
                type        = $paramType
                description = $paramDescription
            }

            if ($enumValues) {
                $paramSchema.enum = $enumValues
            }

            if ($null -ne $defaultValue) {
                $paramSchema.default = $defaultValue
            }

            $properties[$paramName] = $paramSchema
        }
    }

    # 构建工具定义
    $tool = @{
        type     = 'function'
        function = @{
            name        = $funcName
            description = $description.Trim()
            parameters  = @{
                type       = 'object'
                properties = $properties
            }
        }
    }

    if ($required.Count -gt 0) {
        $tool.function.parameters.required = $required
    }

    # 添加返回类型
    $outputType = Get-OutputType -FunctionAst $FunctionAst
    if ($outputType) {
        $tool.declaredReturnType = $outputType
    }

    return $tool
}

function Parse-ScriptFile {
    param([string]$FilePath)

    $resolvedPath = Resolve-Path $FilePath -ErrorAction Stop
    $content = Get-Content $resolvedPath -Raw -Encoding UTF8

    # 解析 AST
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        $resolvedPath,
        [ref]$tokens,
        [ref]$errors
    )

    if ($errors.Count -gt 0) {
        Write-Warning "解析 $FilePath 时发现 $($errors.Count) 个错误"
    }

    # 获取模块级 Help
    $moduleHelp = ''
    $scriptBlockAst = $ast
    if ($scriptBlockAst.GetHelpContent()) {
        $helpContent = $scriptBlockAst.GetHelpContent()
        $moduleHelp = $helpContent.Synopsis
        if ($helpContent.Description) {
            $moduleHelp += "`n" + ($helpContent.Description -join "`n")
        }
    }

    # 查找所有函数
    $functions = $ast.FindAll({
            $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst]
        }, $false)  # $false = 不递归进入嵌套函数

    $tools = @()
    foreach ($func in $functions) {
        $tool = Parse-FunctionDefinition -FunctionAst $func
        if ($tool) {
            $tools += $tool
            Write-Host "  > 解析函数: $($func.Name)()" -ForegroundColor Gray
        }
    }

    # 查找权限配置注释
    $permissionConfig = @{}
    if ($content -match '#\s*TOOL_CONFIG:\s*(\{.+?\})') {
        try {
            $config = $Matches[1] | ConvertFrom-Json
            if ($config.permissionLevel) {
                $permissionConfig.permissionLevel = $config.permissionLevel
            }
            if ($null -ne $config.requireExecutionApproval) {
                $permissionConfig.requireExecutionApproval = $config.requireExecutionApproval
            }
            if ($null -ne $config.requireResultApproval) {
                $permissionConfig.requireResultApproval = $config.requireResultApproval
            }
        }
        catch {
            Write-Warning "解析 TOOL_CONFIG 失败: $_"
        }
    }

    # 构建输出
    $result = @{
        type       = 'PowerShellModule'
        name       = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
        scriptPath = $resolvedPath.Path
        tools      = $tools
        rulePrompt = $moduleHelp.Trim()
    }

    # 合并权限配置
    if ($permissionConfig.Count -gt 0) {
        $result.defaultPermissions = $permissionConfig
    }

    return $result
}

# ==================== 主逻辑 ====================

$filesToProcess = @()

if ($Files) {
    $filesToProcess += $Files
}

if ($Dir) {
    $dirPath = Resolve-Path $Dir -ErrorAction Stop
    $psFiles = Get-ChildItem -Path $dirPath -Filter '*.ps1' -File |
    Where-Object { -not $_.Name.StartsWith('_') }
    $filesToProcess += $psFiles.FullName
}

if ($filesToProcess.Count -eq 0) {
    Write-Error "未指定要处理的文件。使用 -Files 或 -Dir 参数。"
    exit 1
}

foreach ($file in $filesToProcess) {
    $filePath = Resolve-Path $file -ErrorAction SilentlyContinue
    if (-not $filePath) {
        Write-Warning "文件不存在，跳过: $file"
        continue
    }

    Write-Host "--- 正在处理: $(Split-Path $filePath -Leaf) ---" -ForegroundColor Cyan

    try {
        $result = Parse-ScriptFile -FilePath $filePath

        # 添加修改时间
        if ($WithMtime) {
            $mtime = (Get-Item $filePath).LastWriteTimeUtc
            $result.lastModified = [long]($mtime - [datetime]'1970-01-01').TotalMilliseconds
        }

        # 写入 JSON
        $jsonPath = [System.IO.Path]::ChangeExtension($filePath, '.tool.json')
        $result | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonPath -Encoding UTF8

        Write-Host "  ✅ 成功生成: $(Split-Path $jsonPath -Leaf)" -ForegroundColor Green
        Write-Host "     - 模块: $($result.name)"
        Write-Host "     - 工具数量: $($result.tools.Count)"

    }
    catch {
        Write-Error "处理 $file 失败: $_"
    }
}
