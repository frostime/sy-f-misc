# file-utils.ps1
<#
.SYNOPSIS
文件操作工具集

.DESCRIPTION
提供常用的文件系统操作功能
#>

# TOOL_CONFIG: { "permissionLevel": "moderate", "requireResultApproval": true }

function Get-FilePreview {
    <#
    .SYNOPSIS
    预览文件内容

    .PARAMETER Path
    文件路径

    .PARAMETER Lines
    预览行数

    .PARAMETER Mode
    模式：head 从头部，tail 从尾部

    .OUTPUTS
    object 包含 content, totalLines, displayedLines 属性
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [int]$Lines = 50,

        [ValidateSet('head', 'tail')]
        [string]$Mode = 'head'
    )

    if (-not (Test-Path $Path)) {
        throw "文件不存在: $Path"
    }

    $allLines = Get-Content $Path
    $totalLines = $allLines.Count

    $content = switch ($Mode) {
        'head' { $allLines | Select-Object -First $Lines }
        'tail' { $allLines | Select-Object -Last $Lines }
    }

    @{
        content        = $content -join "`n"
        totalLines     = $totalLines
        displayedLines = $content.Count
        mode           = $Mode
    }
}

function Find-InFiles {
    <#
    .SYNOPSIS
    在文件中搜索内容

    .PARAMETER Path
    搜索路径

    .PARAMETER Pattern
    搜索模式（支持正则）

    .PARAMETER Include
    包含的文件模式，如 *.ts

    .PARAMETER Recurse
    是否递归搜索

    .OUTPUTS
    object[] 匹配结果数组
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Pattern,

        [string[]]$Include = @('*'),

        [switch]$Recurse
    )

    $params = @{
        Path    = $Path
        Include = $Include
    }
    if ($Recurse) { $params.Recurse = $true }

    Get-ChildItem @params -File | ForEach-Object {
        $file = $_
        Select-String -Path $file.FullName -Pattern $Pattern -ErrorAction SilentlyContinue | ForEach-Object {
            @{
                file    = $file.FullName
                line    = $_.LineNumber
                content = $_.Line.Trim()
                match   = $_.Matches[0].Value
            }
        }
    }
}

function Get-DirectoryTree {
    <#
    .SYNOPSIS
    获取目录树结构

    .PARAMETER Path
    目录路径

    .PARAMETER Depth
    递归深度

    .PARAMETER ExcludeDir
    排除的目录名

    .OUTPUTS
    object 树形结构对象
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [int]$Depth = 2,

        [string[]]$ExcludeDir = @('node_modules', '.git', 'dist', '__pycache__')
    )

    function Build-Tree {
        param([string]$CurrentPath, [int]$CurrentDepth)

        if ($CurrentDepth -gt $Depth) { return $null }

        $item = Get-Item $CurrentPath
        $node = @{
            name = $item.Name
            type = if ($item.PSIsContainer) { 'directory' } else { 'file' }
        }

        if (-not $item.PSIsContainer) {
            $node.size = $item.Length
            return $node
        }

        if ($ExcludeDir -contains $item.Name) {
            $node.excluded = $true
            return $node
        }

        $children = Get-ChildItem $CurrentPath -ErrorAction SilentlyContinue | ForEach-Object {
            Build-Tree -CurrentPath $_.FullName -CurrentDepth ($CurrentDepth + 1)
        } | Where-Object { $_ }

        if ($children) {
            $node.children = @($children)
        }

        return $node
    }

    Build-Tree -CurrentPath $Path -CurrentDepth 0
}